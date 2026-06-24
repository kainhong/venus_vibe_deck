import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalWriter {
  write: (data: string) => void;
  clear: () => void;
}

interface TerminalViewProps {
  /** 终端输入(键盘/IME)→ 回调 */
  onData?: (data: string) => void;
  /** 终端尺寸变化(cols/rows)→ 回调,用于同步后端 PTY */
  onResize?: (cols: number, rows: number) => void;
  /** 注册终端控制函数,供外部写入输出或清空 xterm */
  registerWriter?: (writer: TerminalWriter) => void;
  /** 终端键盘开关,支持运行时切换 */
  keyboardEnabled?: boolean;
}

export function TerminalView({ onData, onResize, registerWriter, keyboardEnabled = false }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const registerWriterRef = useRef(registerWriter);
  onDataRef.current = onData;
  onResizeRef.current = onResize;
  registerWriterRef.current = registerWriter;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 16,
      lineHeight: 1.2,
      cursorBlink: true,
      disableStdin: !keyboardEnabled,
      theme: {
        background: '#0b0b0f',
        foreground: '#e6e6e6',
        cursor: '#e6e6e6',
      },
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    const doFit = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fit.fit();
        onResizeRef.current?.(term.cols, term.rows);
      } catch { /* ignore */ }
    };

    term.onData((data) => onDataRef.current?.(data));
    registerWriterRef.current?.({
      write: (d: string) => term.write(d),
      clear: () => term.reset(),
    });

    doFit();
    const raf = requestAnimationFrame(doFit);
    const ro = new ResizeObserver(() => doFit());
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.disableStdin = !keyboardEnabled;
    }
  }, [keyboardEnabled]);

  return <div ref={containerRef} className="terminal-container" />;
}
