import { resolve } from 'node:path';

/** 路径越权错误,由 HTTP 层转 403 */
export class PathForbiddenError extends Error {
  constructor(path: string) {
    super(`path outside allowed roots: ${path}`);
    this.name = 'PathForbiddenError';
  }
}

/**
 * 路径安全校验 —— 复用 static.ts 的 normalize+startsWith 思路。
 * resolve 已处理 `..`;比较时末尾加 '/' 防 /home/user 误匹配 /home/userevil。
 * 违例抛 PathForbiddenError,返回解析后的绝对路径。
 */
export function assertWithinRoots(path: string, roots: readonly string[]): string {
  const abs = resolve(path);
  const ok = roots.some((r) => {
    const root = resolve(r);
    return abs === root || abs.startsWith(root + '/');
  });
  if (!ok) throw new PathForbiddenError(abs);
  return abs;
}
