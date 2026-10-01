import { create } from 'zustand';

/** 主视图：聊天 / 通讯录 / 全屏流程页 */
export type View = 'chats' | 'contacts' | 'create-agent' | 'import-chat' | 'configure-agent';

export type ChatFilter = 'all' | 'persona';

interface UiState {
  view: View;
  /** 通讯录当前选中的 agent */
  activeContactId: string | null;
  chatFilter: ChatFilter;
  /** 列表搜索关键词（切换视图时重置） */
  keyword: string;

  setView: (view: View) => void;
  setActiveContactId: (id: string | null) => void;
  setChatFilter: (filter: ChatFilter) => void;
  setKeyword: (keyword: string) => void;
  reset: () => void;
}

const INITIAL = {
  view: 'chats' as View,
  activeContactId: null,
  chatFilter: 'all' as ChatFilter,
  keyword: '',
};

export const useUiStore = create<UiState>((set) => ({
  ...INITIAL,

  // 切换视图时清空搜索，避免上一个列表的关键词残留过滤掉新列表
  setView: (view) => set({ view, keyword: '' }),
  setActiveContactId: (activeContactId) => set({ activeContactId }),
  setChatFilter: (chatFilter) => set({ chatFilter }),
  setKeyword: (keyword) => set({ keyword }),
  reset: () => set(INITIAL),
}));
