import WebSocket from 'ws';
import { config } from '../config.js';

interface AsrOptions {
  audio: Buffer;
  sampleRate: number;
  language: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function eventId(): string {
  return `event_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function sendEvent(ws: WebSocket, event: unknown): void {
  ws.send(JSON.stringify(event));
}

function collectTranscriptCandidates(value: unknown, into: string[] = []): string[] {
  if (!value || typeof value !== 'object') return into;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'transcript' || key === 'text') && typeof child === 'string' && child.trim()) {
      into.push(child.trim());
      continue;
    }
    if (typeof child === 'object') collectTranscriptCandidates(child, into);
  }
  return into;
}

function isFinalTranscriptEvent(event: Record<string, unknown>): boolean {
  const type = typeof event.type === 'string' ? event.type : '';
  return /transcription.*(completed|done)|transcript.*done|completed$/.test(type);
}

async function streamAudio(ws: WebSocket, audio: Buffer): Promise<void> {
  const chunkBytes = Math.max(320, config.voice.asrChunkBytes);
  for (let offset = 0; offset < audio.length; offset += chunkBytes) {
    const chunk = audio.subarray(offset, offset + chunkBytes);
    sendEvent(ws, {
      event_id: eventId(),
      type: 'input_audio_buffer.append',
      audio: chunk.toString('base64'),
    });
    if (config.voice.asrChunkIntervalMs > 0) await sleep(config.voice.asrChunkIntervalMs);
  }
  sendEvent(ws, {
    event_id: eventId(),
    type: 'input_audio_buffer.commit',
  });
}

export async function transcribeWithRealtimeAsr({ audio, sampleRate, language }: AsrOptions): Promise<string> {
  if (!config.voice.asrApiKey) throw new Error('VOICE_ASR_API_KEY is not configured');
  if (!audio.length) throw new Error('audio is empty');

  const url = new URL(config.voice.asrBaseUrl);
  url.searchParams.set('model', config.voice.asrModel);

  return await new Promise<string>((resolve, reject) => {
    const candidates: string[] = [];
    let settled = false;
    let opened = false;
    let audioStarted = false;
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${config.voice.asrApiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    const finish = (err?: Error, transcript?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) {
        reject(err);
        return;
      }
      const finalTranscript = transcript ?? candidates.sort((a, b) => b.length - a.length)[0] ?? '';
      if (!finalTranscript.trim()) {
        reject(new Error('ASR returned empty transcript'));
        return;
      }
      resolve(finalTranscript.trim());
    };

    const timeout = setTimeout(() => {
      finish(new Error('ASR request timed out'));
    }, config.voice.asrTimeoutMs);

    ws.on('open', () => {
      opened = true;
      sendEvent(ws, {
        event_id: eventId(),
        type: 'session.update',
        session: {
          modalities: ['text'],
          input_audio_format: 'pcm',
          sample_rate: sampleRate,
          input_audio_transcription: {
            language,
          },
          turn_detection: null,
        },
      });
    });

    ws.on('message', (raw) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = typeof event.type === 'string' ? event.type : '';
      if (type === 'error') {
        finish(new Error(JSON.stringify(event)));
        return;
      }

      candidates.push(...collectTranscriptCandidates(event));
      if (!audioStarted && opened && (type === 'session.updated' || type === 'session.created')) {
        audioStarted = true;
        void streamAudio(ws, audio).catch((err: unknown) => finish(err as Error));
      }

      if (isFinalTranscriptEvent(event)) {
        const transcript = collectTranscriptCandidates(event).sort((a, b) => b.length - a.length)[0];
        if (transcript) finish(undefined, transcript);
      }
    });

    ws.on('error', (err) => finish(err));
    ws.on('close', () => {
      if (!settled && candidates.length > 0) finish();
      else if (!settled) finish(new Error('ASR connection closed before transcript'));
    });
  });
}
