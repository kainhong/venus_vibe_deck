import { useState } from 'react';
import { useApp } from '../state/AppContext';
import type { DirEntry } from '../types';

/**
 * Workspace 选择器(三合一,spec-ui §8):
 * - 文本输入:手动填任意路径(不受白名单限制)
 * - 常用历史:点击即填
 * - 浏览:调 listDir(受后端白名单约束)逐级进入目录后选定
 */
export function WorkspacePicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const { history, listDir } = useApp();
  const [browsing, setBrowsing] = useState(false);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [browsePath, setBrowsePath] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadDir = async (p?: string) => {
    try {
      const res = await listDir(p);
      setBrowsePath(res.path);
      setEntries(res.entries);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    }
  };

  const toggleBrowse = async () => {
    if (browsing) {
      setBrowsing(false);
      return;
    }
    setBrowsing(true);
    await loadDir(value.trim() || undefined); // 从当前路径浏览,缺省回根
  };

  const enter = (name: string) => loadDir(`${browsePath}/${name}`);

  return (
    <div className="workspace-picker">
      <input
        className="ws-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/path/to/workspace"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {history && history.workspaces.length > 0 && (
        <div className="ws-history">
          <span className="ws-label">常用:</span>
          {history.workspaces.map((w) => (
            <button key={w.path} type="button" className="chip" onClick={() => onChange(w.path)} title={w.path}>
              {w.path}
            </button>
          ))}
        </div>
      )}

      <button type="button" className="btn-secondary ws-browse-btn" onClick={toggleBrowse}>
        {browsing ? '收起浏览' : '浏览…'}
      </button>

      {browsing && (
        <div className="ws-browser">
          <div className="ws-browser-path" title={browsePath}>{browsePath}</div>
          {error && <div className="ws-error">{error}</div>}
          <ul className="ws-entries">
            {entries
              .filter((e) => e.isDir)
              .map((e) => (
                <li key={e.name}>
                  <button type="button" className="ws-entry" onClick={() => enter(e.name)}>
                    📁 {e.name}
                  </button>
                </li>
              ))}
            {entries.filter((e) => e.isDir).length === 0 && !error && (
              <li className="empty-hint">无子目录</li>
            )}
          </ul>
          <div className="ws-browser-actions">
            <button type="button" className="btn-secondary" onClick={() => loadDir()}>根目录</button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onChange(browsePath);
                setBrowsing(false);
              }}
            >
              选此目录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
