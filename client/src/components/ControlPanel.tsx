import enterIcon from '../asserts/icons/enter.svg';
import arrowIcon from '../asserts/icons/to_left.svg';
import voiceIcon from '../asserts/icons/voice.svg';

/**
 * 底部输入栏 — 保留快捷键,视觉上按聊天 composer 组织。
 * 热键发送原始控制字符(spec §3.2);语音按钮本次占位。
 */
const TOP_CONTROLS = [
  { id: 'up', icon: arrowIcon, iconClass: 'rotate-up', data: '\x1b[A', label: '上移' },
  { id: 'down', icon: arrowIcon, iconClass: 'rotate-down', data: '\x1b[B', label: '下移' },
  { id: 'toggle', glyph: '␣', data: ' ', label: '空格' },
] as const;

const TEXT_CONTROLS = [
  { id: 'mention', glyph: '@', data: '@', label: '输入 @' },
  { id: 'slash', glyph: '/', data: '/', label: '输入 /' },
] as const;

const TOOL_CONTROLS = [
  TEXT_CONTROLS[0],
  TEXT_CONTROLS[1],
  TOP_CONTROLS[0],
  TOP_CONTROLS[1],
  TOP_CONTROLS[2],
  { id: 'more', glyph: '+', label: '更多' },
] as const;

const ACTION_CONTROLS = [
  { id: 'escape', glyph: 'esc', data: '\x1b', label: 'Esc' },
  { id: 'voice', icon: voiceIcon, label: '语音输入' },
  { id: 'confirm', icon: enterIcon, data: '\r', label: '确认' },
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
      <div className="quick-row" aria-label="快捷操作">
        {TOOL_CONTROLS.map((k) => (
          <button
            key={k.id}
            className={`tool-btn${'glyph' in k ? ' text-key' : ''}`}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if ('data' in k) onKey(k.data);
            }}
            aria-label={k.label}
          >
            {'glyph' in k ? k.glyph : <img className={'iconClass' in k ? k.iconClass : ''} src={k.icon} alt="" aria-hidden />}
          </button>
        ))}
      </div>
      <div className="action-row" aria-label="会话操作">
        {ACTION_CONTROLS.map((k) => (
          <button
            key={k.id}
            className={`action-btn ${k.id}${k.id === 'escape' ? ' danger' : ''}`}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if (k.id === 'voice') handleVoice();
              else if ('data' in k) onKey(k.data);
            }}
            aria-label={k.label}
          >
            {'glyph' in k ? k.glyph : <img src={k.icon} alt="" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );
}
