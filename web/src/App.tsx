import { useEffect } from 'react';
import { UNAUTHORIZED_EVENT } from './shared/api';
import { loadWorkspace, resetAll, useAuthStore, useUiStore } from './shared/store';
import RailNav from './components/RailNav';
import AuthPage from './features/auth/AuthPage';
import ChatListColumn from './features/chat/ChatListColumn';
import ChatWindow from './features/chat/ChatWindow';
import ContactListColumn from './features/contacts/ContactListColumn';
import ContactDetail from './features/contacts/ContactDetail';
import CreateAgentPage from './features/agents/CreateAgentPage';
import ImportChatPage from './features/agents/ImportChatPage';
import ConfigureAgentPage from './features/agents/ConfigureAgentPage';

export default function App() {
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const view = useUiStore((state) => state.view);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 登录态就绪后加载业务数据
  useEffect(() => {
    if (user) void loadWorkspace();
  }, [user]);

  // token 失效时由 api 层广播，这里统一回登录页
  useEffect(() => {
    const onUnauthorized = () => resetAll();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!ready) return <div className="fullscreen-tip">加载中…</div>;
  if (!user) return <AuthPage />;

  return (
    <div className="app-shell">
      <RailNav />
      {view === 'chats' && (
        <>
          <ChatListColumn />
          <ChatWindow />
        </>
      )}
      {view === 'contacts' && (
        <>
          <ContactListColumn />
          <ContactDetail />
        </>
      )}
      {view === 'create-agent' && <CreateAgentPage />}
      {view === 'import-chat' && <ImportChatPage />}
      {view === 'configure-agent' && <ConfigureAgentPage />}
    </div>
  );
}
