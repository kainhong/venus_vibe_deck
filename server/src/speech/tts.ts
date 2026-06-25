import { EdgeTTS } from 'edge-tts-universal';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('tts');

/**
 * EdgeTTS 语音合成:免费、无需 API key、支持中文多音色。
 * 底层走微软 Edge 在线 TTS 服务(WS),Node 环境可用。
 * - synthesize: 一次性合成完整 MP3
 * - synthesizeStream: 流式分块输出(供后续 WS 推流)
 */
export async function synthesize(text: string): Promise<Buffer | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!config.voice.ttsEnabled) {
    logger.warn('tts disabled (VOICE_TTS_ENABLED=false)');
    return null;
  }

  const startedAt = Date.now();
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of synthesizeStream(trimmed)) {
      chunks.push(chunk);
    }
  } catch (err) {
    logger.error('tts synthesize failed', { err: err as Error, textLength: trimmed.length });
    return null;
  }

  const audio = Buffer.concat(chunks);
  logger.info('tts synthesize completed', {
    textLength: trimmed.length,
    audioBytes: audio.length,
    elapsedMs: Date.now() - startedAt,
  });
  return audio;
}

export async function* synthesizeStream(text: string): AsyncGenerator<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (!config.voice.ttsEnabled) {
    logger.warn('tts stream skipped: disabled');
    return;
  }

  const tts = new EdgeTTS(trimmed, config.voice.ttsVoice, {
    rate: config.voice.ttsRate,
    volume: config.voice.ttsVolume,
  });
  const result = await tts.synthesize();
  const buf = Buffer.from(await result.audio.arrayBuffer());
  if (buf.length) yield buf;
}
