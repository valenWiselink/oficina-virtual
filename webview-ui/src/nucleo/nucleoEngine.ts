import { NUCLEO_FRAGMENT, NUCLEO_VERTEX } from './nucleoShader.js';

/**
 * Draws Jarvis's glass sphere, and only when something happens. Measured on
 * the published prototype with a real GPU (GTX 1660 Ti, 2026-11-19): 0 frames
 * and 0 % CPU at rest; 60 frames a second while it speaks (6 % CPU), 24 while
 * you type; still again 450 ms after the last event.
 *
 * - At rest nothing runs: one frame is drawn and the loop stops.
 * - Each event (a key, a word, thinking, speaking, a need) wakes the loop,
 *   which settles and stops by itself.
 * - The next frame is asked with a timeout plus requestAnimationFrame, so not
 *   even the callbacks pass 30 a second (listening) or 60 (the rest), whatever
 *   the screen's refresh rate.
 * - A hidden tab, reduced motion or a lost WebGL context: no animation; the
 *   page shows a still fallback (`onFallback`).
 */
export interface NucleoState {
  listen: number;
  think: number;
  speak: number;
  word: number;
  need: number;
  rot: number;
  t: number;
}

const SETTLED = 0.01;
/** Without a sustained state, the loop gives up this long after the last event. */
const SETTLE_MS = 600;
const NEED_MS = 1100;
const FOCAL = 1.9;
const UNIFORMS = [
  'uRes',
  'uT',
  'uDark',
  'uListen',
  'uThink',
  'uSpeak',
  'uWord',
  'uNeed',
  'uRot',
  'uF',
  'uPx',
  'uBg',
] as const;

/** One step of the states toward their targets (pure: tested). */
export function stepState(
  st: NucleoState,
  target: { think: number; speak: number; need: number },
  dt: number,
): NucleoState {
  const toward = (v: number, t: number, k: number) => v + (t - v) * Math.min(1, dt * k);
  return {
    listen: st.listen * Math.exp(-dt / 0.11),
    word: st.word * Math.exp(-dt / 0.1),
    think: toward(st.think, target.think, 9),
    speak: toward(st.speak, target.speak, 9),
    need: toward(st.need, target.need, 8),
    rot: st.rot + dt * 2.6 * st.think,
    t: st.t + dt,
  };
}

/**
 * How long the ember turns when his turn starts. A real turn of Jarvis can
 * last minutes (tools, agents): past this the sphere stays still in its
 * thinking pose (contracted, the ember condensed) instead of spinning at
 * 60 frames a second the whole time.
 */
export const THINK_SPIN_MS = 2500;

/** Whether there is still something to draw (pure: tested). */
export function stillMoving(
  st: NucleoState,
  target: { think: number; speak: number; need: number },
  msSinceEvent: number,
): boolean {
  if (target.speak || target.need) return true;
  if (target.think) return msSinceEvent <= THINK_SPIN_MS;
  if (msSinceEvent > SETTLE_MS) return false;
  return (
    st.listen > SETTLED ||
    st.word > SETTLED ||
    st.think > SETTLED ||
    st.speak > SETTLED ||
    st.need > SETTLED
  );
}

/** «rgb(18, 18, 20)» → [0..1] each; anything else → a neutral dark. */
export function parseRgb(color: string): [number, number, number] {
  const m = color.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
  if (!m) return [0.07, 0.07, 0.08];
  return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
}

export class NucleoEngine {
  private gl: WebGLRenderingContext | null = null;
  private uniforms: Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>> = {};
  private st: NucleoState = { listen: 0, think: 0, speak: 0, word: 0, need: 0, rot: 0, t: 0 };
  private target = { think: 0, speak: 0, need: 0 };
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private needTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private last = 0;
  private lastEvent = 0;
  private readonly reduce: boolean;
  /** Frames drawn so far (for tests and the page's own checks). */
  frames = 0;

  private readonly canvas: HTMLCanvasElement;
  /** The color behind the sphere (the column's background), read on each draw. */
  private readonly background: () => string;
  private readonly onFallback: (still: boolean) => void;

  constructor(
    canvas: HTMLCanvasElement,
    background: () => string,
    onFallback: (still: boolean) => void,
  ) {
    this.canvas = canvas;
    this.background = background;
    this.onFallback = onFallback;
    this.reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.init();
  }

