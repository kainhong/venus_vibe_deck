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
  bellActive?: boolean;
}

/**
 * 顶部状态栏:连接状态 + Session 下拉 + 常用会话操作。
 */
export function StatusBar({ connected, sessions, currentSessionId, onSelect, onNew, onSettings, onCloseCurrent, bellActive = false }: StatusBarProps) {
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

  const showAbout = () => {
    setMenuOpen(false);
    alert('Venus Agent HUD');
  };

  return (
    <header className="status-bar">
      <span className={`status-dot ${connected ? 'on' : 'off'}`} aria-hidden />
      <span className={`status-text${bellActive ? ' bell' : ''}`}>{bellActive ? '已完成' : connected ? '已连接' : '断开'}</span>

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
            {s.name} {s.alive ? '' : '(已退出)'}
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
        <div className="header-menu-wrap" ref={menuRef}>
          <button type="button" className="header-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="更多">
            ⋯
          </button>
          {menuOpen && (
            <div className="header-menu">
              <button type="button" className="header-menu-item" onClick={() => { setMenuOpen(false); onSettings(); }}>
                设置
              </button>
              <button type="button" className="header-menu-item" onClick={showAbout}>
                关于
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
