import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, clearAuthToken, setAuthToken } from '../api/http';

interface AuthGateProps {
  children: ReactNode;
}

type AuthState = 'checking' | 'authenticated' | 'required';

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<AuthState>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const status = await api.getAuthStatus();
        if (disposed) return;
        if (!status.enabled || status.authenticated) {
          setState('authenticated');
        } else {
          clearAuthToken();
          setState('required');
        }
      } catch {
        if (!disposed) setState('required');
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = password.trim();
    if (!value) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.login(value);
      setAuthToken(result.token);
      setState('authenticated');
    } catch {
      clearAuthToken();
      setError('密码不正确');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'authenticated') return <>{children}</>;

  return (
    <div className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="auth-header">
          <h1>身份验证</h1>
          <p>请输入访问密码继续使用 Venus Vibe Deck。</p>
        </div>
        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={state === 'checking' || submitting}
            autoFocus
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={state === 'checking' || submitting || !password.trim()}>
          {state === 'checking' ? '检查中' : submitting ? '验证中' : '进入'}
        </button>
      </form>
    </div>
  );
}
