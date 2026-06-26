import { useEffect, useRef, useState } from 'react';
import enterIcon from '../asserts/icons/enter.svg';
import arrowIcon from '../asserts/icons/to_left.svg';
import voiceIcon from '../asserts/icons/voice.svg';
import pasteIcon from '../asserts/icons/paste.svg';
import keyboardIcon from '../asserts/icons/keyboard.svg';
import backspaceIcon from '../asserts/icons/backspace.svg';
import type { UseBrowserSpeechRecognitionReturn } from '../hooks/useBrowserSpeechRecognition';

const LONG_PRESS_MS = 220;
const KEY_LONG_PRESS_MS = 320;

const TOP_CONTROLS = [
  {
    id: 'up',
    icon: arrowIcon,
    iconClass: 'rotate-up',
    data: '\x1b[A',
    label: '上移',
    longPressOptions: [
      { icon: arrowIcon, iconClass: 'rotate-left', data: '\x1b[D', label: '左移' },
      { glyph: 'Home', data: '\x1b[H', label: 'Home' },
    ],
  },
  {
    id: 'down',
    icon: arrowIcon,
    iconClass: 'rotate-down',
    data: '\x1b[B',
    label: '下移',
    longPressOptions: [
      { icon: arrowIcon, iconClass: 'rotate-right', data: '\x1b[C', label: '右移' },
      { glyph: 'End', data: '\x1b[F', label: 'End' },
    ],
  },
  { id: 'toggle', glyph: '␣', data: ' ', label: '空格', longPressOptions: [{ glyph: 'Tab', data: '\t', label: 'Tab' }] },
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
  { id: 'backspace', icon: backspaceIcon, data: '\x7f', label: '退格', longPressOptions: [{ glyph: '清除', data: '\x15', label: '清除' }] },
  { id: 'confirm', icon: enterIcon, data: '\r', label: '确认' },
] as const;

interface ControlPanelProps {
  onKey: (data: string) => void;
  speech: UseBrowserSpeechRecognitionReturn;
  keyboardEnabled: boolean;
  onToggleKeyboard: () => void;
  onPaste: () => void;
  onEnterImmersive: () => void;
}

