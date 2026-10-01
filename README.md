# AgentChat

IM 形态的多 Agent 对话平台。像微信一样把每个智能体当作一个"联系人"，可以配置人格、能力、知识库，并保留长期记忆。

内置自研 Agent 内核（ReAct 循环 + 工具体系 + 韧性 + RAG + 长期记忆），**不依赖外部 Agent 框架，也不依赖同级的 AI-Agent-Node 项目**，可独立部署。

---

## 快速开始

要求 Node.js >= 22。

```bash
# 1. 安装依赖（npm workspaces，一次装齐前后端）
npm install

# 2. 配置后端环境变量
cp server/.env.example server/.env
# 编辑 server/.env，至少填入 LLM_API_KEY

# 3. 启动（前端 5173，后端 4000）
npm run dev
```

打开 http://localhost:5173 注册账号即可使用。

其它命令：

```bash
npm run typecheck   # 前后端类型检查
npm run build       # 前后端生产构建
npm start           # 运行已构建的后端
```

### 模型配置

所有服务商都走 OpenAI 兼容协议，只需切 `LLM_PROVIDER` 与 `LLM_API_KEY`：

| provider | 默认主模型 | 说明 |
| --- | --- | --- |
| `siliconflow` | `Qwen/Qwen3-8B` | 默认 |
| `dashscope` | `qwen-plus` | 阿里百炼兼容模式 |
| `openai` | `gpt-4o-mini` | |
| `deepseek` | `deepseek-chat` | |

> **主模型必须具备可靠的 function calling 能力。** 7B 及以下的小模型经常把工具调用写成正文 JSON，导致工具不被真正执行。`LLM_FAST_MODEL` 只用于摘要与记忆抽取，可以用小模型。

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  web/  React 19 + Vite + zustand                        │
│  features/{auth,chat,contacts,agents}  按域组织          │
│  shared/{api,store,types,lib}          跨域基建          │
└───────────────────────┬─────────────────────────────────┘
                        │ REST + SSE（事件协议与内核同构）
┌───────────────────────▼─────────────────────────────────┐
│  http/          路由适配、鉴权、校验、SSE、错误映射       │
├─────────────────────────────────────────────────────────┤
│  modules/       业务域：auth / agents / conversations     │
│                        knowledge / persona               │
│                 每域 routes + service + repo + schema     │
├─────────────────────────────────────────────────────────┤
│  runtime/       多 Agent 运行时池 + 配置装配              │
├─────────────────────────────────────────────────────────┤
│  capabilities/  能力注册表（工具 + 技能，单一数据源）      │
├─────────────────────────────────────────────────────────┤
│  core/          Agent 内核                               │
│                 agent(ReAct 循环) / llm / prompt          │
│                 context / memory / session / resilience   │
├─────────────────────────────────────────────────────────┤
│  db/ shared/ config/   SQLite、日志、错误、环境变量        │
└─────────────────────────────────────────────────────────┘
```

依赖方向严格单向：`http → modules → runtime → capabilities → core`。内核不认识 Express，也不认识 SQLite。

### 一次对话的完整链路

```
POST /api/v1/conversations/:id/messages
  → routes      建立 SSE 通道，绑定客户端断开信号
  → service     校验归属 → 落库用户消息 → 派生 sessionId → 取运行时
  → pool        按 agentId 复用/重建内核实例（配置或知识库变更自动失效）
  → agent       ReAct 循环：
                  知识预检索 → 上下文压缩 → 流式调模型
                  → 有 tool_calls？ 执行工具（校验/熔断/超时/去重）→ 回喂结果 → 继续
                  → 无 tool_calls？ 输出答案
  → service     落库助手消息 + 工具轨迹
  → memory      每 N 轮旁路抽取长期记忆（失败不影响主链路）
