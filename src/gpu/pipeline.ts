/**
 * src/gpu/pipeline.ts
 * Compiles WGSL into a render pipeline for a full-screen triangle and
 * manages a dynamic uniform buffer + bind group. Supports arbitrary
 * uniforms supplied by the AI (assumes struct Uniforms { time: f32; ... }
 * with 16-byte alignment). Live updates are reflected instantly.
 */

import { getActiveContext } from './context.js';
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

  // Build offset map (time at byte 0, each subsequent uniform at 16-byte boundary)
  uniformOffsets.clear();
  uniformValues.clear();
  uniformOffsets.set('time', 0);
  uniforms.forEach((uniform, i) => {
    const offset = 16 * (i + 1);
    uniformOffsets.set(uniform.name, offset);
    uniformValues.set(uniform.name, uniform.default);
  });

  activeUniforms = [...uniforms];

  console.log(
    '%c🔧 Pipeline created with %d uniforms',
    'color:#67e8f9',
    uniforms.length
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
 * Called every frame from the render loop.
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
 * Validates that the provided WGSL contains the expected entry points.
 * Used by the parser / AI flow before pipeline creation.
 */
export function validateWGSL(wgsl: string): boolean {
  if (!wgsl || wgsl.length < 30) return false;
  const hasVS = /@vertex|fn vs/.test(wgsl);
  const hasFS = /@fragment|fn fs/.test(wgsl);
  const hasUniform = /var<uniform>/.test(wgsl);
  return hasVS && hasFS && hasUniform;
}
