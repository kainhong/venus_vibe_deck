import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  /** 终端输入(键盘/IME)→ 回调 */
  onData?: (data: string) => void;
  /** 终端尺寸变化(cols/rows)→ 回调,用于同步后端 PTY */
  onResize?: (cols: number, rows: number) => void;
  /** 注册写入函数,供外部把后端输出喂进 xterm */
  registerWriter?: (write: (data: string) => void) => void;
  /**
   * 终端键盘开关。现阶段默认 true(spec-ui §3:语音未支持,保留键盘);
   * Phase 2 语音就绪后置 false,终端纯显示不拉起软键盘。
   * 注:仅构造时生效;运行时切换需额外处理 xterm 失焦。
   */
  keyboardEnabled?: boolean;
}

/**
 * xterm.js 终端视图:纯渲染层 + 输入采集。
 * - ResizeObserver 实时响应容器尺寸变化(flex/dvh/键盘弹起/横竖屏),变化即 fit
 * - 每次 fit 后通过 onResize 上报 cols/rows,供同步后端 PTY
 * 用 ref 持有回调,保证 effect 仅建立一次 xterm 实例却始终读到最新回调
 */
export function TerminalView({ onData, onResize, registerWriter, keyboardEnabled = true }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const registerWriterRef = useRef(registerWriter);
  const keyboardEnabledRef = useRef(keyboardEnabled);
  onDataRef.current = onData;
  onResizeRef.current = onResize;
  registerWriterRef.current = registerWriter;
  keyboardEnabledRef.current = keyboardEnabled;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 16,
      lineHeight: 1.2,
      cursorBlink: true,
      // 预留开关:现阶段 keyboardEnabled=true 键盘可用;Phase 2 置 false 禁键盘纯显示
      disableStdin: !keyboardEnabledRef.current,
      theme: {
        background: '#0b0b0f',
        foreground: '#e6e6e6',
        cursor: '#e6e6e6',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    /** fit 并上报最新尺寸;容器尺寸为 0 时跳过(尚未布局/不可见) */
    const doFit = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fit.fit();
        onResizeRef.current?.(term.cols, term.rows);
      } catch {
        /* 容器不可见时 fit 可能抛错,忽略 */
      }
    };

    term.onData((data) => onDataRef.current?.(data));
    registerWriterRef.current?.((d: string) => term.write(d));

    // 初始 fit + 下一帧再 fit(等布局稳定)
    doFit();
    const raf = requestAnimationFrame(doFit);

    // ResizeObserver:实时响应容器尺寸变化,比 window.resize 更可靠
    const ro = new ResizeObserver(() => doFit());
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} className="terminal-container" />;
}
