// The canvas over the battle field that plays attack effects. BattleScreen hands it the FxEvents of each
// narrated batch through `handle`; sprites are found by `data-fx="p1" | "p2"` inside the field.
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { Side } from '../../battle/battleView';
import { FxStage } from '../../battle/fxCanvas';
import type { FxEvent } from '../../battle/vfx';

export interface FxHandle {
  play(events: readonly FxEvent[]): void;
}

interface FxLayerProps {
  handle: Ref<FxHandle>;
  /** Draw the effects (off: sounds only). */
  visual: boolean;
}

export function FxLayer({ handle, visual }: FxLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<FxStage | null>(null);
  const visualRef = useRef(visual);
  visualRef.current = visual;

  useEffect(() => {
    const canvas = canvasRef.current;
    const field = canvas?.parentElement;
    if (!canvas || !field) return;
    const timers = new Map<string, number>();
    const stage = new FxStage(canvas, {
      anchor(side: Side) {
        const el = field.querySelector(`[data-fx="${side}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        // Aim a little above center on the big back sprite, whose lower half is mostly body.
        return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height * (side === 'p1' ? 0.42 : 0.5) };
      },
      spriteClass(side, cls, ms, color) {
        const el = field.querySelector<HTMLElement>(`[data-fx="${side}"]`);
        if (!el) return;
        const classes = cls.split(' ');
        const key = `${side}:${cls}`;
        const prev = timers.get(key);
        if (prev) {
          window.clearTimeout(prev);
          el.classList.remove(...classes);
          void el.offsetWidth; // restart the animation
        }
        if (color) el.style.setProperty('--fx-color', color);
        el.classList.add(...classes);
        timers.set(key, window.setTimeout(() => { el.classList.remove(...classes); timers.delete(key); }, ms));
      },
      shake(strong) {
        field.classList.remove('fx-shake', 'fx-shake-strong');
        void field.offsetWidth;
        field.classList.add(strong ? 'fx-shake-strong' : 'fx-shake');
        const prev = timers.get('shake');
        if (prev) window.clearTimeout(prev);
        timers.set('shake', window.setTimeout(() => field.classList.remove('fx-shake', 'fx-shake-strong'), 450));
      },
      color(token) {
        return getComputedStyle(canvas).getPropertyValue(`--color-${token}`).trim() || '#ffffff';
      },
    });
    const fit = () => stage.resize(field.clientWidth, field.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(field);
    stageRef.current = stage;
    return () => {
      ro.disconnect();
      stage.dispose();
      stageRef.current = null;
      for (const t of timers.values()) window.clearTimeout(t);
    };
  }, []);

  useImperativeHandle(handle, () => ({
    play(events) {
      const stage = stageRef.current;
      if (!stage) return;
      for (const e of events) stage.play(e, visualRef.current);
    },
  }), []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />;
}
