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
      command: string;
      confidence?: number;
      provider?: string;
      durationMs?: number;
    };

export interface SpeechTranscribeRequest {
  audio: string;
  sampleRate: number;
  language?: string;
  submitMode?: 'insert' | 'submit';
}

export interface SpeechInterpretRequest {
  transcript: string;
  submitMode?: 'insert' | 'submit';
}
