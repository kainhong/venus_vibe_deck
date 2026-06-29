import { EdgeTTS } from 'edge-tts-universal';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('tts');

/**
 * 语音合成入口。
 * - edge: 走微软 Edge 在线 TTS,无需 key。
 * - bailian: 走百炼 SpeechSynthesizer,支持复刻 voice_id。
 */
export async function synthesize(text: string): Promise<Buffer | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!config.voice.ttsEnabled) {
    logger.warn('tts disabled');
    return null;
  }

  const startedAt = Date.now();
  try {
    const audio = config.voice.ttsProvider === 'bailian'
      ? await synthesizeBailian(trimmed)
      : await synthesizeEdge(trimmed);
    logger.info('tts synthesize completed', {
      provider: config.voice.ttsProvider,
      textLength: trimmed.length,
      audioBytes: audio.length,
      elapsedMs: Date.now() - startedAt,
    });
    return audio;
  } catch (err) {
    logger.error('tts synthesize failed', { provider: config.voice.ttsProvider, err: err as Error, textLength: trimmed.length });
    return null;
  }
}

async function synthesizeEdge(text: string): Promise<Buffer> {
  const tts = new EdgeTTS(text, config.voice.ttsVoice, {
    rate: config.voice.ttsRate,
    volume: config.voice.ttsVolume,
  });
  const result = await tts.synthesize();
  return Buffer.from(await result.audio.arrayBuffer());
}

async function synthesizeBailian(text: string): Promise<Buffer> {
  if (!config.voice.ttsApiKey) throw new Error('VOICE_TTS_API_KEY is required for Bailian TTS');
  const res = await fetch(config.voice.ttsBaseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.voice.ttsApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg, audio/wav, application/json',
    },
    body: JSON.stringify({
      model: config.voice.ttsModel,
      input: { text },
      parameters: {
        voice: config.voice.ttsVoice,
        format: config.voice.ttsFormat,
        sample_rate: config.voice.ttsSampleRate,
        rate: config.voice.ttsRate,
        volume: config.voice.ttsVolume,
        pitch: config.voice.ttsPitch,
      },
    }),
  });
  const contentType = res.headers.get('content-type') ?? '';
  const data = Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`Bailian TTS HTTP ${res.status}: ${data.toString('utf8')}`);
  if (contentType.startsWith('audio/')) return data;
  return await extractAudioFromJson(data);
}

async function extractAudioFromJson(data: Buffer): Promise<Buffer> {
  const parsed = JSON.parse(data.toString('utf8')) as unknown;
  const output = readObject(readObject(parsed).output);
  const inline = findAudioData(output);
  if (inline) return inline;
  const url = findAudioUrl(output);
  if (!url) throw new Error(`Bailian TTS response has no audio payload: ${data.toString('utf8')}`);
  return downloadAudio(url);
}

async function downloadAudio(url: string): Promise<Buffer> {
  const res = await fetch(url);
  const data = Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`Bailian TTS audio download HTTP ${res.status}`);
  return data;
}

function findAudioUrl(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of ['url', 'audio_url', 'demo_audio']) {
    const child = obj[key];
    if (typeof child === 'string' && /^https?:\/\//.test(child)) return child;
  }
  for (const child of Object.values(obj)) {
    const found = findAudioUrl(child);
    if (found) return found;
  }
  return undefined;
}

function findAudioData(value: unknown): Buffer | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioData(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of ['data', 'audio', 'content']) {
    const child = obj[key];
    if (typeof child === 'string') {
      const decoded = decodeAudioData(child);
      if (decoded) return decoded;
    }
  }
  for (const child of Object.values(obj)) {
    const found = findAudioData(child);
    if (found) return found;
  }
  return undefined;
}

function decodeAudioData(value: string): Buffer | undefined {
  const raw = value.startsWith('data:') && value.includes(',') ? value.split(',', 2)[1] : value;
  try {
    const decoded = Buffer.from(raw, 'base64');
    return isAudioBuffer(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function isAudioBuffer(value: Buffer): boolean {
  return value.subarray(0, 3).toString('utf8') === 'ID3' ||
    value.subarray(0, 4).toString('utf8') === 'RIFF' ||
    (value[0] === 0xff && (value[1] === 0xfb || value[1] === 0xf3 || value[1] === 0xf2));
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
