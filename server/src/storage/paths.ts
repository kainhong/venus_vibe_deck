import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 持久化路径集中定义 —— 单一改动点。
 * 配置放在运行目录下 config/ 文件夹,方便用户就近维护。
 * 历史等运行时数据放 ~/.venus-hube/。
 */
export const DATA_DIR = process.env.VENUS_DATA_DIR ?? join(homedir(), '.venus-hube');
export const CONFIG_DIR = join(process.cwd(), 'config');
export const CONFIG_FILE = join(CONFIG_DIR, 'settings.json');
export const HISTORY_FILE = join(DATA_DIR, 'history.json');

/**
 * list-dir 浏览白名单根(逗号分隔)。
 * 仅约束"浏览"功能,防越权枚举服务器目录;手动输入/历史/spawn cwd 不受此限
 * (用户明确知道路径时可手输任意 workspace)。
 */
export const ALLOWED_ROOTS: readonly string[] = (process.env.VENUS_DIR_ROOTS ?? `${homedir()},${process.cwd()}`)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
