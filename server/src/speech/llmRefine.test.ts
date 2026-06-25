import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandPrompt, buildRefineMessages, stripJsonFence, validateSpeechResult } from './llmRefine.js';

test('buildRefineMessages appends mandatory JSON contract and configured commands after external prompt', () => {
  const messages = buildRefineMessages({
    transcript: '嗯 帮我提交',
    basePrompt: '# Output Preference\n直接输出优化后的流利文本',
    commands: [{
      id: 'submit',
      label: '回车',
      input: 'enter',
      keyboard: '\r',
      aliases: ['回车', '提交'],
    }],
    userTemplate: 'Transcript:\n{{transcript}}',
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /直接输出优化后的流利文本/);
  assert.match(messages[0].content, /Mandatory Output Contract/);
  assert.match(messages[0].content, /Return only one valid JSON object/);
  assert.match(messages[0].content, /Configured terminal control commands/);
  assert.match(messages[0].content, /"id": "submit"/);
  assert.match(messages[0].content, /aliases/);
  assert.equal(messages[1].content, 'Transcript:\n嗯 帮我提交');
  assert.ok(
    messages[0].content.indexOf('直接输出优化后的流利文本') <
      messages[0].content.indexOf('Mandatory Output Contract'),
  );
});

test('buildCommandPrompt includes command input, keyboard, and aliases', () => {
  assert.equal(buildCommandPrompt([{
    id: 'escape',
    label: 'Esc',
    input: 'esc',
    keyboard: '\u001b',
    aliases: ['取消', 'esc'],
  }]), JSON.stringify([{
    id: 'escape',
    label: 'Esc',
    input: 'esc',
    keyboard: '\u001b',
    aliases: ['取消', 'esc'],
  }], null, 2));
});

test('validateSpeechResult accepts configured command ids only', () => {
  assert.deepEqual(validateSpeechResult({
    type: 'command',
    message: '提交',
    command: 'submit',
  }, ['submit']), {
    type: 'command',
    message: '提交',
    command: 'submit',
    provider: 'server-llm',
  });

  assert.equal(validateSpeechResult({
    type: 'command',
    message: '危险',
    command: 'unknown',
  }, ['submit']), null);
});

test('stripJsonFence removes markdown json fence', () => {
  assert.equal(stripJsonFence('```json\n{"type":"text","message":"hi"}\n```'), '{"type":"text","message":"hi"}');
});
