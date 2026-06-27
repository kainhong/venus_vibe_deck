import { useState } from 'react';
import { getAuthToken } from '../api/http';
import { useBrowserSpeechRecognition } from '../hooks/useBrowserSpeechRecognition';
import { useApp } from '../state/AppContext';
import type { SpeechResult } from '../types';

interface SpeechTestPanelProps {
  useBrowserSpeechApi: boolean | null;
  serverVoiceEnabled: boolean | null;
  onClose: () => void;
}

export function SpeechTestPanel({ useBrowserSpeechApi, serverVoiceEnabled, onClose }: SpeechTestPanelProps) {
  const { config } = useApp();
  const [result, setResult] = useState<SpeechResult | null>(null);
  const [error, setError] = useState('');
  const configReady = typeof serverVoiceEnabled === 'boolean' && typeof useBrowserSpeechApi === 'boolean';
  const sttLabel = !configReady ? '配置加载中' : useBrowserSpeechApi ? '浏览器 Web Speech API' : '服务端 STT';
  const speechTest = useBrowserSpeechRecognition({
    lang: 'zh-CN',
    submitMode: 'insert',
    useServerVoice: (serverVoiceEnabled ?? false) && !(useBrowserSpeechApi ?? true),
    continuous: true,
    commands: config?.voiceSettings?.commands ?? [],
    onResult: (nextResult) => {
      setResult(nextResult);
      setError('');
    },
    onError: (message) => setError(message),
  });

  const toggleSpeechTest = () => {
    if (!configReady) return;
    setError('');
    if (!speechTest.listening) setResult(null);
    speechTest.toggle();
  };

  return (
    <div className="modal-overlay">
      <div className="modal speech-test-modal">
        <div className="modal-header">
          <h2>语音测试</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body speech-test-body">
          <section className="speech-test-result-panel" aria-label="识别结果">
            {result && (
              <div className="speech-test-result-header">
                <span>{formatMeta(result)}</span>
              </div>
            )}
            <div className="speech-test-content">
              {result ? (
                <pre className="speech-test-transcript">{result.message}</pre>
              ) : (
                <div className="speech-test-empty">
                  <strong>{speechTest.listening ? '正在收音' : speechTest.state === 'processing' ? '正在识别' : '等待测试'}</strong>
                  <span>{getStatusText(speechTest.state, speechTest.listening, configReady, serverVoiceEnabled, useBrowserSpeechApi)}</span>
                </div>
              )}
            </div>
            {result?.recording && (
              <div className="speech-test-recording">
                <audio controls src={withAuth(result.recording.url)} />
              </div>
            )}
          </section>

          {error && <p className="speech-test-error">{error}</p>}

          <section className={`speech-test-control${speechTest.listening ? ' listening' : ''}`}>
            <button
              type="button"
              className={speechTest.listening ? 'btn-secondary danger' : 'btn-primary'}
              onClick={toggleSpeechTest}
              disabled={!configReady || speechTest.state === 'processing' || speechTest.state === 'unsupported'}
            >
              {speechTest.listening ? '结束测试' : speechTest.state === 'processing' ? '识别中' : '开始测试'}
            </button>
          </section>

          <footer className="speech-test-footer">
            <span>{sttLabel}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function getStatusText(state: string, listening: boolean, configReady: boolean, serverVoiceEnabled: boolean | null, useBrowserSpeechApi: boolean | null): string {
  if (!configReady) return '正在读取服务端语音配置。';
  if (state === 'unsupported') return '当前浏览器不支持这个识别方式。';
  if (listening) return '点击结束测试后输出识别内容。';
  if (!serverVoiceEnabled && !useBrowserSpeechApi) return '服务端 STT 未开启,会回退到浏览器 Web Speech API。';
  return '点击开始后说一段语音。';
}

function formatMeta(result: SpeechResult): string {
  const parts = [
    result.type === 'command' ? `指令:${result.command}` : '文本',
    result.provider,
    typeof result.durationMs === 'number' ? `${result.durationMs}ms` : undefined,
    typeof result.confidence === 'number' ? `置信度 ${result.confidence.toFixed(2)}` : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}

function withAuth(url: string): string {
  const token = getAuthToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}auth=${encodeURIComponent(token)}`;
}
