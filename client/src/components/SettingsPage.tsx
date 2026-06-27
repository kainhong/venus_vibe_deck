import { useApp } from '../state/AppContext';
import type { HandMode } from '../types';

interface SettingsPageProps {
  handMode: HandMode;
  useBrowserSpeechApi: boolean;
  serverVoiceEnabled: boolean;
  onHandModeChange: (mode: HandMode) => void;
  onBrowserSpeechChange: (enabled: boolean) => void;
  onClose: () => void;
}

/**
 * 设置页 — 仅展示运行时配置摘要。
 * CLI 配置由 server/config/settings.json 维护,前端不再提供编辑入口。
 */
export function SettingsPage({
  handMode,
  useBrowserSpeechApi,
  serverVoiceEnabled,
  onHandModeChange,
  onBrowserSpeechChange,
  onClose,
}: SettingsPageProps) {
  const { config } = useApp();

  return (
    <div className="modal-overlay">
      <div className="modal settings-page">
        <div className="modal-header">
          <h2>设置</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body">
          <section className="settings-section">
            <h3>显示</h3>
            <div className="settings-option-row">
              <span className="settings-option-label">操作习惯</span>
              <div className="settings-segmented" role="radiogroup" aria-label="操作手偏好">
                <button
                  type="button"
                  className={handMode === 'right' ? 'active' : ''}
                  role="radio"
                  aria-checked={handMode === 'right'}
                  onClick={() => onHandModeChange('right')}
                >
                  右手
                </button>
                <button
                  type="button"
                  className={handMode === 'left' ? 'active' : ''}
                  role="radio"
                  aria-checked={handMode === 'left'}
                  onClick={() => onHandModeChange('left')}
                >
                  左手
                </button>
              </div>
            </div>
            <p className="hint">左手模式会镜像底部操作栏,回车靠左。</p>
          </section>

          <section className="settings-section">
            <h3>语音</h3>
            <div className="settings-option-row">
              <span className="settings-option-label">前端 Web API 识别</span>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={useBrowserSpeechApi}
                  disabled={!serverVoiceEnabled}
                  onChange={(e) => onBrowserSpeechChange(e.target.checked)}
                />
                <span>{useBrowserSpeechApi ? '开启' : '关闭'}</span>
              </label>
            </div>
            <p className="hint">
              当前 STT: {useBrowserSpeechApi ? '浏览器 Web Speech API' : '服务端 STT'}。服务端语音解析通过 .env 的 VOICE_USE_SERVER 控制。
            </p>
            {!serverVoiceEnabled && (
              <p className="hint">服务端 STT 未开启时将使用浏览器 Web Speech API。</p>
            )}
            <div className="voice-command-summary" aria-label="语音指令别名">
              {(config?.voiceSettings?.commands ?? []).map((command) => (
                <p className="voice-command-line" key={command.id}>
                  <span>{command.id}</span>
                  <code>
                    {command.input} → {formatKeyboard(command.keyboard)} · {command.aliases.join(' / ') || '-'}
                  </code>
                </p>
              ))}
              {(config?.voiceSettings?.commands ?? []).length === 0 && (
                <p className="empty-hint">暂无语音指令</p>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h3>配置文件</h3>
            <p className="hint">
              CLI、语音指令和别名通过 server/config/settings.json 维护。修改后重启或刷新服务配置。
            </p>
          </section>
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
