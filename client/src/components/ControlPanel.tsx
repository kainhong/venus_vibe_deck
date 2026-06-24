/**
 * 底部控制栏 — 单行紧凑布局,纯图标(无文字副标题,移动端省空间)。
 * 热键发送原始控制字符(spec §3.2);语音按钮本次占位。
 * 图标用 Unicode 几何符号,语义一目了然且渲染稳定(优于随意搭配的 emoji)。
 */
const CONTROLS = [
  { id: 'up', glyph: '↑', data: '\x1b[A' }, // 多选菜单上移
  { id: 'down', glyph: '↓', data: '\x1b[B' }, // 下移
  { id: 'toggle', glyph: '☑', data: ' ' }, // 选择/取消(Space 切换)
  { id: 'confirm', glyph: '↵', data: '\r' }, // 确认/执行(Enter)
  { id: 'interrupt', glyph: '✕', data: '\x03' }, // 中断/拒绝(Ctrl+C)
] as const;

interface ControlPanelProps {
  onKey: (data: string) => void;
  /** 语音回调,默认提示开发中(spec-ui §6 本次仅占位) */
  onVoice?: () => void;
}

export function ControlPanel({ onKey, onVoice }: ControlPanelProps) {
  // 语音按钮始终渲染(本次占位);未提供回调时提示开发中
  const handleVoice = onVoice ?? (() => alert('语音输入开发中'));
  return (
    <div className="control-panel">
      <div className="control-row">
        {CONTROLS.map((k) => (
          <button
            key={k.id}
            className={`ctrl-btn${k.id === 'interrupt' ? ' danger' : ''}`}
            type="button"
            // pointerdown 即发,响应更快;preventDefault 防止触发软键盘/焦点
            onPointerDown={(e) => {
              e.preventDefault();
              onKey(k.data);
            }}
            aria-label={k.id}
          >
            {k.glyph}
          </button>
        ))}
        <button
          className="ctrl-btn voice"
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            handleVoice();
          }}
          aria-label="语音输入"
        >
          🎤
        </button>
      </div>
    </div>
  );
}