```

---

## 能力体系

**工具（Tool）** 会真实执行动作，参数用 zod 声明，自动转 JSON Schema 给模型：

| 工具 | 说明 |
| --- | --- |
| `search_knowledge` | 检索该 Agent 挂载的知识库 |
| `current_datetime` | 获取真实时间（模型没有时钟） |
| `calculate` | 精确计算，递归下降解析器实现，**不使用 eval** |
| `fetch_webpage` | 读取网页正文，带完整 SSRF 防护 |

**技能（Skill）** 是"专家人格 + 方法论 + 输出结构"的提示词包，不占用 function call 名额：
`code_review`、`debug_assistant`、`doc_writer`、`data_analyst`、`decision_helper`、`teacher`、`translator`、`researcher`。

### 扩展一个工具

在 `server/src/capabilities/tools/` 新建文件，然后加进 `registry.ts` 的 `TOOLS` 数组——前端勾选清单、系统提示词、运行时装配会自动跟上，无需改其它地方：

```ts
export const myTool = defineTool({
  name: 'my_tool',
  label: '我的工具',              // 前端展示的中文名
  description: '给模型看的用途说明',
  guidance: '什么时候该用它',      // 会注入系统提示词
  risky: false,                   // 高危能力标记
  schema: z.object({
    keyword: z.string().describe('参数说明'),
  }),
  async execute(args, ctx) {
    // ctx 提供 sessionId / signal / retriever / llm / logger
    return { ok: true, data: {}, summary: '一句话结果' };
  },
});
```

---

## 目录结构

```
agentchat/
├── package.json              npm workspaces 根
├── server/
│   ├── src/
│   │   ├── main.ts           进程入口（优雅关闭）
│   │   ├── app.ts            Express 组装
│   │   ├── config/env.ts     环境变量（zod 校验，唯一读 process.env 处）
│   │   ├── shared/           errors / logger / ids
│   │   ├── core/             Agent 内核
│   │   ├── capabilities/     tools / skills / registry
│   │   ├── modules/          业务域
│   │   ├── runtime/          pool / assembler
│   │   ├── http/             middleware / sse
│   │   └── db/               连接 + 版本化迁移
│   └── data/                 SQLite、长期记忆（不入库）
└── web/
    └── src/
        ├── shared/           api / store / types / lib
        ├── features/         按域的页面与组件
        ├── components/       跨域通用组件
        └── styles/           按域拆分的样式
```

---

## 关键设计决策

重构时修正的问题，记录原因以免回退：

| 决策 | 原因 |
| --- | --- |
| 直连 OpenAI 兼容 SDK，不用 LangChain | 目标服务商全是 OpenAI 协议，直连少 4 个依赖包、类型更准，`reasoning_content` 这类非标字段无需 hack |
| 工具参数用 zod 命名参数 | 位置参数（`arg1/arg2`）让模型靠顺序猜参数名，极易错调 |
| 工具依赖通过 `ToolContext` 注入 | 全局单例（如共享的 LLM 实例）在多 Agent 下会互相覆盖 |
| 工具默认不重试 | 工具可能有副作用（发信、写文件），无条件重试会重复执行；只有显式 `retryable` 才重试 |
| 上下文按"回合"裁剪 | 按条数直接切会切断 `assistant(tool_calls)` 与 `tool` 消息的配对，上游会返回 400 |
| 重复工具调用短路 | 模型（尤其 thinking 类）容易用相同参数反复调同一工具；命中缓存即复用并提示收敛 |
| 迭代上限不抛错 | 到上限时撤掉工具让模型收尾，用户能拿到有效回答而不是"服务繁忙" |
| 提示词由能力元数据生成 | 硬编码几十条业务规则会让纯聊天 Agent 也吃到文件操作规则，且改能力得回来改提示词 |
| 技能不是 function call | 技能做成工具会与真工具争抢调用、参数错配；本质上它是提示词包 |
| 能力注册表是唯一数据源 | 清单、高危标记、提示词、运行时装配曾各维护一份，改一处忘一处就漂移 |
| `sessionId` 服务端派生 | 采信客户端传值等于允许越权读取他人上下文与长期记忆 |
| 向量检索用内存余弦 | 单 Agent 知识库通常千级切片，暴力余弦是毫秒级；避免 `faiss-node` 的跨平台编译成本 |

---

## 安全说明

- **密钥**：只从环境变量读取，不落库、不回显、不进日志（日志对敏感字段自动脱敏）。生产环境 JWT 密钥强度不足会**拒绝启动**；开发环境自动生成强随机密钥并存 `data/.dev-secrets.json`。
- **口令**：argon2id 哈希；登录失败走等时校验，消除"用户是否存在"的时序侧信道。
- **越权**：所有 SQL 强制带 `owner_id` 条件——即便上层漏了校验，数据层也查不到别人的数据。
- **SSRF**：`fetch_webpage` 校验 DNS 解析出的每个 IP，拦截环回/私有/链路本地/保留网段（含 `9.*` `11.*` `21.*` `30.*`），重定向每一跳重新校验，并限制响应体大小与内容类型。默认禁止内网访问。
- **RCE**：计算器用自研解析器，不使用 `eval` / `new Function`。
- **提示词注入**：用户上传的语料、抓取的网页均视为不可信数据，用显式分隔标记包裹并声明"仅为数据"。
- **上传**：仅接受文本类扩展名，内存存储不落盘，含二进制探测与文件名净化。
- **其它**：helmet、CORS 白名单、全局与认证接口双层限流、请求体大小限制、SQL 全部参数绑定。

> `server/data/` 存放 SQLite 与长期记忆，已在 `.gitignore` 中排除，请勿提交。
