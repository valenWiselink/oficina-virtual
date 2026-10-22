/**
 * Jarvis's ears, off the page's thread: Whisper (Transformers.js) turns what
 * you said into text, in Spanish, on this PC — on the graphics card with
 * WebGPU, else on the processor. The ONNX runtime comes with the office (not
 * from a CDN); the model is downloaded from Hugging Face the first time and
 * then kept by the browser.
 */

import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
  type ProgressInfo,
} from '@huggingface/transformers';

// The runtime's own files, served by the office.
const onnxWasm = env.backends.onnx.wasm;
if (onnxWasm) {
  onnxWasm.wasmPaths = {
    mjs: new URL(
      '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs',
      import.meta.url,
    ).href,
    wasm: new URL(
      '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm',
      import.meta.url,
    ).href,
  };
}
env.allowLocalModels = false;

export type EarsRequest =
  { type: 'load' } | { type: 'transcribe'; id: number; audio: Float32Array };
export type EarsReply =
  | { type: 'progress'; percent: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'text'; id: number; text: string }
  | { type: 'failed'; id?: number; reason: string };

// A worker: its global posts to the page (typed by hand, the page's DOM types apply here).
const post = (reply: EarsReply) =>
  (self as unknown as { postMessage(message: EarsReply): void }).postMessage(reply);

let loading:
  Promise<{ asr: AutomaticSpeechRecognitionPipeline; device: 'webgpu' | 'wasm' }> | undefined;

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  try {
    return !!(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

function load() {
  loading ??= (async () => {
    const files = new Map<string, { loaded: number; total: number }>();
    const progress = (p: ProgressInfo) => {
      if (p.status !== 'progress') return;
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      if (total > 0) post({ type: 'progress', percent: Math.round((loaded / total) * 100) });
    };
    // The graphics card runs the more accurate model; the processor, the
    // lighter one (Whisper's encoder suffers from quantization: kept whole).
    const device = (await hasWebGpu()) ? 'webgpu' : 'wasm';
    const asr = (await pipeline(
      'automatic-speech-recognition',
      device === 'webgpu' ? 'onnx-community/whisper-small' : 'onnx-community/whisper-base',
      device === 'webgpu'
        ? {
            device,
            dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
            progress_callback: progress,
          }
        : { device, dtype: 'q8', progress_callback: progress },
    )) as AutomaticSpeechRecognitionPipeline;
    return { asr, device };
  })();
  // A failed load is tried again on the next ask.
  loading.catch(() => (loading = undefined));
  return loading;
}

self.onmessage = async (e: MessageEvent<EarsRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      const { device } = await load();
      post({ type: 'ready', device });
      return;
    }
    const { asr } = await load();
    const out = await asr(msg.audio, { language: 'spanish', task: 'transcribe' });
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
    post({ type: 'text', id: msg.id, text: text.trim() });
  } catch (err) {
    post({
      type: 'failed',
      id: msg.type === 'transcribe' ? msg.id : undefined,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
};
