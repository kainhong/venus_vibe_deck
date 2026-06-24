import { useCallback, useRef, useState } from 'react';
import { useWebSocket, type CreateSessionOptions } from './hooks/useWebSocket';
import { useApp } from './state/AppContext';
import { TerminalView } from './components/Terminal';
import { ControlPanel } from './components/ControlPanel';
import { StatusBar } from './components/StatusBar';
import { SettingsPage } from './components/SettingsPage';
import { NewSessionPanel } from './components/NewSessionPanel';

type View = 'terminal' | 'settings' | 'newSession';

export default function App() {
  // writerRef 桥接:useWebSocket 收到的终端输出 → 写入 xterm
  const writerRef = useRef<((data: string) => void) | null>(null);
  const handleData = useCallback((data: string) => writerRef.current?.(data), []);
  const registerWriter = useCallback((write: (data: string) => void) => {
    writerRef.current = write;
  }, []);

  const api = useWebSocket(handleData);
  const { recordWorkspace } = useApp();
  const [view, setView] = useState<View>('terminal');

  const handleCreate = useCallback(
    (opts: CreateSessionOptions) => {
      api.createSession(opts);
      if (opts.cwd) recordWorkspace(opts.cwd); // 乐观记录 workspace 历史
      setView('terminal');
    },
    [api, recordWorkspace],
  );

  const closeCurrent = useCallback(() => {
    if (api.currentSessionId) api.destroySession(api.currentSessionId);
  }, [api]);

  return (
    <div className="app">
      <StatusBar
        connected={api.connected}
        sessions={api.sessions}
        currentSessionId={api.currentSessionId}
        onSelect={api.switchSession}
        onNew={() => setView('newSession')}
        onSettings={() => setView('settings')}
        onCloseCurrent={closeCurrent}
      />

      <main className="terminal-area">
        <TerminalView onData={api.sendInput} onResize={api.sendResize} registerWriter={registerWriter} />
      </main>

      <ControlPanel onKey={api.sendInput} />

      {view === 'settings' && <SettingsPage onClose={() => setView('terminal')} />}
      {view === 'newSession' && (
        <NewSessionPanel onClose={() => setView('terminal')} onCreate={handleCreate} />
      )}
    </div>
  );
}
