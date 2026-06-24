import { config } from '../config.js';
import { refineTranscriptWithLlm } from './llmRefine.js';
import { transcribeWithRealtimeAsr } from './realtimeAsr.js';
import type { SpeechResult, SpeechTranscribeRequest } from './types.js';
import { createLogger } from '../logger.js';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const logger = createLogger('speech');

function applySubmitMode(result: SpeechResult, submitMode: 'insert' | 'submit'): SpeechResult {
  if (result.type !== 'text') return result;
  return {
    ...result,
    message: submitMode === 'submit' ? `${result.message}\r` : result.message,
  };
}

export async function transcribeSpeech(req: SpeechTranscribeRequest): Promise<SpeechResult> {
  if (!req.audio) throw new Error('audio required');
  const sampleRate = Number(req.sampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate !== config.voice.asrSampleRate) {
    throw new Error(`sampleRate must be ${config.voice.asrSampleRate}`);
  }

  const audio = Buffer.from(req.audio, 'base64');
  if (!audio.length) throw new Error('audio is empty');
  if (audio.length > MAX_AUDIO_BYTES) throw new Error('audio too large');

  const startedAt = Date.now();
  logger.info('speech transcription started', {
    audioBytes: audio.length,
    sampleRate,
    language: req.language || 'zh',
    submitMode: req.submitMode ?? 'insert',
  });
  const transcript = await transcribeWithRealtimeAsr({
    audio,
    sampleRate,
    language: req.language || 'zh',
  });
  logger.info('speech asr completed', {
    transcriptLength: transcript.length,
    elapsedMs: Date.now() - startedAt,
  });
  const result = await refineTranscriptWithLlm(transcript);
  const withMeta = {
    ...applySubmitMode(result, req.submitMode ?? 'insert'),
    durationMs: Date.now() - startedAt,
  };
  logger.info('speech transcription completed', {
    resultType: withMeta.type,
    command: withMeta.type === 'command' ? withMeta.command : undefined,
    durationMs: withMeta.durationMs,
  });
  return withMeta;
}
