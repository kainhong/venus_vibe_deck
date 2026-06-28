import { useState } from 'react';
import { getAuthToken } from '../api/http';
import { useBrowserSpeechRecognition } from '../hooks/useBrowserSpeechRecognition';
import { useApp } from '../state/AppContext';
import type { SpeechResult } from '../types';

interface SpeechTestPanelProps {
  useBrowserSpeechApi: boolean | null;
  serverVoiceEnabled: boolean | null;
  asrProvider: 'cloud' | 'local' | null;
  onClose: () => void;
}

export function SpeechTestPanel({ useBrowserSpeechApi, serverVoiceEnabled, asrProvider, onClose }: SpeechTestPanelProps) {
  const { config } = useApp();
  const [result, setResult] = useState<SpeechResult | null>(null);
  const [error, setError] = useState('');
  const configReady = typeof serverVoiceEnabled === 'boolean' && typeof useBrowserSpeechApi === 'boolean';
  const sttLabel = getSttLabel(configReady, useBrowserSpeechApi, asrProvider);
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
                <ResultText result={result} />
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

function getSttLabel(configReady: boolean, useBrowserSpeechApi: boolean | null, asrProvider: 'cloud' | 'local' | null): string {
  if (!configReady) return '配置加载中';
  if (useBrowserSpeechApi) return '浏览器 Web Speech API';
  if (asrProvider === 'local') return '服务端 STT · 本地';
  if (asrProvider === 'cloud') return '服务端 STT · 云端';
  return '服务端 STT';
}

function ResultText({ result }: { result: SpeechResult }) {
  const rawTranscript = result.rawTranscript?.trim();
  const finalText = result.message.trim();
  if (!rawTranscript) {
    return <pre className="speech-test-transcript">{finalText}</pre>;
  }
  return (
    <div className="speech-test-compare">
      <div className="speech-test-text-block">
        <span>原始识别</span>
        <pre>{rawTranscript}</pre>
      </div>
      <div className="speech-test-text-block">
        <span>{getRefineLabel(result.refineProvider)}</span>
        <pre>{finalText}</pre>
      </div>
    </div>
  );
}

function getRefineLabel(provider: string | undefined): string {
  if (provider === 'server-llm') return 'LLM 处理后';
  if (provider === 'server-regex' || provider === 'browser-native-regex') return '规则识别后';
  if (provider?.startsWith('fallback') || provider === 'server-asr' || provider === 'browser-native-fallback') return '规则处理后';
  return '处理后';
}

function formatMeta(result: SpeechResult): string {
  const parts = [
    result.type === 'command' ? `指令:${result.command}` : '文本',
    result.provider,
    result.refineProvider === 'server-llm' ? 'LLM' : result.refineProvider ? '规则' : undefined,
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
