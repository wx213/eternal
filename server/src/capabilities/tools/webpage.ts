/**
 * 网页读取工具
 *
 * ⚠ 这是唯一会主动发起外部请求的工具，必须严防 SSRF：
 * 1. 只允许 http / https，拒绝 URL 内嵌凭证
 * 2. 域名解析出的每一个 IP 都要校验，禁止环回 / 私有 / 链路本地 / 保留网段
 *    （含安全基线额外要求的 9.* 11.* 21.* 30.*）
 * 3. 重定向手动处理，每一跳都重新校验，避免"公网域名 302 到 169.254.169.254"绕过
 * 4. 限制响应体大小与内容类型，避免把二进制或超大页面灌进上下文
 * 内网访问默认关闭，仅在 ALLOW_INTERNAL_NETWORK=true 时放行（供私有化部署自担风险开启）。
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';
import { defineTool } from '../../core/agent.js';
import { env } from '../../config/env.js';

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const MAX_TEXT_LENGTH = 12_000;

const ALLOWED_CONTENT_TYPE = /^(text\/(html|plain|markdown)|application\/(json|xhtml\+xml))/i;

/** 把 IPv4 点分十进制转成 32 位整数，便于网段比较 */
function ipv4ToLong(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(range!) & mask);
}

/** 禁止访问的 IPv4 网段 */
const BLOCKED_V4 = [
  '0.0.0.0/8', // 本网络
  '10.0.0.0/8', // 私有
  '100.64.0.0/10', // 运营商级 NAT
  '127.0.0.0/8', // 环回
  '169.254.0.0/16', // 链路本地（含云元数据 169.254.169.254）
  '172.16.0.0/12', // 私有
  '192.0.0.0/24', // IETF 协议分配
  '192.168.0.0/16', // 私有
  '198.18.0.0/15', // 基准测试
  '224.0.0.0/4', // 组播
  '240.0.0.0/4', // 保留
  // 安全基线额外要求拦截的内部网段
  '9.0.0.0/8',
  '11.0.0.0/8',
  '21.0.0.0/8',
  '30.0.0.0/8',
];

function isBlockedIp(ip: string): boolean {
  // IPv4 映射地址 ::ffff:10.0.0.1 需要还原后判断
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  const target = mapped?.[1] ?? ip;

  if (net.isIPv4(target)) {
    return BLOCKED_V4.some((cidr) => inCidr(target, cidr));
  }

  const lower = target.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // fc00::/7 唯一本地地址、fe80::/10 链路本地
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (env.allowInternalNetwork) return;

  const literal = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(literal)) {
    if (isBlockedIp(literal)) throw new Error(`拒绝访问内网地址 ${literal}`);
    return;
  }

  if (/^localhost$/i.test(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new Error(`拒绝访问内部域名 ${hostname}`);
  }

  let records: { address: string }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`域名解析失败：${hostname}`);
  }

  if (records.length === 0) throw new Error(`域名解析为空：${hostname}`);

  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new Error(`域名 ${hostname} 解析到内网地址，已拒绝`);
    }
  }
}

function parseAndValidateUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('URL 格式不合法');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http 与 https 协议');
  }
  if (url.username || url.password) {
    throw new Error('URL 不允许携带用户名密码');
  }
  return url;
}

/** 手动跟随重定向，每一跳都做一次 SSRF 校验 */
async function fetchWithGuard(initial: URL, signal: AbortSignal): Promise<Response> {
  let current = initial;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(current.hostname);

    const response = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: {
        // 声明明确的 UA，便于目标站点识别与限流
        'User-Agent': 'AgentChat/1.0 (+https://github.com/agentchat)',
        Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.1',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`收到 ${response.status} 重定向但缺少 Location`);
      current = parseAndValidateUrl(new URL(location, current).toString());
      continue;
    }

    return response;
  }

  throw new Error(`重定向超过 ${MAX_REDIRECTS} 次，已终止`);
}

/** 读取响应体但不超过上限，防止超大页面打爆内存与上下文 */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const chunks: string[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    chunks.push(decoder.decode(value, { stream: true }));
    if (received >= MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  return chunks.join('');
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** 极简 HTML 正文抽取：够用且零依赖 */
function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';

  const text = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title: decodeEntities(title), text };
}

function decodeEntities(input: string): string {
  return input.replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

const schema = z.object({
  url: z.string().min(1).max(2000).describe('要读取的网页地址，必须是完整的 http/https URL'),
});

export const fetchWebpageTool = defineTool({
  name: 'fetch_webpage',
  label: '网页读取',
  description: '读取指定网页的正文内容',
  risky: true,
  guidance: '仅当用户明确给出链接、或需要核对某个具体网址的内容时使用；不要用它做搜索引擎。',
  schema,
  async execute(args, ctx) {
    try {
      const url = parseAndValidateUrl(args.url.trim());
      const response = await fetchWithGuard(url, ctx.signal);

      if (!response.ok) {
        return { ok: false, error: `目标站点返回 ${response.status}`, retryable: response.status >= 500 };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!ALLOWED_CONTENT_TYPE.test(contentType)) {
        return { ok: false, error: `不支持的内容类型：${contentType || '未知'}（仅支持网页与纯文本）` };
      }

      const raw = await readCapped(response);
      const isHtml = /html|xhtml/i.test(contentType);
      const { title, text } = isHtml ? htmlToText(raw) : { title: '', text: raw.trim() };

      if (!text) {
        return { ok: false, error: '页面没有可提取的文本内容（可能依赖前端渲染）。' };
      }

      const truncated = text.length > MAX_TEXT_LENGTH;

      return {
        ok: true,
        data: {
          url: response.url || url.toString(),
          title,
          truncated,
          content: truncated ? `${text.slice(0, MAX_TEXT_LENGTH)}\n…（内容已截断）` : text,
        },
        summary: title || `已读取 ${url.hostname}`,
      };
    } catch (error) {
      ctx.logger.warn('网页读取失败', { url: args.url, error });
      return { ok: false, error: error instanceof Error ? error.message : '网页读取失败' };
    }
  },
});
