import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechResult =
  | {
      type: 'text';
      message: string;
      confidence?: number;
      provider?: string;
      durationMs?: number;
    }
  | {
      type: 'command';
      message: string;
      command: 'submit' | 'escape' | 'interrupt' | 'up' | 'down' | 'space';
      confidence?: number;
      provider?: string;
      durationMs?: number;
    };

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
  onResult: (result: SpeechResult) => void;
  onError?: (message: string) => void;
}

export function useBrowserSpeechRecognition({
  lang = 'zh-CN',
  submitMode = 'insert',
  onResult,
  onError,
}: UseBrowserSpeechRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef('');
  const confidenceRef = useRef<number | undefined>(undefined);
  const startedAtRef = useRef(0);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const submitModeRef = useRef(submitMode);
  const [state, setState] = useState<SpeechState>(() => {
    if (typeof window === 'undefined') return 'unsupported';
    return window.SpeechRecognition || window.webkitSpeechRecognition ? 'idle' : 'unsupported';
  });

  onResultRef.current = onResult;
  onErrorRef.current = onError;
  submitModeRef.current = submitMode;

  const cleanup = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    recognitionRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setState('processing');
    try {
      recognition.stop();
    } catch {
      cleanup();
      setState('idle');
    }
  }, [cleanup]);

  const start = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setState('unsupported');
      onErrorRef.current?.('当前浏览器不支持本地语音识别');
      return;
    }

    if (recognitionRef.current) {
      stop();
      return;
    }

    transcriptRef.current = '';
    confidenceRef.current = undefined;
    startedAtRef.current = performance.now();

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setState('listening');
    recognition.onerror = (event) => {
      cleanup();
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
      cleanup();
      setState('idle');
      if (!message) return;
      onResultRef.current({
        type: 'text',
        message: submitModeRef.current === 'submit' ? `${message}\r` : message,
        confidence: confidenceRef.current,
        provider: 'browser-native',
        durationMs,
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
  }, [cleanup, lang, stop]);

  useEffect(() => cleanup, [cleanup]);

  return {
    state,
    supported: state !== 'unsupported',
    listening: state === 'listening',
    start,
    stop,
    toggle: state === 'listening' ? stop : start,
  };
}
