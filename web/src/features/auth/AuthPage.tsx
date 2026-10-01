import { useState } from 'react';
import { IconChat } from '../../components/Icons';
import { useAuthStore } from '../../shared/store';

type Mode = 'login' | 'register';

/** 与后端 zod 规则保持一致，避免提交后才报错 */
const MIN_PASSWORD_LENGTH = 8;

export default function AuthPage() {
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  const submit = async () => {
    if (loading) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('请填写邮箱和密码');
      return;
    }
    if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) {
      setError(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
      return;
    }

    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(trimmedEmail, password);
      } else {
        await register(trimmedEmail, password, displayName.trim() || undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') void submit();
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <IconChat size={26} />
        </div>
        <h1>AgentChat</h1>
        <div className="sub">和你的 AI 联系人们聊天</div>

        {error && <div className="auth-error">{error}</div>}

        {mode === 'register' && (
          <input
            placeholder="昵称（可选）"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            onKeyDown={onEnter}
          />
        )}
        <input
          type="email"
          autoComplete="email"
          placeholder="邮箱"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={onEnter}
        />
        <input
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={`密码（至少 ${MIN_PASSWORD_LENGTH} 位）`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={onEnter}
        />
        <button className="btn-primary" onClick={() => void submit()} disabled={loading}>
          {loading ? '请稍候…' : mode === 'login' ? '登录' : '注册'}
        </button>

        <div className="switch">
          {mode === 'login' ? (
            <>
              还没有账号？<a onClick={() => switchMode('register')}>去注册</a>
            </>
          ) : (
            <>
              已有账号？<a onClick={() => switchMode('login')}>去登录</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
