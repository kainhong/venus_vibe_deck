export interface SpeechRecording {
  id: string;
  url: string;
  mimeType: string;
  bytes: number;
}

export type SpeechResult =
  | {
      type: 'text';
      message: string;
      confidence?: number;
      provider?: string;
      rawTranscript?: string;
      refineProvider?: string;
      durationMs?: number;
      recording?: SpeechRecording;
    }
  | {
      type: 'command';
      message: string;
      command: string;
      confidence?: number;
      provider?: string;
      rawTranscript?: string;
      refineProvider?: string;
      durationMs?: number;
      recording?: SpeechRecording;
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
