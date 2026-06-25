import '../env.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { refineTranscriptWithLlm } from './llmRefine.js';

interface SpeechDatasetItem {
  text: string;
  id: string;
}

interface SpeechEvalResult {
  item: SpeechDatasetItem;
  actual: string;
  message: string;
  passed: boolean;
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const datasetFile = resolve(rootDir, 'docs/data/speech.jsonl');
const defaultOutputFile = resolve(rootDir, 'docs/data/speech-eval-result.md');

function parseLimit(): number | null {
  const arg = process.argv.find((item) => item.startsWith('--limit='));
  const raw = arg?.split('=')[1] ?? process.env.SPEECH_EVAL_LIMIT;
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseGrep(): RegExp | null {
  const arg = process.argv.find((item) => item.startsWith('--grep='));
  const raw = arg?.slice('--grep='.length) ?? process.env.SPEECH_EVAL_GREP;
  return raw ? new RegExp(raw) : null;
}

function parseOutputFile(): string {
  const arg = process.argv.find((item) => item.startsWith('--output='));
  const raw = arg?.slice('--output='.length) ?? process.env.SPEECH_EVAL_OUTPUT;
  return raw ? resolve(process.cwd(), raw) : defaultOutputFile;
}

function parseDataset(content: string): SpeechDatasetItem[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const value = JSON.parse(line) as Partial<SpeechDatasetItem>;
      if (typeof value.text !== 'string' || typeof value.id !== 'string') {
        throw new Error(`Invalid speech dataset item at line ${index + 1}`);
      }
      return { text: value.text, id: value.id };
    });
}

function resultId(result: Awaited<ReturnType<typeof refineTranscriptWithLlm>>): string {
  return result.type === 'command' ? result.command : 'none';
}

async function evaluateItem(item: SpeechDatasetItem): Promise<SpeechEvalResult> {
  const result = await refineTranscriptWithLlm(item.text);
  const actual = resultId(result);
  return {
    item,
    actual,
    message: result.message,
    passed: actual === item.id,
  };
}

function escapeTableCell(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function renderResultMarkdown({
  command,
  datasetPath,
  grep,
  limit,
  elapsedSeconds,
  results,
}: {
  command: string;
  datasetPath: string;
  grep: RegExp | null;
  limit: number | null;
  elapsedSeconds: string;
  results: SpeechEvalResult[];
}): string {
  const failed = results.filter((item) => !item.passed);
  const rows = results.map((result, index) => [
    String(index + 1),
    result.passed ? 'PASS' : 'FAIL',
    result.item.id,
    result.actual,
    escapeTableCell(result.item.text),
    escapeTableCell(result.message),
  ]);
  return [
    '# Speech Eval Result',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Dataset: \`${datasetPath}\``,
    '',
    'Command:',
    '',
    '```bash',
    command,
    '```',
    '',
    'Filters:',
    '',
    `- Grep: \`${grep?.source ?? 'none'}\``,
    `- Limit: \`${limit ?? 'none'}\``,
    '',
    'Summary:',
    '',
    `- Passed: \`${results.length - failed.length}/${results.length}\``,
    `- Failed: \`${failed.length}/${results.length}\``,
    `- Duration: \`${elapsedSeconds}s\``,
    '',
    '## QA Results',
    '',
    '| # | Status | Expected A | Actual A | Q: Speech Text | Model Message |',
    '|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '## Failed QA',
    '',
    failed.length
      ? [
        '| # | Expected A | Actual A | Q: Speech Text | Model Message |',
        '|---|---|---|---|---|',
        ...failed.map((result, index) => `| ${index + 1} | ${result.item.id} | ${result.actual} | ${escapeTableCell(result.item.text)} | ${escapeTableCell(result.message)} |`),
      ].join('\n')
      : 'None.',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  if (!config.voice.llmApiKey) {
    console.log('Speech dataset eval skipped: VOICE_LLM_API_KEY is not configured.');
    return;
  }

  const limit = parseLimit();
  const grep = parseGrep();
  const outputFile = parseOutputFile();
  const allItems = parseDataset(await readFile(datasetFile, 'utf8'));
  const items = allItems
    .filter((item) => !grep || grep.test(item.text))
    .slice(0, limit ?? undefined);
  if (!items.length) {
    console.log('Speech dataset eval skipped: no samples matched.');
    return;
  }
  const startedAt = Date.now();
  const results: SpeechEvalResult[] = [];

  for (const [index, item] of items.entries()) {
    const result = await evaluateItem(item);
    results.push(result);
    const status = result.passed ? 'ok' : 'fail';
    console.log(`${status} ${index + 1}/${items.length} expected=${item.id} actual=${result.actual} text=${JSON.stringify(item.text)}`);
  }

  const failed = results.filter((item) => !item.passed);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nSpeech dataset eval: ${results.length - failed.length}/${results.length} passed in ${elapsedSeconds}s`);
  const markdown = renderResultMarkdown({
    command: `npm run test:speech${process.argv.slice(2).length ? ` -- ${process.argv.slice(2).join(' ')}` : ''}`,
    datasetPath: 'docs/data/speech.jsonl',
    grep,
    limit,
    elapsedSeconds,
    results,
  });
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, markdown, 'utf8');
  console.log(`Speech dataset eval result written to ${outputFile}`);

  if (failed.length) {
    console.log('\nFailed samples:');
    for (const failure of failed) {
      console.log(JSON.stringify({
        expected: failure.item.id,
        actual: failure.actual,
        text: failure.item.text,
        message: failure.message,
      }));
    }
    process.exitCode = 1;
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
