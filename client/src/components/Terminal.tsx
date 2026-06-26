import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalWriter {
  write: (data: string) => void;
  clear: () => void;
  scrollByPixels: (deltaY: number) => void;
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
   * xterm 的 disableStdin 只是不处理输入,不阻止其内部隐藏 textarea 聚焦,
   * 故移动端点击终端仍会唤起软键盘。这里用 inputmode=none(WHATWG:不显示虚拟键盘)阻止键盘。
   * **不设 readonly**:readonly 在移动端会触发"文本选择"手势吞掉 touchmove,
   * 导致 terminal 无法触摸滚动 scrollback(配合 CSS `.xterm textarea { touch-action: pan-y }`)。
   */
  const applyKeyboard = (enabled: boolean) => {
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = !enabled;
    const ta = containerRef.current?.querySelector<HTMLTextAreaElement>('textarea');
    if (!ta) return;
    if (enabled) {
      ta.removeAttribute('inputmode');
    } else {
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
    let scrollPixelRemainder = 0;
    const scrollByPixels = (deltaY: number) => {
      const lineHeight = Math.max(1, term.rows > 0 ? container.clientHeight / term.rows : 20);
      if (term.buffer.active.type === 'alternate') {
        const threshold = lineHeight * 4;
        const total = scrollPixelRemainder + deltaY;
        const pages = total > 0 ? Math.floor(total / threshold) : Math.ceil(total / threshold);
        if (pages === 0) {
          scrollPixelRemainder = total;
          return;
        }
        scrollPixelRemainder = total - pages * threshold;
        const key = pages > 0 ? '\x1b[6~' : '\x1b[5~';
        const count = Math.min(Math.abs(pages), 2);
        onDataRef.current?.(key.repeat(count));
        return;
      }
      const total = scrollPixelRemainder + deltaY;
      const lines = total > 0 ? Math.floor(total / lineHeight) : Math.ceil(total / lineHeight);
      if (lines === 0) {
        scrollPixelRemainder = total;
        return;
      }
      scrollPixelRemainder = total - lines * lineHeight;
      term.scrollLines(lines);
    };
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
      scrollByPixels,
    });

    doFit();
    const raf = requestAnimationFrame(doFit);
    const ro = new ResizeObserver(() => doFit());
    ro.observe(container);

    // 移动端触摸滚动:xterm 的 screen(canvas)与 viewport 是兄弟,触摸命中 canvas 不滚 viewport。
    // Chrome 移动模拟会用鼠标 pointer,因此保留 touch 主路径并补一个 mouse drag fallback。
    let mouseDragging = false;
    let lastPointerY = 0;
    let lastTouchY = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      mouseDragging = true;
      lastPointerY = e.clientY;
      scrollPixelRemainder = 0;
      container.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!mouseDragging || e.pointerType !== 'mouse') return;
      const dy = lastPointerY - e.clientY;
      lastPointerY = e.clientY;
      scrollByPixels(dy);
      e.preventDefault();
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (!mouseDragging || e.pointerType !== 'mouse') return;
      mouseDragging = false;
      scrollPixelRemainder = 0;
      if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    };
    const onTouchStart = (e: TouchEvent) => {
      lastTouchY = e.touches[0]?.clientY ?? lastTouchY;
      scrollPixelRemainder = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const dy = lastTouchY - touch.clientY; // 手指上滑 dy>0 → 向下查看后续内容
      lastTouchY = touch.clientY;
      scrollByPixels(dy);
      e.preventDefault(); // 阻止页面/容器默认滚动,滚动完全由这里接管
    };
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove, { passive: false });
    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      cancelAnimationFrame(kbRaf);
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerEnd);
      container.removeEventListener('pointercancel', onPointerEnd);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
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
