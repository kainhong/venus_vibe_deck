import { config } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('local-asr');

interface LocalAsrOptions {
  audio: Buffer;
  sampleRate: number;
  language: string;
}

export async function transcribeWithLocalAsr({ audio, sampleRate, language }: LocalAsrOptions): Promise<string> {
  const url = `${config.voice.localAsrUrl.replace(/\/$/, '')}/transcribe`;
  logger.info('local asr request', { audioBytes: audio.length, sampleRate, language });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: audio.toString('base64'),
        sample_rate: sampleRate,
        language,
      }),
    });
  } catch (err) {
    logger.warn('local asr request failed', { url, err: err as Error });
    throw new Error(`local ASR unavailable: ${url}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`local ASR failed: HTTP ${res.status} ${body}`);
  }

  const data = await res.json() as { text: string; duration_ms: number };
  logger.info('local asr completed', { text: data.text.slice(0, 50), durationMs: data.duration_ms });
  return data.text;
}
