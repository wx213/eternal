import { useAgentStore } from './agentStore';
import { useAuthStore } from './authStore';
import { useChatStore } from './chatStore';
import { useUiStore } from './uiStore';

export { useAgentStore } from './agentStore';
export { useAuthStore } from './authStore';
export { useChatStore } from './chatStore';
export { useUiStore, type View, type ChatFilter } from './uiStore';

/** 登录成功后统一加载业务数据 */
export async function loadWorkspace(): Promise<void> {
  await Promise.all([useAgentStore.getState().refresh(), useChatStore.getState().refreshConversations()]);
}

/** 退出登录：清掉所有域的状态，避免下一个账号看到残留数据 */
export function resetAll(): void {
  useAuthStore.getState().logout();
  useChatStore.getState().reset();
  useAgentStore.getState().reset();
  useUiStore.getState().reset();
}
