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
  /** 终端键盘开关,支持运行时切换。默认 false(不唤起软键盘) */
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

  /**
   * 应用键盘开关。
   * xterm 的 disableStdin 只是不处理输入,**不阻止其内部隐藏 textarea 聚焦**,
   * 因而移动端点击终端仍会唤起软键盘。故额外把该 textarea 设为 readonly + inputmode=none,
   * 真正阻止虚拟键盘(WHATWG: inputmode=none 表示不显示虚拟键盘)。
   */
  const applyKeyboard = (enabled: boolean) => {
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = !enabled;
    const ta = containerRef.current?.querySelector<HTMLTextAreaElement>('textarea');
    if (!ta) return;
    if (enabled) {
      ta.removeAttribute('readonly');
      ta.removeAttribute('inputmode');
    } else {
      ta.setAttribute('readonly', '');
      ta.setAttribute('inputmode', 'none');
    }
  };

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
    // textarea 在 open 时插入,下一帧再应用一次兜底异步插入的边界情况
    applyKeyboard(keyboardEnabled);
    const kbRaf = requestAnimationFrame(() => applyKeyboard(keyboardEnabled));

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
      cancelAnimationFrame(kbRaf);
      cancelAnimationFrame(raf);
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 运行时切换键盘:同步 disableStdin + textarea 可聚焦性
  useEffect(() => {
    applyKeyboard(keyboardEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardEnabled]);

  return <div ref={containerRef} className="terminal-container" />;
}
