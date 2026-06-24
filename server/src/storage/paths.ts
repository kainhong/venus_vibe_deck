import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 持久化路径集中定义 —— 单一改动点。
 * VENUS_DATA_DIR 可覆盖数据目录(测试/容器挂载卷),默认 ~/.venus-hube/。
 */
export const DATA_DIR = process.env.VENUS_DATA_DIR ?? join(homedir(), '.venus-hube');
export const CONFIG_FILE = join(DATA_DIR, 'config.json'); // CLI 配置
export const HISTORY_FILE = join(DATA_DIR, 'history.json'); // workspace 历史

/**
 * list-dir 浏览白名单根(逗号分隔)。
 * 仅约束"浏览"功能,防越权枚举服务器目录;手动输入/历史/spawn cwd 不受此限
 * (用户明确知道路径时可手输任意 workspace)。
 */
export const ALLOWED_ROOTS: readonly string[] = (process.env.VENUS_DIR_ROOTS ?? `${homedir()},${process.cwd()}`)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
