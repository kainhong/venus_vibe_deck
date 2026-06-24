import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/http';
import type { ConfigDoc, DirListing, HistoryDoc } from '../types';

interface AppContextValue {
  config: ConfigDoc | null;
  history: HistoryDoc | null;
  loading: boolean;
  error: string | null;
  reloadConfig: () => Promise<void>;
  /** 保存配置:乐观更新 + 失败回滚 */
  saveConfig: (doc: ConfigDoc) => Promise<void>;
  /** 记录一次 workspace 使用(新建 session 成功后调) */
  recordWorkspace: (path: string) => Promise<void>;
  /** 目录浏览(后端白名单约束) */
  listDir: (path?: string) => Promise<DirListing>;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * 应用级状态:CLI 配置 + workspace 历史,从后端 HTTP 加载,跨组件共享。
 * 与 useWebSocket(PTY 收发)解耦 —— 配置是正交关注点,走 HTTP REST。
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigDoc | null>(null);
  const [history, setHistory] = useState<HistoryDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 防 StrictMode 双调用导致重复请求
  const loadedRef = useRef(false);

  // 初次加载 config + history
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const [c, h] = await Promise.all([api.getConfig(), api.getHistory()]);
        setConfig(c);
        setHistory(h);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reloadConfig = useCallback(async () => {
    try {
      setConfig(await api.getConfig());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const saveConfig = useCallback(
    async (doc: ConfigDoc) => {
      const prev = config;
      setConfig(doc); // 乐观更新,失败回滚
      try {
        setConfig(await api.putConfig(doc));
        setError(null);
      } catch (e) {
        setConfig(prev);
        setError((e as Error).message);
        throw e;
      }
    },
    [config],
  );

  const recordWorkspace = useCallback(async (path: string) => {
    if (!path) return;
    try {
      setHistory(await api.addWorkspace(path));
    } catch {
      // 历史记录失败不影响主流程
    }
  }, []);

  const listDir = useCallback((path?: string) => api.listDir(path), []);

  return (
    <AppContext.Provider value={{ config, history, loading, error, reloadConfig, saveConfig, recordWorkspace, listDir }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
