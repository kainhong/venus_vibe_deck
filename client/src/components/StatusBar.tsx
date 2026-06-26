import { useEffect, useRef, useState } from 'react';
import type { SessionInfo } from '../types';
import linkIcon from '../asserts/icons/link.svg';
import linkBrokenIcon from '../asserts/icons/unlink.svg';

const SESSION_ID_LEN = 8;

interface StatusBarProps {
  connected: boolean;
  sessions: SessionInfo[];
  currentSessionId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onAbout: () => void;
  onCloseCurrent: () => void;
  bellActive?: boolean;
}

/**
 * 顶部状态栏:连接状态 + Session 下拉 + 常用会话操作。
 */
export function StatusBar({ connected, sessions, currentSessionId, onSelect, onNew, onHistory, onSettings, onAbout, onCloseCurrent, bellActive = false }: StatusBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  return (
    <header className="status-bar">
      <img className={`status-link ${currentSessionId ? 'on' : 'off'}${bellActive ? ' bell' : ''}`} src={currentSessionId ? linkIcon : linkBrokenIcon} alt="" aria-hidden />

      <select
        className="session-select"
        value={currentSessionId ?? ''}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value);
        }}
        disabled={!connected || sessions.length === 0}
      >
        {sessions.length === 0 && <option value="">未创建会话</option>}
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {formatSessionLabel(s)} {s.alive ? '' : '(已退出)'}
          </option>
        ))}
      </select>

      <div className="header-actions" aria-label="会话操作">
        <button type="button" className="header-btn primary" onClick={onNew} aria-label="新建会话" disabled={!connected}>
          +
        </button>
        <button type="button" className="header-btn danger" onClick={onCloseCurrent} aria-label="关闭当前会话" disabled={!currentSessionId}>
          ×
        </button>
        <button type="button" className="header-btn" onClick={onHistory} aria-label="历史会话">
          ↺
        </button>
        <div className="header-menu-wrap" ref={menuRef}>
          <button type="button" className="header-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="更多">
            ⋯
          </button>
          {menuOpen && (
            <div className="header-menu">
              <button type="button" className="header-menu-item" onClick={() => { setMenuOpen(false); onSettings(); }}>
                设置
              </button>
              <button type="button" className="header-menu-item" onClick={() => { setMenuOpen(false); onAbout(); }}>
                关于
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function formatSessionLabel(session: SessionInfo): string {
  const shortId = session.id.slice(0, SESSION_ID_LEN);
  return session.name.endsWith(`-${shortId}`) ? session.name : `${session.name}-${shortId}`;
}
