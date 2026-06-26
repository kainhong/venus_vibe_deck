import deleteIcon from '../asserts/icons/delete.svg';
import type { SessionInfo } from '../types';

const SESSION_ID_LEN = 8;

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
  alerts: Record<string, { at: number; source?: string; message?: string }>;
  onClose: () => void;
  onConnect: (entry: SessionHistoryEntry) => void;
  onDelete: (entry: SessionHistoryEntry) => void;
}

export function SessionHistoryPanel({
  entries,
  sessions,
  currentSessionId,
  alerts,
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
            const alert = entry.sessionId ? alerts[entry.sessionId] : undefined;
            return (
              <div className={`history-entry${isCurrent ? ' current' : ''}${alert ? ' attention' : ''}`} key={entry.key}>
                <button type="button" className="history-entry-main" onClick={() => onConnect(entry)}>
                  <span className="history-entry-topline">
                    <span className="history-entry-name-wrap">
                      <span className="history-entry-name">{formatHistoryTitle(entry)}</span>
                      {alert && <span className="history-alert-dot" aria-label="有新通知" />}
                    </span>
                    {isCurrent && <span className="history-entry-badge">当前</span>}
                    {alert && <span className="history-entry-badge attention">需关注</span>}
                    {isLive && !isCurrent && <span className="history-entry-badge live">在线</span>}
                  </span>
                  <span className="history-entry-path">{entry.cwd}</span>
                  <span className="history-entry-meta">
                    {alert ? formatAlertMeta(alert) : formatTime(entry.updatedAt)}
                  </span>
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

function formatAlertMeta(alert: { at: number; source?: string; message?: string }): string {
  const source = alert.source || 'Agent';
  const message = alert.message ? ` · ${alert.message}` : '';
  return `${source} · ${formatTime(alert.at)}${message}`;
}

function formatHistoryTitle(entry: SessionHistoryEntry): string {
  if (!entry.sessionId) return entry.cliName;
  const shortId = entry.sessionId.slice(0, SESSION_ID_LEN);
  return entry.cliName.endsWith(`-${shortId}`) ? entry.cliName : `${entry.cliName}-${shortId}`;
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