  private readonly onLost = (e: Event) => {
    e.preventDefault();
    this.halt();
    this.gl = null;
    this.onFallback(true);
  };

  private readonly onRestored = () => this.init();

  private readonly onVisibility = () => {
    if (document.hidden) this.halt();
    else this.kick();
  };

  private init(): void {
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = this.canvas.getContext('webgl', {
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'low-power',
      });
    } catch {
      gl = null;
    }
    if (!gl) return this.onFallback(true);
    try {
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
        return shader;
      };
      const program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, NUCLEO_VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, NUCLEO_FRAGMENT));
      gl.bindAttribLocation(program, 0, 'a');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? 'program');
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);
    } catch (err) {
      console.warn('[Oficina] Núcleo sin WebGL:', err);
      return this.onFallback(true);
    }
    this.gl = gl;
    this.onFallback(false);
    this.resize();
  }

  /** The canvas changed size (debounced by the caller): one new frame. */
  resize(): void {
    if (!this.gl) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.draw();
  }

  /** One frame with the current states (also on a theme change). */
  draw(): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    const u = this.uniforms;
    const [r, g, b] = parseRgb(this.background());
    const dark = (r + g + b) / 3 < 0.5 ? 1 : 0;
    gl.uniform2f(u.uRes!, this.canvas.width, this.canvas.height);
    gl.uniform3f(u.uBg!, r, g, b);
    gl.uniform1f(u.uDark!, dark);
    gl.uniform1f(u.uF!, FOCAL);
    gl.uniform1f(u.uPx!, 4.62 / (FOCAL * this.canvas.height));
    gl.uniform1f(u.uT!, this.st.t);
    gl.uniform1f(u.uListen!, this.st.listen);
    gl.uniform1f(u.uThink!, this.st.think);
    gl.uniform1f(u.uSpeak!, this.st.speak);
    gl.uniform1f(u.uWord!, this.st.word);
    gl.uniform1f(u.uNeed!, this.st.need);
    gl.uniform1f(u.uRot!, this.st.rot);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.frames++;
  }

  /** A key in Jarvis's box: it leans toward it, a little more each key. */
  key(): void {
    this.st = { ...this.st, listen: Math.min(1, this.st.listen + 0.5) };
    this.kick();
  }

  /** A word of his answer: one beat. */
  word(): void {
    this.st = { ...this.st, word: 1 };
    this.kick();
  }

  think(on: boolean): void {
    this.target.think = on ? 1 : 0;
    this.kick();
  }

  speak(on: boolean): void {
    this.target.speak = on ? 1 : 0;
    this.kick();
  }

  /** Something needs Valentín: a bud toward «Te necesita», once. */
  need(): void {
    this.target.need = 1;
    this.kick();
    if (this.needTimer) clearTimeout(this.needTimer);
    this.needTimer = setTimeout(() => {
      this.target.need = 0;
      this.kick();
    }, NEED_MS);
  }

  destroy(): void {
    this.halt();
    if (this.needTimer) clearTimeout(this.needTimer);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private halt(): void {
    if (this.timer) clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = undefined;
    this.raf = 0;
    this.running = false;
  }

  private kick(): void {
    if (!this.gl) return;
    this.lastEvent = performance.now();
    if (this.reduce) {
      // No motion: the state shows at once, in one frame.
      this.st = { ...this.st, ...this.target, listen: 0, word: 0 };
      this.draw();
      return;
    }
    if (!this.running && !document.hidden) {
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private readonly frame = (now: number) => {
    this.raf = 0;
    const began = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.st = stepState(this.st, this.target, dt);
    if (stillMoving(this.st, this.target, now - this.lastEvent)) {
      this.draw();
      const s = this.st;
      const t = this.target;
      const listening =
        !t.think &&
        !t.speak &&
        !t.need &&
        s.word < SETTLED &&
        s.think < SETTLED &&
        s.speak < SETTLED &&
        s.need < SETTLED;
      const wait = Math.max(
        0,
        (listening ? 1000 / 30 : 1000 / 60) - (performance.now() - began) - 1,
      );
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.raf = requestAnimationFrame(this.frame);
      }, wait);
    } else {
      // Settled: the exact resting state, one last frame, and nothing more.
      this.running = false;
      this.st = { ...this.st, ...this.target, listen: 0, word: 0 };
      this.draw();
    }
  };
}
