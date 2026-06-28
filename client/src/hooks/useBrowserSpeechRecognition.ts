import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/http';
import type { SpeechResult, VoiceCommandConfig } from '../types';

export type { SpeechResult } from '../types';

type SpeechState = 'idle' | 'listening' | 'processing' | 'unsupported' | 'error';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    item(index: number): SpeechRecognitionResultLike;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseBrowserSpeechRecognitionOptions {
  lang?: string;
  submitMode?: 'insert' | 'submit';
  useServerVoice?: boolean;
  continuous?: boolean;
  commands?: VoiceCommandConfig[];
  onResult: (result: SpeechResult) => void;
  onError?: (message: string) => void;
}

export interface UseBrowserSpeechRecognitionReturn {
  state: SpeechState;
  supported: boolean;
  listening: boolean;
  busy: boolean;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  toggle: () => void;
}

export function useBrowserSpeechRecognition({
  lang = 'zh-CN',
  submitMode = 'insert',
  useServerVoice = false,
  continuous = false,
  commands = [],
  onResult,
  onError,
}: UseBrowserSpeechRecognitionOptions): UseBrowserSpeechRecognitionReturn {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef('');
  const confidenceRef = useRef<number | undefined>(undefined);
  const startedAtRef = useRef(0);
  const suppressResultRef = useRef(false);
  const serverRecorderRef = useRef<{
    stream: MediaStream;
    context: AudioContext;
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    chunks: Float32Array[];
    sampleRate: number;
  } | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const submitModeRef = useRef(submitMode);
  const useServerVoiceRef = useRef(useServerVoice);
  const continuousRef = useRef(continuous);
  const commandsRef = useRef(commands);
  const [state, setState] = useState<SpeechState>(() => {
    if (typeof window === 'undefined') return 'unsupported';
    return window.SpeechRecognition || window.webkitSpeechRecognition ? 'idle' : 'unsupported';
  });
  const stateRef = useRef(state);

  stateRef.current = state;
  onResultRef.current = onResult;
  onErrorRef.current = onError;
  submitModeRef.current = submitMode;
  useServerVoiceRef.current = useServerVoice;
  continuousRef.current = continuous;
  commandsRef.current = commands;

  const cleanup = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    recognitionRef.current = null;
  }, []);

  const cleanupServerRecorder = useCallback(() => {
    const recorder = serverRecorderRef.current;
    if (!recorder) return null;
    recorder.processor.disconnect();
    recorder.source.disconnect();
    void recorder.context.close();
    recorder.stream.getTracks().forEach((track) => track.stop());
    serverRecorderRef.current = null;
    return recorder;
  }, []);

  const stopBrowserRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    suppressResultRef.current = false;
    setState('processing');
    try {
      recognition.stop();
    } catch {
      cleanup();
      setState('idle');
    }
  }, [cleanup]);

  const stopServerRecording = useCallback(() => {
    const recorder = cleanupServerRecorder();
    if (!recorder) return;
    setState('processing');
    const pcm = encodePcm16(resampleFloat32Chunks(recorder.chunks, recorder.sampleRate, 16000));
    void api.transcribeSpeech({
      audio: bytesToBase64(pcm),
      sampleRate: 16000,
      language: lang.startsWith('zh') ? 'zh' : lang,
      submitMode: submitModeRef.current,
    }).then((result) => {
      setState('idle');
      onResultRef.current(result);
    }).catch((err: unknown) => {
      setState('error');
      onErrorRef.current?.((err as Error).message || '后端语音识别失败');
      window.setTimeout(() => setState('idle'), 900);
    });
  }, [cleanupServerRecorder, lang]);

  const stop = useCallback(() => {
    if (useServerVoiceRef.current) {
      stopServerRecording();
      return;
    }
    stopBrowserRecognition();
  }, [stopBrowserRecognition, stopServerRecording]);

  const cancelBrowserRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setState((current) => (current === 'processing' ? 'idle' : current));
      return;
    }
    suppressResultRef.current = true;
    try {
      recognition.abort();
    } catch {
      cleanup();
      setState('idle');
    }
  }, [cleanup]);

  const cancel = useCallback(() => {
    cleanupServerRecorder();
    cancelBrowserRecognition();
    setState('idle');
  }, [cancelBrowserRecognition, cleanupServerRecorder]);

  const startServerRecording = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      setState('unsupported');
      onErrorRef.current?.('当前浏览器不支持录音上传');
      return;
    }
    if (serverRecorderRef.current) {
      stopServerRecording();
      return;
    }
    startedAtRef.current = performance.now();
    setState('processing');
    void navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const processor = context.createScriptProcessor(4096, 1, 1);
        const chunks: Float32Array[] = [];
        processor.onaudioprocess = (event) => {
          chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        };
        source.connect(processor);
        processor.connect(context.destination);
        serverRecorderRef.current = {
          stream,
          context,
          source,
          processor,
          chunks,
          sampleRate: context.sampleRate,
        };
        setState('listening');
      })
      .catch((err: unknown) => {
        setState('error');
        onErrorRef.current?.((err as Error).message || '无法访问麦克风');
        window.setTimeout(() => setState('idle'), 900);
      });
  }, [stopServerRecording]);

  const startBrowserRecognition = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setState('unsupported');
      onErrorRef.current?.('当前浏览器不支持本地语音识别');
      return;
    }

    if (recognitionRef.current) {
      stopBrowserRecognition();
      return;
    }

    transcriptRef.current = '';
    confidenceRef.current = undefined;
    suppressResultRef.current = false;
    startedAtRef.current = performance.now();

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = continuousRef.current;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setState('listening');
    recognition.onerror = (event) => {
      cleanup();
      if (suppressResultRef.current || event.error === 'aborted') {
        suppressResultRef.current = false;
        setState('idle');
        return;
      }
      setState('error');
      onErrorRef.current?.(event.message || `语音识别失败: ${event.error}`);
      window.setTimeout(() => setState('idle'), 900);
    };
    recognition.onresult = (event) => {
      let text = '';
      let confidence: number | undefined;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alternative = result[0];
        if (!alternative) continue;
        text += alternative.transcript;
        if (result.isFinal) confidence = alternative.confidence;
      }
      if (text.trim()) {
        transcriptRef.current = text.trim();
        confidenceRef.current = confidence;
      }
    };
    recognition.onend = () => {
      const message = transcriptRef.current.trim();
      const durationMs = Math.round(performance.now() - startedAtRef.current);
      const suppressed = suppressResultRef.current;
      suppressResultRef.current = false;
      cleanup();
      if (suppressed) {
        setState('idle');
        return;
      }
      if (!message) {
        setState('idle');
        return;
      }
      setState('processing');
      void api.interpretSpeech({
        transcript: message,
        submitMode: submitModeRef.current,
      }).then((result) => {
        setState('idle');
        onResultRef.current({
          ...result,
          confidence: confidenceRef.current,
          provider: result.provider ?? 'browser-native-server',
          durationMs: result.durationMs ?? durationMs,
        });
      }).catch(() => {
        setState('idle');
        const commandResult = matchVoiceCommand(message, commandsRef.current);
        if (commandResult) {
          onResultRef.current({
            ...commandResult,
            rawTranscript: message,
            refineProvider: commandResult.provider,
          });
          return;
        }
        onResultRef.current({
          type: 'text',
          message: submitModeRef.current === 'submit' ? `${message}\r` : message,
          confidence: confidenceRef.current,
          provider: 'browser-native-fallback',
          rawTranscript: message,
          refineProvider: 'browser-native-fallback',
          durationMs,
        });
      });
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      cleanup();
      setState('error');
      onErrorRef.current?.((err as Error).message || '语音识别启动失败');
      window.setTimeout(() => setState('idle'), 900);
    }
  }, [cleanup, lang, stopBrowserRecognition]);

  const start = useCallback(() => {
    if (state === 'processing') return;
    if (useServerVoiceRef.current) {
      startServerRecording();
      return;
    }
    startBrowserRecognition();
  }, [startBrowserRecognition, startServerRecording, state]);

  useEffect(() => {
    setState(() => {
      if (useServerVoice) {
        return navigator.mediaDevices && typeof AudioContext !== 'undefined' ? 'idle' : 'unsupported';
      }
      return window.SpeechRecognition || window.webkitSpeechRecognition ? 'idle' : 'unsupported';
    });
  }, [useServerVoice]);

  useEffect(() => {
    const resetAfterPageResume = () => {
      if (document.visibilityState === 'hidden') return;
      if (recognitionRef.current || serverRecorderRef.current) return;
      if (stateRef.current === 'listening' || stateRef.current === 'processing' || stateRef.current === 'error') {
        suppressResultRef.current = false;
        setState('idle');
      }
    };

    const stopBeforePageBackground = () => {
      suppressResultRef.current = true;
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.abort();
        } catch { /* ignore */ }
      }
      cleanup();
      cleanupServerRecorder();
      if (stateRef.current === 'listening' || stateRef.current === 'processing') {
        setState('idle');
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stopBeforePageBackground();
      else resetAfterPageResume();
    };

    window.addEventListener('pagehide', stopBeforePageBackground);
    window.addEventListener('pageshow', resetAfterPageResume);
    window.addEventListener('focus', resetAfterPageResume);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', stopBeforePageBackground);
      window.removeEventListener('pageshow', resetAfterPageResume);
      window.removeEventListener('focus', resetAfterPageResume);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [cleanup, cleanupServerRecorder]);

  useEffect(() => () => {
    cleanup();
    cleanupServerRecorder();
  }, [cleanup, cleanupServerRecorder]);

  return {
    state,
    supported: state !== 'unsupported',
    listening: state === 'listening',
    busy: state === 'listening' || state === 'processing',
    start,
    stop,
    cancel,
    toggle: state === 'listening' ? stop : start,
  };
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchVoiceCommand(text: string, commands: VoiceCommandConfig[]): SpeechResult | null {
  const normalized = normalizeSpeechText(text);
  for (const command of commands) {
    const matched = command.aliases.find((alias) => normalizeSpeechText(alias) === normalized);
    if (!matched) continue;
    return {
      type: 'command',
      command: command.id,
      message: command.label || matched,
      provider: 'browser-native-regex',
    };
  }
  return null;
}

function flattenChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function resampleFloat32Chunks(chunks: Float32Array[], inputRate: number, outputRate: number): Float32Array {
  const input = flattenChunks(chunks);
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i * ratio;
    const low = Math.floor(sourceIndex);
    const high = Math.min(low + 1, input.length - 1);
    const weight = sourceIndex - low;
    output[i] = input[low] * (1 - weight) + input[high] * weight;
  }
  return output;
}

function encodePcm16(input: Float32Array): Uint8Array {
  const output = new Uint8Array(input.length * 2);
  const view = new DataView(output.buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return output;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
