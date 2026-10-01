import { resetAll, useAuthStore, useUiStore } from '../shared/store';
import Avatar from './Avatar';
import { IconChat, IconContacts, IconLogout, IconMenu, IconPlus, IconSettings } from './Icons';

/** 左侧竖向导航栏 */
export default function RailNav() {
  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const user = useAuthStore((state) => state.user);

  const chatsActive = view === 'chats';
  const contactsActive = view === 'contacts';
  const createActive = view === 'create-agent' || view === 'import-chat' || view === 'configure-agent';

  return (
    <nav className="rail">
      <button className="rail-btn tinted" title="菜单" aria-label="菜单" disabled>
        <IconMenu />
      </button>

      <button
        className={`rail-btn ${chatsActive ? 'active' : ''}`}
        onClick={() => setView('chats')}
        title="聊天"
        aria-label="聊天"
        aria-current={chatsActive}
      >
        <IconChat />
      </button>

      <button
        className={`rail-btn ${contactsActive ? 'active' : ''}`}
        onClick={() => setView('contacts')}
        title="通讯录"
        aria-label="通讯录"
        aria-current={contactsActive}
      >
        <IconContacts />
      </button>

      <button
        className={`rail-btn ${createActive ? 'active' : 'primary'}`}
        onClick={() => setView('create-agent')}
        title="创建智能体"
        aria-label="创建智能体"
      >
        <IconPlus />
      </button>

      <div className="rail-spacer" />

      <button className="rail-btn" title="设置" aria-label="设置" disabled>
        <IconSettings />
      </button>

      <button className="rail-btn" onClick={resetAll} title="退出登录" aria-label="退出登录">
        <IconLogout />
      </button>

      <Avatar
        colorKey={user?.id ?? 'me'}
        name={user?.displayName ?? user?.email}
        size={44}
        fontSize={18}
        className="rail-avatar"
      />
    </nav>
  );
}
