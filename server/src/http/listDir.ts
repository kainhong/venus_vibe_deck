import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ALLOWED_ROOTS } from '../storage/paths.js';
import { assertWithinRoots } from '../util/pathGuard.js';

export interface DirEntry {
  name: string;
  isDir: boolean;
}

export interface DirListing {
  path: string;
  entries: DirEntry[];
}

/**
 * 安全目录浏览(供 workspace 选择器的"浏览"按钮)。
 * - path 缺省 → 第一个允许根(通常 HOME)
 * - assertWithinRoots 校验白名单,违例抛 PathForbiddenError(由 router 转 403)
 * - 隐藏文件(.开头)过滤,目录优先排序
 */
export async function listDir(path?: string): Promise<DirListing> {
  const target = path
    ? assertWithinRoots(path, ALLOWED_ROOTS)
    : resolve(ALLOWED_ROOTS[0] ?? process.cwd());
  const names = await readdir(target);
  const entries: DirEntry[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue; // 隐藏文件过滤
    try {
      const info = await stat(join(target, name));
      entries.push({ name, isDir: info.isDirectory() });
    } catch {
      // 无权限/符号链接断裂 → 跳过该条
    }
  }
  entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  return { path: target, entries };
}
