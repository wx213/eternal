/**
 * 计算器工具
 *
 * 安全要点：绝不使用 eval / new Function 求值（那等于把 RCE 入口交给模型输出）。
 * 这里实现一个递归下降解析器，只认数字、四则运算、幂、取模、括号和白名单函数。
 */
import { z } from 'zod';
import { defineTool } from '../../core/agent.js';

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: (value) => Math.round(value),
  sqrt: Math.sqrt,
  ln: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i]!;

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let literal = '';
      while (i < input.length && /[0-9._]/.test(input[i]!)) {
        if (input[i] !== '_') literal += input[i];
        i += 1;
      }
      // 支持科学计数法 1e3 / 2.5e-4
      if (input[i] === 'e' || input[i] === 'E') {
        const next = input[i + 1];
        const afterSign = input[i + 2];
        if (/[0-9]/.test(next ?? '') || ((next === '+' || next === '-') && /[0-9]/.test(afterSign ?? ''))) {
          literal += 'e';
          i += 1;
          if (input[i] === '+' || input[i] === '-') {
            literal += input[i];
            i += 1;
          }
          while (i < input.length && /[0-9]/.test(input[i]!)) {
            literal += input[i];
            i += 1;
          }
        }
      }
      const value = Number(literal);
      if (!Number.isFinite(value)) throw new Error(`无法解析的数字「${literal}」`);
      tokens.push({ kind: 'number', value });
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      let name = '';
      while (i < input.length && /[a-zA-Z0-9]/.test(input[i]!)) {
        name += input[i];
        i += 1;
      }
      tokens.push({ kind: 'ident', value: name.toLowerCase() });
      continue;
    }

    if ('+-*/%^(),'.includes(char)) {
      tokens.push({ kind: 'op', value: char });
      i += 1;
      continue;
    }

    throw new Error(`表达式包含不支持的字符「${char}」`);
  }

  return tokens;
}

/**
 * 语法（优先级由低到高）：
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/' | '%') unary)*
 *   unary  := ('+' | '-') unary | power
 *   power  := atom ('^' unary)?      // 右结合
 *   atom   := number | const | func '(' args ')' | '(' expr ')'
 */
class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.expr();
    if (this.pos < this.tokens.length) {
      throw new Error('表达式结构不完整或有多余内容');
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eatOp(...candidates: string[]): string | null {
    const token = this.peek();
    if (token?.kind === 'op' && candidates.includes(token.value)) {
      this.pos += 1;
      return token.value;
    }
    return null;
  }

  private expect(op: string): void {
    if (!this.eatOp(op)) throw new Error(`缺少「${op}」`);
  }

  private expr(): number {
    let left = this.term();
    for (;;) {
      const op = this.eatOp('+', '-');
      if (!op) return left;
      const right = this.term();
      left = op === '+' ? left + right : left - right;
    }
  }

  private term(): number {
    let left = this.unary();
    for (;;) {
      const op = this.eatOp('*', '/', '%');
      if (!op) return left;
      const right = this.unary();
      if ((op === '/' || op === '%') && right === 0) throw new Error('除数不能为 0');
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
  }

  private unary(): number {
    const op = this.eatOp('+', '-');
    if (op) {
      const value = this.unary();
      return op === '-' ? -value : value;
    }
    return this.power();
  }

  private power(): number {
    const base = this.atom();
    if (this.eatOp('^')) {
      return base ** this.unary();
    }
    return base;
  }

  private atom(): number {
    const token = this.peek();
    if (!token) throw new Error('表达式意外结束');

    if (token.kind === 'number') {
      this.pos += 1;
      return token.value;
    }

    if (token.kind === 'ident') {
      this.pos += 1;
      const name = token.value;

      if (this.peek()?.kind === 'op' && (this.peek() as { value: string }).value === '(') {
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`不支持的函数「${name}」`);
        this.expect('(');
        const args: number[] = [];
        if (!(this.peek()?.kind === 'op' && (this.peek() as { value: string }).value === ')')) {
          args.push(this.expr());
          while (this.eatOp(',')) args.push(this.expr());
        }
        this.expect(')');
        return fn(...args);
      }

      const constant = CONSTANTS[name];
      if (constant === undefined) throw new Error(`未知标识符「${name}」`);
      return constant;
    }

    if (token.value === '(') {
      this.pos += 1;
      const value = this.expr();
      this.expect(')');
      return value;
    }

    throw new Error(`意外的符号「${token.value}」`);
  }
}

const schema = z.object({
  expression: z
    .string()
    .min(1)
    .max(300)
    .describe('数学表达式，支持 + - * / % ^ 括号，以及 abs/sqrt/ln/log10/sin/cos/min/max/pow 等函数与 pi/e 常量'),
});

export const calculateTool = defineTool({
  name: 'calculate',
  label: '精确计算',
  description: '对数学表达式做精确求值',
  guidance: '涉及多步算术、百分比、开方、幂运算时使用，避免自己心算出错。',
  schema,
  async execute(args) {
    try {
      const result = new Parser(tokenize(args.expression)).parse();
      if (!Number.isFinite(result)) {
        return { ok: false, error: '计算结果不是有限数（可能溢出或除零）。' };
      }
      return {
        ok: true,
        data: { expression: args.expression, result },
        summary: `${args.expression} = ${result}`,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '表达式解析失败' };
    }
  },
});
