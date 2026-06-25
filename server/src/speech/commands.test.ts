import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpeechCommand } from './commands.js';

const commands = [{
  id: 'submit',
  label: '回车',
  aliases: ['回车', '提交', '发送', '确认'],
}, {
  id: 'up',
  label: '上',
  aliases: ['上', '向上', '上一个'],
}];

test('matchSpeechCommand matches exact aliases only', () => {
  assert.deepEqual(matchSpeechCommand('提交', commands), {
    type: 'command',
    command: 'submit',
    message: '回车',
    provider: 'server-regex',
  });

  assert.deepEqual(matchSpeechCommand(' 上一个 ', commands), {
    type: 'command',
    command: 'up',
    message: '上',
    provider: 'server-regex',
  });
});

test('matchSpeechCommand does not classify task requests as commands', () => {
  assert.equal(matchSpeechCommand('帮我提交一下代码', commands), null);
  assert.equal(matchSpeechCommand('帮我获取一下最新代码', commands), null);
  assert.equal(matchSpeechCommand('帮我看一下项目文件', commands), null);
});
