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

  const selected = configs.find((c) => c.id === selectedId);
  const canCreate = !!selected && !!cwd.trim();

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
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal new-session-panel">
        <div className="modal-header">
          <h2>新建会话</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>CLI</span>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={configs.length === 0}>
              {configs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {configs.length === 0 && <small className="hint">无可用配置,请先在设置中添加</small>}
          </label>

          {selected?.resumeArg && (
            <label className="checkbox field">
              <input type="checkbox" checked={resume} onChange={(e) => setResume(e.target.checked)} />
              继续上次会话({selected.resumeArg})
            </label>
          )}

          <div className="field">
            <span>Workspace <em className="required">必选</em></span>
            <WorkspacePicker value={cwd} onChange={setCwd} />
          </div>
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
