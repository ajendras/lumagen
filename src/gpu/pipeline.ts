/**
 * src/gpu/pipeline.ts
 * Compiles WGSL into a render pipeline for a full-screen triangle and
 * manages a dynamic uniform buffer + bind group. Supports arbitrary
 * uniforms supplied by the AI (assumes struct Uniforms { time: f32; ... }
 * with 16-byte alignment). Live updates are reflected instantly.
 * Includes helper for WebAudio FFT data (audioBass, audioMid, audioTreble, audioLevel).
 * Now runs static analysis (analyzeWGSL) before any compilation attempt.
 */

import { getActiveContext } from './context.js';
import { analyzeWGSL } from '../scene/parser.js';
import type { Uniform } from '../main.js';

let currentPipeline: GPURenderPipeline | null = null;
let currentUniformBuffer: GPUBuffer | null = null;
let currentBindGroup: GPUBindGroup | null = null;
let uniformOffsets = new Map<string, number>();
let uniformValues = new Map<string, number>();
let activeUniforms: Uniform[] = [];

export async function createPipeline(
  wgsl: string,
  uniforms: Uniform[] = []
): Promise<GPURenderPipeline> {
  const ctx = getActiveContext();
  if (!ctx) {
    throw new Error(
      'GPU context not initialized. Call gpu/context.init() before creating a pipeline.'
    );
  }

  const { device, format } = ctx;

  // Static analysis catches common WGSL errors early with helpful messages
  // before we ever attempt to create a shader module or call getCompilationInfo().
  const analysis = analyzeWGSL(wgsl);
  if (!analysis.isValid) {
    const errorMsg = analysis.errors.join('\n• ');
    throw new Error(`Static WGSL analysis failed:\n• ${errorMsg}\n\nThe shader was not sent to the GPU compiler. Try regenerating or fixing the issues above.`);
  }
  if (analysis.warnings.length > 0) {
    console.warn('WGSL analysis warnings:', analysis.warnings);
  }

  // Compile shader
  const shaderModule = device.createShaderModule({
    label: 'Lumagen AI-generated shader',
    code: wgsl,
  });

  // Basic error checking via compilation info (async but we continue)
  const compilationInfo = await shaderModule.getCompilationInfo();
  if (compilationInfo.messages.some((m) => m.type === 'error')) {
    const errors = compilationInfo.messages
      .filter((m) => m.type === 'error')
      .map((m) => `${m.lineNum}:${m.linePos} ${m.message}`)
      .join('\n');
    throw new Error(`WGSL compilation error:\n${errors}`);
  }

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Lumagen uniforms layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'Lumagen pipeline layout',
    bindGroupLayouts: [bindGroupLayout],
  });

  currentPipeline = device.createRenderPipeline({
    label: 'Lumagen generative pipeline',
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
  });

  // Uniform buffer sized for time + up to 12 additional f32 values (16-byte aligned)
  const bufferSize = 256;
  currentUniformBuffer = device.createBuffer({
    label: 'Lumagen uniform buffer',
    size: bufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  currentBindGroup = device.createBindGroup({
    label: 'Lumagen uniform bind group',
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: currentUniformBuffer! },
      },
    ],
  });

  // Build offset map (time at byte 0, each subsequent uniform at 16-byte boundary).
  // Filter out "time" if the parser included it at index 0 so that buffer layout
  // and active uniforms stay consistent with shader struct expectations.
  uniformOffsets.clear();
  uniformValues.clear();
  uniformOffsets.set('time', 0);

  const nonTimeUniforms = uniforms.filter(
    (u) => u.name.toLowerCase() !== 'time'
  );

  nonTimeUniforms.forEach((uniform, i) => {
    const offset = 16 * (i + 1);
    uniformOffsets.set(uniform.name, offset);
    uniformValues.set(uniform.name, uniform.default);
  });

  activeUniforms = [...nonTimeUniforms];

  console.log(
    '%c🔧 Pipeline created with %d uniforms',
    'color:#67e8f9',
    nonTimeUniforms.length
  );

  return currentPipeline;
}

export function updateUniformBuffer(name: string, value: any): void {
  const ctx = getActiveContext();
  if (!ctx || !currentUniformBuffer) {
    console.warn('Cannot update uniform — pipeline not ready');
    return;
  }

  const offset = uniformOffsets.get(name);
  if (offset === undefined) {
    console.warn(`Unknown uniform "${name}" – add it to the AI metadata next time.`);
    return;
  }

  const numericValue = typeof value === 'number' ? value : Number.parseFloat(value);
  if (Number.isNaN(numericValue)) return;

  uniformValues.set(name, numericValue);

  // Write single f32 at the aligned offset
  const data = new Float32Array([numericValue]);
  ctx.device.queue.writeBuffer(currentUniformBuffer, offset, data);
}

/**
 * Writes the entire uniform struct (including current time) to the GPU buffer.
 * Called every frame from the render loop. Audio uniforms are updated via
 * updateAudioReactData() before this call when reactivity is enabled.
 */
export function writeUniforms(time: number): void {
  const ctx = getActiveContext();
  if (!ctx || !currentUniformBuffer) return;

  const bufferData = new Float32Array(16); // safe over-allocation
  bufferData[0] = time;

  activeUniforms.forEach((uniform, i) => {
    const value = uniformValues.get(uniform.name) ?? uniform.default;
    bufferData[i + 1] = value;
  });

  ctx.device.queue.writeBuffer(currentUniformBuffer, 0, bufferData);
}

export function getCurrentPipeline(): GPURenderPipeline | null {
  return currentPipeline;
}

export function getCurrentBindGroup(): GPUBindGroup | null {
  return currentBindGroup;
}

/**
 * Updates audio reactive uniforms from WebAudio FFT analysis. Called from
 * the render loop in main.ts (editor) and the exported runtime.
 */
export function updateAudioReactData(
  bass: number = 0,
  mid: number = 0,
  treble: number = 0,
  level: number = 0
): void {
  updateUniformBuffer('audioBass', Math.max(0, Math.min(2.0, bass)));
  updateUniformBuffer('audioMid', Math.max(0, Math.min(2.0, mid)));
  updateUniformBuffer('audioTreble', Math.max(0, Math.min(2.0, treble)));
  updateUniformBuffer('audioLevel', Math.max(0, Math.min(2.0, level)));
}
