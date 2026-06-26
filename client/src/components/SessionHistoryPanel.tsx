import deleteIcon from '../asserts/icons/delete.svg';
import type { SessionInfo } from '../types';

export interface SessionHistoryEntry {
  key: string;
  cliConfigId?: string;
  cliName: string;
  command?: string;
  args?: string[];
  resumeArg?: string;
  cwd: string;
  sessionId?: string;
  updatedAt: number;
}

interface SessionHistoryPanelProps {
  entries: SessionHistoryEntry[];
  sessions: SessionInfo[];
  currentSessionId: string | undefined;
  onClose: () => void;
  onConnect: (entry: SessionHistoryEntry) => void;
  onDelete: (entry: SessionHistoryEntry) => void;
}

export function SessionHistoryPanel({
  entries,
  sessions,
  currentSessionId,
  onClose,
  onConnect,
  onDelete,
}: SessionHistoryPanelProps) {
  const liveIds = new Set(sessions.filter((s) => s.alive).map((s) => s.id));

  return (
    <div className="modal-overlay">
      <div className="modal session-history-panel">
        <div className="modal-header">
          <h2>历史会话</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body history-list">
          {entries.length === 0 ? (
            <div className="empty-hint">暂无历史会话</div>
          ) : entries.map((entry) => {
            const isCurrent = !!entry.sessionId && entry.sessionId === currentSessionId;
            const isLive = !!entry.sessionId && liveIds.has(entry.sessionId);
            return (
              <div className={`history-entry${isCurrent ? ' current' : ''}`} key={entry.key}>
                <button type="button" className="history-entry-main" onClick={() => onConnect(entry)}>
                  <span className="history-entry-topline">
                    <span className="history-entry-name">{entry.cliName}</span>
                    {isCurrent && <span className="history-entry-badge">当前</span>}
                    {isLive && !isCurrent && <span className="history-entry-badge live">在线</span>}
                  </span>
                  <span className="history-entry-path">{entry.cwd}</span>
                  <span className="history-entry-meta">{formatTime(entry.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className="history-delete-btn"
                  onClick={() => onDelete(entry)}
                  aria-label="删除历史会话"
                >
                  <img src={deleteIcon} alt="" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatTime(value: number): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
