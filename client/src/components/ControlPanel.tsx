import { useState } from 'react';
import enterIcon from '../asserts/icons/enter.svg';
import arrowIcon from '../asserts/icons/to_left.svg';
import voiceIcon from '../asserts/icons/voice.svg';
import pasteIcon from '../asserts/icons/paste.svg';
import keyboardIcon from '../asserts/icons/keyboard.svg';
import backspaceIcon from '../asserts/icons/backspace.svg';

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
  { id: 'backspace', icon: backspaceIcon, data: '\x7f', label: '退格' },
  { id: 'confirm', icon: enterIcon, data: '\r', label: '确认' },
] as const;

interface ControlPanelProps {
  onKey: (data: string) => void;
  onVoice?: () => void;
  keyboardEnabled: boolean;
  onToggleKeyboard: () => void;
  onPaste: () => void;
}

export function ControlPanel({ onKey, onVoice, keyboardEnabled, onToggleKeyboard, onPaste }: ControlPanelProps) {
  const [showMore, setShowMore] = useState(false);
  const handleVoice = onVoice ?? (() => alert('语音输入开发中'));

  return (
    <div className="control-panel">
      {showMore && (
        <div className="more-panel">
          <button
            className="more-panel-item"
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onPaste(); setShowMore(false); }}
          >
            <span className="more-panel-icon paste"><img src={pasteIcon} alt="" aria-hidden /></span>
            <span className="more-panel-label">粘贴</span>
          </button>
          <button
            className="more-panel-item"
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onToggleKeyboard(); setShowMore(false); }}
          >
            <span className={`more-panel-icon keyboard ${keyboardEnabled ? 'active' : ''}`}><img src={keyboardIcon} alt="" aria-hidden /></span>
            <span className="more-panel-label">{keyboardEnabled ? '关闭键盘' : '开启键盘'}</span>
          </button>
        </div>
      )}
      <div className="quick-row" aria-label="快捷操作">
        {TOOL_CONTROLS.map((k) => (
          <button
            key={k.id}
            className={`tool-btn${'glyph' in k ? ' text-key' : ''}${k.id === 'more' && showMore ? ' active' : ''}`}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if (k.id === 'more') setShowMore((v) => !v);
              else if ('data' in k) onKey(k.data);
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
