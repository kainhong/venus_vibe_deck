import { useEffect, useRef, useState } from 'react';
import type { SessionInfo } from '../types';

interface StatusBarProps {
  connected: boolean;
  sessions: SessionInfo[];
  currentSessionId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
  onCloseCurrent: () => void;
}

/**
 * 顶部状态栏:连接状态 + Session 下拉 + 菜单(新建/设置/关闭当前)。
 * 菜单点外部自动关闭。
 */
export function StatusBar({ connected, sessions, currentSessionId, onSelect, onNew, onSettings, onCloseCurrent }: StatusBarProps) {
  const current = sessions.find((s) => s.id === currentSessionId);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点菜单外部关闭
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
      <span className={`status-dot ${connected ? 'on' : 'off'}`} aria-hidden />
      <span className="status-text">{connected ? '已连接' : '断开'}</span>

      <select
        className="session-select"
        value={currentSessionId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        disabled={!connected}
      >
        {sessions.length === 0 && <option value="">无会话</option>}
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} {s.alive ? '' : '(已退出)'}
          </option>
        ))}
      </select>

      {current && <span className="session-meta">id: {current.id.slice(0, 8)}</span>}

      <div className="menu-wrap" ref={menuRef}>
        <button type="button" className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="菜单" disabled={!connected}>
          ⋯
        </button>
        {menuOpen && (
          <div className="menu">
            <button type="button" className="menu-item" onClick={() => { setMenuOpen(false); onNew(); }}>
              ＋ 新建会话
            </button>
            <button type="button" className="menu-item" onClick={() => { setMenuOpen(false); onSettings(); }}>
              ⚙ 设置
            </button>
            <button
              type="button"
              className="menu-item danger"
              disabled={!currentSessionId}
              onClick={() => { setMenuOpen(false); onCloseCurrent(); }}
            >
              ✕ 关闭当前会话
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
