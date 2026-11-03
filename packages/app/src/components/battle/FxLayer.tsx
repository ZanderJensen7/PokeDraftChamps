// The canvas over the battle field that plays attack effects. BattleScreen hands it the FxEvents of each
// narrated batch through `handle`; sprites are found by `data-fx="p1" | "p2"` inside the field.
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import type { FieldView, Side } from '../../battle/battleView';
import { fieldState } from '../../battle/fieldFx';
import { FxStage } from '../../battle/fxCanvas';
import { useReducedMotion } from '../../hooks/useIsMobile';
import { useSettings } from '../../store/settings';
import type { FxEvent } from '../../battle/vfx';

export interface FxHandle {
  play(events: readonly FxEvent[]): void;
}

interface FxLayerProps {
  handle: Ref<FxHandle>;
  /** Draw the one-shot effects (off: sounds only). */
  visual: boolean;
  /** The battle view: the persistent effects (weather, terrain, hazards, markers) are drawn from it for as long as they last. */
  view: FieldView;
}

export function FxLayer({ handle, visual, view }: FxLayerProps) {
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
      bounds(side) {
        return boxOf(field.querySelector(`[data-fx="${side}"]`), canvas);
      },
      ground(side) {
        return boxOf(field.querySelector(`[data-fx-ground="${side}"]`), canvas);
      },
      spriteFlag(side, cls, on) {
        field.querySelector(`[data-fx="${side}"]`)?.classList.toggle(cls, on);
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

  // Persistent effects follow the view. Reduced motion keeps the still ones; the Attack effects setting hides them all.
  const enabled = useSettings((s) => s.battleEffects);
  const reduced = useReducedMotion();
  const fx = useMemo(() => fieldState(view), [view]);
  useEffect(() => {
    stageRef.current?.setField(fx, !enabled ? 'off' : reduced ? 'static' : 'full');
  }, [fx, enabled, reduced]);

  useImperativeHandle(handle, () => ({
    play(events) {
      const stage = stageRef.current;
      if (!stage) return;
      for (const e of events) stage.play(e, visualRef.current);
    },
  }), []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />;
}

/** An element's box in canvas pixels, or null when it is not on the page. */
function boxOf(el: Element | null, canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
}
