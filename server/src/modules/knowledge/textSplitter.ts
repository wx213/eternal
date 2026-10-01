/**
 * 递归字符文本切分
 *
 * 自研而非引入 @langchain/textsplitters：逻辑只有几十行，自持可控且少一个依赖。
 * 思路与 RecursiveCharacterTextSplitter 一致——按语义强度从粗到细尝试分隔符，
 * 尽量在自然边界（段落 > 句子 > 短语）处断开，再回填重叠区保留上下文。
 */

const DEFAULT_SEPARATORS = ['\n\n', '\n', '。', '！', '？', '；', '. ', '! ', '? ', '; ', '，', ' ', ''];

export interface SplitOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

/** 用某个分隔符切分并保留分隔符（避免丢失标点） */
function splitKeepSeparator(text: string, separator: string): string[] {
  if (separator === '') return [...text];

  const parts = text.split(separator);
  return parts
    .map((part, index) => (index < parts.length - 1 ? part + separator : part))
    .filter((part) => part.length > 0);
}

function recursiveSplit(text: string, chunkSize: number, separators: string[]): string[] {
  if (text.length <= chunkSize) return text.length > 0 ? [text] : [];

  const [separator, ...rest] = separators;
  if (separator === undefined) {
    // 分隔符用尽，按长度硬切
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) pieces.push(text.slice(i, i + chunkSize));
    return pieces;
  }

  const segments = splitKeepSeparator(text, separator);

  // 该分隔符切不动（只有一段），换下一级
  if (segments.length <= 1) return recursiveSplit(text, chunkSize, rest);

  // 贪心合并相邻片段，尽量填满 chunkSize
  const chunks: string[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer) {
      chunks.push(buffer);
      buffer = '';
    }
  };

  for (const segment of segments) {
    if (segment.length > chunkSize) {
      flush();
      chunks.push(...recursiveSplit(segment, chunkSize, rest));
      continue;
    }
    if (buffer.length + segment.length > chunkSize) flush();
    buffer += segment;
  }
  flush();

  return chunks;
}

/** 给相邻切片补上重叠区，避免答案正好落在切分边界上 */
function applyOverlap(chunks: string[], overlap: number): string[] {
  if (overlap <= 0 || chunks.length <= 1) return chunks;

  return chunks.map((chunk, index) => {
    if (index === 0) return chunk;
    const previous = chunks[index - 1]!;
    return previous.slice(-overlap) + chunk;
  });
}

export function splitText(text: string, options: SplitOptions = {}): string[] {
  const chunkSize = Math.max(200, options.chunkSize ?? 1000);
  const chunkOverlap = Math.max(0, Math.min(options.chunkOverlap ?? 150, Math.floor(chunkSize / 2)));
  const separators = options.separators ?? DEFAULT_SEPARATORS;

  const normalized = text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  if (!normalized) return [];

  const chunks = recursiveSplit(normalized, chunkSize, separators)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return applyOverlap(chunks, chunkOverlap);
}
