import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 通用 JSON 读写。
 * - readJson:文件缺失/解析失败 → 返回 fallback(容错,首次启动无文件)
 * - writeJson:mkdir -p + 写 .tmp 再 rename(原子写,防半截文件)
 *   注:不防并发丢失更新,无鉴权局域网场景接受 last-write-wins。
 */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(file: string, data: T): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, file); // 原子替换
}
