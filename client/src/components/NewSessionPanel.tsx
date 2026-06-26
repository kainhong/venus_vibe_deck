import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { WorkspacePicker } from './WorkspacePicker';
import type { CreateSessionOptions } from '../hooks/useWebSocket';

/**
 * 新建会话面板:选 CLI 配置 + workspace(必选)+ 是否继续上次会话。
 * 确认后由父组件调 createSession + 记录 workspace 历史。
 */
export function NewSessionPanel({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (opts: CreateSessionOptions) => void;
}) {
  const { config } = useApp();
  const configs = config?.cliConfigs ?? [];
  const defaultCfg = useMemo(() => configs.find((c) => c.isDefault) ?? configs[0], [configs]);

  const [selectedId, setSelectedId] = useState(defaultCfg?.id ?? '');
  const [cwd, setCwd] = useState('');
  const [resume, setResume] = useState(false);
  const [useGitWorktree, setUseGitWorktree] = useState(false);
  const [worktreeName, setWorktreeName] = useState(() => `venus-${crypto.randomUUID().slice(0, 8)}`);

  const selected = configs.find((c) => c.id === selectedId);
  const canCreate = !!selected && !!cwd.trim();

  const handlePickHistoryWorkspace = (path: string) => {
    setCwd(path);
    if (selected?.resumeArg) setResume(true);
  };

  const handleCreate = () => {
    if (!selected || !cwd.trim()) return;
    onCreate({
      cliConfigId: selected.id,
      command_bin: selected.command,
      args: selected.args,
      cwd: cwd.trim(),
      resumeArg: selected.resumeArg,
      resume,
      name: selected.name,
      useGitWorktree,
      requestedWorktreeName: useGitWorktree ? worktreeName.trim() || `venus-${crypto.randomUUID().slice(0, 8)}` : undefined,
    });
  };

  const worktreePreview = cwd.trim() && worktreeName.trim()
    ? `${cwd.trim().replace(/\/+$/, '')}_${worktreeName.trim()}`
    : '';

  return (
    <div className="modal-overlay">
      <div className="modal new-session-panel">
        <div className="modal-header">
          <h2>新建会话</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body">
          <div className="session-cli-row">
            <label className="field session-cli-field">
              <span>CLI</span>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={configs.length === 0}>
                {configs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {configs.length === 0 && <small className="hint">无可用配置,请先在设置中添加</small>}
            </label>

            {selected?.resumeArg && (
              <label className="checkbox field session-resume-field">
                <input type="checkbox" checked={resume} onChange={(e) => setResume(e.target.checked)} />
                <span>继续({selected.resumeArg})</span>
              </label>
            )}
          </div>

          <div className="field">
            <span>Workspace <em className="required">必选</em></span>
            <WorkspacePicker value={cwd} onChange={setCwd} onPickHistory={handlePickHistoryWorkspace} />
          </div>

          <label className="checkbox field">
            <input type="checkbox" checked={useGitWorktree} onChange={(e) => setUseGitWorktree(e.target.checked)} />
            使用 Git worktree
          </label>

          {useGitWorktree && (
            <div className="field">
              <span>Worktree 名称</span>
              <input value={worktreeName} onChange={(e) => setWorktreeName(e.target.value)} placeholder="venus-xxxxxxxx" />
              <small className="hint">
                留空会自动使用随机短名称。实际目录会由服务端按 git root 创建为 repo_名称。
              </small>
              {worktreePreview && <small className="hint">预览: {worktreePreview}</small>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={!canCreate}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
