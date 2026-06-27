import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import { VOICE_RECORDINGS_DIR } from '../storage/paths.js';
import type { SpeechRecording } from './types.js';

const WAV_MIME = 'audio/wav';

export async function saveSpeechRecording(pcm16: Buffer, sampleRate: number): Promise<SpeechRecording> {
  await mkdir(VOICE_RECORDINGS_DIR, { recursive: true });
  const baseName = formatRecordingName(new Date());
  const wav = encodeWav(pcm16, sampleRate);
  const id = await writeRecordingFile(baseName, wav);
  return {
    id,
    url: `/api/speech/recordings/${encodeURIComponent(id)}`,
    mimeType: WAV_MIME,
    bytes: wav.length,
  };
}

export async function serveSpeechRecording(id: string, res: ServerResponse): Promise<boolean> {
  if (!/^[A-Za-z0-9_.-]+\.wav$/.test(id)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('invalid recording id');
    return true;
  }

  const file = join(VOICE_RECORDINGS_DIR, id);
  const info = await stat(file);
  const data = await readFile(file);
  res.writeHead(200, {
    'Content-Type': WAV_MIME,
    'Content-Length': info.size.toString(),
    'Content-Disposition': `attachment; filename="${id}"`,
    'Cache-Control': 'private, max-age=86400',
  });
  res.end(data);
  return true;
}

async function writeRecordingFile(baseName: string, wav: Buffer): Promise<string> {
  for (let index = 0; index < 100; index += 1) {
    const id = index === 0 ? `${baseName}.wav` : `${baseName}-${index + 1}.wav`;
    try {
      await writeFile(join(VOICE_RECORDINGS_DIR, id), wav, { flag: 'wx' });
      return id;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error('too many voice recordings created in the same second');
}

function formatRecordingName(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/:/g, '-');
}

function encodeWav(pcm16: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm16.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm16.length, 40);
  return Buffer.concat([header, pcm16]);
}