export function ControlPanel({ onKey, speech, keyboardEnabled, onToggleKeyboard, onPaste, onEnterImmersive }: ControlPanelProps) {
  const [showMore, setShowMore] = useState(false);
  const [activeKeyMenu, setActiveKeyMenu] = useState<string | null>(null);
  const voicePressTimerRef = useRef<number | undefined>(undefined);
  const voiceLongPressRef = useRef(false);
  const keyPressTimerRef = useRef<number | undefined>(undefined);
  const keyLongPressRef = useRef(false);
  const clearVoicePressTimer = () => {
    if (voicePressTimerRef.current !== undefined) {
      window.clearTimeout(voicePressTimerRef.current);
      voicePressTimerRef.current = undefined;
    }
  };
  const clearKeyPressTimer = () => {
    if (keyPressTimerRef.current !== undefined) {
      window.clearTimeout(keyPressTimerRef.current);
      keyPressTimerRef.current = undefined;
    }
  };

  const startVoicePress = () => {
    if (speech.state === 'processing') return;
    if (!speech.supported) {
      alert('当前浏览器不支持本地语音识别');
      return;
    }
    voiceLongPressRef.current = false;
    clearVoicePressTimer();
    voicePressTimerRef.current = window.setTimeout(() => {
      voiceLongPressRef.current = true;
      speech.start();
    }, LONG_PRESS_MS);
  };

  const endVoicePress = () => {
    clearVoicePressTimer();
    if (speech.state === 'processing') return;
    if (voiceLongPressRef.current) {
      speech.stop();
      voiceLongPressRef.current = false;
      return;
    }
    speech.toggle();
  };

  useEffect(() => {
    if (!activeKeyMenu) return;
    const closeKeyMenu = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) {
        setActiveKeyMenu(null);
        return;
      }
      if (target.closest('.key-popover') || target.closest('.tool-btn.menu-open') || target.closest('.action-btn.menu-open')) return;
      setActiveKeyMenu(null);
    };
    document.addEventListener('pointerdown', closeKeyMenu, true);
    return () => document.removeEventListener('pointerdown', closeKeyMenu, true);
  }, [activeKeyMenu]);

  return (
    <div className="control-panel" onContextMenu={(e) => e.preventDefault()}>
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
          <button
            className="more-panel-item"
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onEnterImmersive(); setShowMore(false); }}
          >
            <span className="more-panel-icon immersive"><img src={voiceIcon} alt="" aria-hidden /></span>
            <span className="more-panel-label">沉浸 Vibe</span>
          </button>
        </div>
      )}
      <div className="quick-row" aria-label="快捷操作">
        {TOOL_CONTROLS.map((k) => (
          <span className="tool-key-wrap" key={k.id}>
            {activeKeyMenu === k.id && 'longPressOptions' in k && (
              <span className="key-popover" role="menu">
                {k.longPressOptions.map((option) => (
                  <button
                    key={option.label}
                    className="key-popover-option"
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onKey(option.data);
                      setActiveKeyMenu(null);
                      keyLongPressRef.current = false;
                    }}
                    aria-label={option.label}
                  >
                    {'glyph' in option ? option.glyph : <img className={option.iconClass} src={option.icon} alt="" aria-hidden />}
                  </button>
                ))}
              </span>
            )}
            <button
              className={`tool-btn${'glyph' in k ? ' text-key' : ''}${k.id === 'more' && showMore ? ' active' : ''}${activeKeyMenu === k.id ? ' menu-open' : ''}`}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                if (k.id === 'more') {
                  setActiveKeyMenu(null);
                  setShowMore((v) => !v);
                  return;
                }
                if ('longPressOptions' in k) {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  keyLongPressRef.current = false;
                  clearKeyPressTimer();
                  keyPressTimerRef.current = window.setTimeout(() => {
                    keyLongPressRef.current = true;
                    setActiveKeyMenu(k.id);
                  }, KEY_LONG_PRESS_MS);
                  return;
                }
                setActiveKeyMenu(null);
                if ('data' in k) onKey(k.data);
              }}
              onPointerUp={(e) => {
                if (!('longPressOptions' in k)) return;
                e.preventDefault();
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                clearKeyPressTimer();
                if (!keyLongPressRef.current) {
                  onKey(k.data);
                }
                keyLongPressRef.current = false;
              }}
              onPointerCancel={(e) => {
                if (!('longPressOptions' in k)) return;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                clearKeyPressTimer();
                keyLongPressRef.current = false;
              }}
              aria-label={k.label}
            >
              {'glyph' in k ? (
                <>
                  <span className="tool-btn-glyph">{k.glyph}</span>
                  {'longPressOptions' in k && <span className="tool-btn-more-mark" aria-hidden />}
                </>
              ) : (
                <>
                  <img className={'iconClass' in k ? k.iconClass : ''} src={k.icon} alt="" aria-hidden />
                  {'longPressOptions' in k && <span className="tool-btn-more-mark" aria-hidden />}
                </>
              )}
            </button>
          </span>
        ))}
      </div>
      <div className="action-row" aria-label="会话操作">
        {ACTION_CONTROLS.map((k) => (
          <span className={`action-key-wrap ${k.id}`} key={k.id}>
            {activeKeyMenu === k.id && 'longPressOptions' in k && (
              <span className="key-popover" role="menu">
                {k.longPressOptions.map((option) => (
                  <button
                    key={option.label}
                    className="key-popover-option"
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onKey(option.data);
                      setActiveKeyMenu(null);
                      keyLongPressRef.current = false;
                    }}
                    aria-label={option.label}
                  >
                    {option.glyph}
                  </button>
                ))}
              </span>
            )}
            <button
              className={`action-btn ${k.id}${k.id === 'escape' ? ' danger' : ''}${activeKeyMenu === k.id ? ' menu-open' : ''}`}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                if (k.id === 'voice') {
                  startVoicePress();
                  return;
                }
                if ('longPressOptions' in k) {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  keyLongPressRef.current = false;
                  clearKeyPressTimer();
                  keyPressTimerRef.current = window.setTimeout(() => {
                    keyLongPressRef.current = true;
                    setActiveKeyMenu(k.id);
                  }, KEY_LONG_PRESS_MS);
                  return;
                }
                if ('data' in k) onKey(k.data);
              }}
              onPointerUp={(e) => {
                if (k.id === 'voice') {
                  e.preventDefault();
                  endVoicePress();
                  return;
                }
                if (!('longPressOptions' in k)) return;
                e.preventDefault();
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                clearKeyPressTimer();
                if (!keyLongPressRef.current) {
                  onKey(k.data);
                }
                keyLongPressRef.current = false;
              }}
              onPointerCancel={(e) => {
                if (k.id === 'voice') {
                  clearVoicePressTimer();
                  if (voiceLongPressRef.current) speech.stop();
                  voiceLongPressRef.current = false;
                  return;
                }
                if (!('longPressOptions' in k)) return;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                clearKeyPressTimer();
                keyLongPressRef.current = false;
              }}
              aria-label={k.label}
              aria-pressed={k.id === 'voice' ? speech.listening : undefined}
              disabled={k.id === 'voice' && (!speech.supported || speech.state === 'processing')}
            >
              {'glyph' in k ? (
                k.glyph
              ) : (
                <>
                  <img src={k.icon} alt="" aria-hidden />
                  {'longPressOptions' in k && <span className="action-btn-more-mark" aria-hidden />}
                  {k.id === 'voice' && <span>{speech.listening ? '听写中' : speech.state === 'processing' ? '识别中' : '语音'}</span>}
                </>
              )}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
