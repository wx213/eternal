import { nanoid } from 'nanoid';

/** 业务主键：URL 安全、无需协调、21 字符足够抗碰撞 */
export function newId(): string {
  return nanoid();
}

/**
 * 由 (userId, conversationId) 派生会话 ID。
 *
 * 安全要点：服务端单向派生，永不采信客户端传入的 sessionId，
 * 因此一个用户无法通过伪造 sessionId 读取到别人的上下文或长期记忆。
 */
export function deriveSessionId(userId: string, conversationId: string): string {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '');
  return `u${safe(userId)}c${safe(conversationId)}`;
}
