import { useState } from 'react';
import { useApp } from '../state/AppContext';
import type { CliConfig } from '../types';

/** 空配置草稿(id 为空表示新增,保存时生成) */
function emptyConfig(): CliConfig {
  return { id: '', name: '', command: '', args: [], resumeArg: '', isDefault: false };
}

/**
 * 设置页 — CLI 配置 CRUD。
 * 本地 draft 编辑,统一 PUT 保存。默认单选互斥(前端 + 后端 normalize 双重保证)。
 */
export function SettingsPage({ onClose }: { onClose: () => void }) {
  const { config, saveConfig } = useApp();
  const [draft, setDraft] = useState<CliConfig[]>(config?.cliConfigs ?? []);
  const [editing, setEditing] = useState<CliConfig | null>(null);

  // 设默认:互斥,仅一项 isDefault
  const setDefault = (id: string) => setDraft((list) => list.map((c) => ({ ...c, isDefault: c.id === id })));
  const removeItem = (id: string) => setDraft((list) => list.filter((c) => c.id !== id));

  const saveItem = (item: CliConfig) => {
    setDraft((list) => {
      const exists = list.some((c) => c.id === item.id);
      const next = exists ? list.map((c) => (c.id === item.id ? item : c)) : [...list, item];
      // 设为默认时清除其他默认
      return item.isDefault ? next.map((c) => ({ ...c, isDefault: c.id === item.id })) : next;
    });
    setEditing(null);
  };

  const persist = async () => {
    await saveConfig({
        cliConfigs: draft,
        voiceSettings: {
          useServerVoice: config?.voiceSettings?.useServerVoice ?? false,
          commands: config?.voiceSettings?.commands ?? [],
          refinePrompt: config?.voiceSettings?.refinePrompt ?? { enabled: true, system: [], userTemplate: 'Transcript:\n{{transcript}}' },
        },
      });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal settings-page">
        <div className="modal-header">
          <h2>设置 · CLI 配置</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body">
          {editing ? (
            <ConfigEditor initial={editing} onSave={saveItem} onCancel={() => setEditing(null)} />
          ) : (
            <>
              <section className="settings-section">
                <h3>语音</h3>
                <p className="hint">
                  后端语音解析: {config?.voiceSettings?.useServerVoice ? '已开启' : '未开启'}。通过 .env 的 VOICE_USE_SERVER 控制。
                </p>
                <div className="voice-command-summary" aria-label="语音指令别名">
                  {(config?.voiceSettings?.commands ?? []).map((command) => (
                    <p className="voice-command-line" key={command.id}>
                      <span>{command.id}</span>
                      <code>
                        {command.input} → {formatKeyboard(command.keyboard)} · {command.aliases.join(' / ') || '-'}
                      </code>
                    </p>
                  ))}
                </div>
                <div className="voice-prompt-summary" aria-label="语音整理提示词">
                  <p className="voice-command-line">
                    <span>refine</span>
                    <code>{config?.voiceSettings?.refinePrompt?.enabled ? 'enabled' : 'disabled'}</code>
                  </p>
                  <p className="voice-command-line">
                    <span>system</span>
                    <code>{config?.voiceSettings?.refinePrompt?.system?.length ?? 0} lines</code>
                  </p>
                  <p className="voice-command-line">
                    <span>user</span>
                    <code>{config?.voiceSettings?.refinePrompt?.userTemplate || '-'}</code>
                  </p>
                </div>
                <p className="hint">需要调整键盘指令、别名或整理提示词时,直接编辑 server/config/settings.json。</p>
              </section>
              <ul className="config-list">
                {draft.map((c) => (
                  <li key={c.id} className="config-item">
                    <div className="config-info">
                      <span className="config-name">
                        {c.name || '(未命名)'}
                        {c.isDefault && <em className="default-tag">默认</em>}
                      </span>
                      <span className="config-cmd">
                        {c.command} {c.args.join(' ')}
                      </span>
                      {c.resumeArg && <span className="config-resume">继续参数: {c.resumeArg}</span>}
                    </div>
                    <div className="config-actions">
                      <label className="radio">
                        <input type="radio" checked={c.isDefault} onChange={() => setDefault(c.id)} /> 默认
                      </label>
                      <button type="button" className="btn-text" onClick={() => setEditing(c)}>编辑</button>
                      <button type="button" className="btn-text danger" onClick={() => removeItem(c.id)}>删除</button>
                    </div>
                  </li>
                ))}
                {draft.length === 0 && <li className="empty-hint">暂无配置,点击下方新增</li>}
              </ul>
              <button type="button" className="btn-secondary" onClick={() => setEditing(emptyConfig())}>
                + 新增配置
              </button>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
          <button type="button" className="btn-primary" onClick={persist} disabled={editing !== null}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function formatKeyboard(value: string): string {
  return value
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\x1b/g, '\\u001b')
    .replace(/\x03/g, '\\u0003')
    .replace(/ /g, 'space');
}

/** 单条配置的编辑表单 */
function ConfigEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: CliConfig;
  onSave: (c: CliConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [command, setCommand] = useState(initial.command);
  const [args, setArgs] = useState(initial.args.join(' '));
  const [resumeArg, setResumeArg] = useState(initial.resumeArg);
  const [isDefault, setIsDefault] = useState(initial.isDefault);
  const isNew = !initial.id;

  const submit = () => {
    onSave({
      id: initial.id || crypto.randomUUID(),
      name: name.trim() || command.trim() || 'unnamed',
      command: command.trim(),
      args: args.split(/\s+/).filter(Boolean),
      resumeArg: resumeArg.trim(),
      isDefault,
    });
  };

  return (
    <div className="config-editor">
      <h3>{isNew ? '新增配置' : '编辑配置'}</h3>
      <label className="field">
        <span>名称</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude" />
      </label>
      <label className="field">
        <span>命令</span>
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="claude" />
      </label>
      <label className="field">
        <span>启动参数(空格分隔)</span>
        <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="--dangerously-skip-permissions" />
      </label>
      <label className="field">
        <span>继续参数</span>
        <input value={resumeArg} onChange={(e) => setResumeArg(e.target.value)} placeholder="-c" />
      </label>
      <label className="checkbox field">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> 设为默认
      </label>
      <div className="editor-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>取消</button>
        <button type="button" className="btn-primary" onClick={submit} disabled={!command.trim()}>
          {isNew ? '添加' : '保存'}
        </button>
      </div>
    </div>
  );
}
