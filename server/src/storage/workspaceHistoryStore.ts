import { readJson, writeJson } from './jsonStore.js';
import { HISTORY_FILE } from './paths.js';

export interface WorkspaceHistoryEntry {
  path: string;
  lastUsedAt: number;
  count: number;
}

export interface HistoryDoc {
  workspaces: WorkspaceHistoryEntry[];
}

/** 历史上限,防无限膨胀(LRU 思路:按 lastUsedAt 降序保留最近 N 条) */
export const HISTORY_LIMIT = 20;

export async function loadHistory(): Promise<HistoryDoc> {
  const doc = await readJson<HistoryDoc | null>(HISTORY_FILE, null);
  if (!doc || !Array.isArray(doc.workspaces)) return { workspaces: [] };
  return doc;
}

/**
 * 记录一次 workspace 使用:命中则 count++/更新时间,否则新增;
 * 去重后按 lastUsedAt 降序截断 HISTORY_LIMIT。
 */
export async function addWorkspace(path: string): Promise<HistoryDoc> {
  const doc = await loadHistory();
  const now = Date.now();
  const existing = doc.workspaces.find((w) => w.path === path);
  if (existing) {
    existing.count += 1;
    existing.lastUsedAt = now;
  } else {
    doc.workspaces.push({ path, lastUsedAt: now, count: 1 });
  }
  doc.workspaces.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  doc.workspaces = doc.workspaces.slice(0, HISTORY_LIMIT);
  await writeJson(HISTORY_FILE, doc);
  return doc;
}
