export type SpeechCommand = 'submit' | 'escape' | 'interrupt' | 'up' | 'down' | 'space';

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
      command: SpeechCommand;
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
