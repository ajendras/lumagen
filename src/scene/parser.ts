/**
 * src/scene/parser.ts
 * Parses LLM markdown responses containing ```wgsl and ```json blocks into
 * a fully typed Scene object. Provides robust extraction with fallbacks,
 * normalizes uniform names to lowercase, ensures numeric values + range
 * constraints, strict validation of WGSL structure via static analysis,
 * and helpful console diagnostics. Central source of truth for AI output
 * → runtime scene conversion. The new analyzeWGSL() catches common errors
 * (missing entry points, missing Uniforms binding, unbalanced braces, etc.)
 * before the shader ever reaches the GPU compiler.
 */

import type { Scene, Uniform } from '../main.js';

const DEFAULT_UNIFORMS: Uniform[] = [
  { name: 'speed', type: 'f32', default: 1.4, min: 0.3, max: 5.0 },
  { name: 'intensity', type: 'f32', default: 1.1, min: 0.4, max: 3.5 },
  { name: 'hueShift', type: 'f32', default: 0.65, min: 0.0, max: 1.0 },
  { name: 'density', type: 'f32', default: 6.5, min: 2.0, max: 14.0 },
];

function extractCodeBlock(text: string, lang: string): string | null {
  const regex = new RegExp(`\`\`\`${lang}\\s*([\\s\\S]+?)(?:\\s*\`\`\`|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() ?? null;
}

export function deriveTitleFromPrompt(text: string): string {
  const lower = text.toLowerCase();

  if (lower.includes('bubble') || lower.includes('soap')) {
    return 'Bubble Realm';
  }
  if (lower.includes('kelp') || lower.includes('sea') || lower.includes('ocean') || lower.includes('underwater') || lower.includes('caustics') || lower.includes('jellyfish')) {
    return 'Kelp Forest';
  }
  if (lower.includes('particle') || lower.includes('star') || lower.includes('cosmic') || lower.includes('nebula') || lower.includes('dust') || lower.includes('stellar')) {
    return 'Stellar Particles';
  }
  if (lower.includes('fractal') || lower.includes('mandel') || lower.includes('bloom') || lower.includes('recursive')) {
    return 'Fractal Bloom';
  }
  if (lower.includes('magma') || lower.includes('lava') || lower.includes('molten') || lower.includes('ember')) {
    return 'Magma Flow';
  }
  if (lower.includes('aurora') || lower.includes('northern') || lower.includes('light') || lower.includes('veil')) {
    return 'Aurora Veil';
  }
  if (lower.includes('crystal') || lower.includes('lattice') || lower.includes('refractive') || lower.includes('gem')) {
    return 'Crystal Lattice';
  }
  if (lower.includes('neon') || lower.includes('garden') || lower.includes('twilight') || lower.includes('orb')) {
    return 'Neon Garden';
  }
  return 'Generated Scene';
}

function countBraces(code: string): { open: number; close: number } {
  const open = (code.match(/\{/g) || []).length;
  const close = (code.match(/\}/g) || []).length;
  return { open, close };
}

export function analyzeWGSL(code: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = code.trim();

  if (!trimmed) {
    errors.push('Shader code is empty');
    return { isValid: false, errors, warnings };
  }

  // Check entry points (full-screen triangle pattern)
  if (!/@vertex/.test(trimmed) || !/fn vs\s*\(/.test(trimmed)) {
    errors.push('Missing @vertex entry point "vs" (full-screen triangle expected)');
  }
  if (!/@fragment/.test(trimmed) || !/fn fs\s*\(/.test(trimmed)) {
    errors.push('Missing @fragment entry point "fs"');
  }

  // Uniform struct + binding
  if (!/struct Uniforms/.test(trimmed)) {
    errors.push('Missing "struct Uniforms" definition');
  }
  if (!/@group\(0\)\s*@binding\(0\)\s*var<uniform>\s*u:\s*Uniforms;/.test(trimmed)) {
    errors.push('Missing uniform binding: "@group(0) @binding(0) var<uniform> u: Uniforms;"');
  }

  // Animation time field is strongly encouraged
  if (!/time\s*:\s*f32/.test(trimmed)) {
    warnings.push('Uniforms struct should contain a "time: f32" field for animation');
  }

  // Legacy main() is not compatible with the render pipeline we create
  if (/fn main\s*\(/.test(trimmed)) {
    errors.push('Use vs() and fs() entry points instead of main() for WebGPU render pipeline');
  }

  // Rough structural sanity check
  const { open, close } = countBraces(trimmed);
  if (open !== close) {
    errors.push(`Unbalanced braces: ${open} opening vs ${close} closing`);
  }

  const isValid = errors.length === 0;

  if (!isValid) {
    console.error('WGSL analysis errors:', errors);
  } else if (warnings.length > 0) {
    console.warn('WGSL analysis warnings:', warnings);
  }

  return { isValid, errors, warnings };
}

export function parseLLMOutput(raw: string): Scene {
  if (!raw || typeof raw !== 'string') {
    console.error('parseLLMOutput received invalid input');
    return {
      wgsl: '// fallback shader (invalid LLM output)',
      uniforms: [...DEFAULT_UNIFORMS],
      jsLogic: '',
      title: 'Fallback Scene',
    };
  }

  const wgslBlock = extractCodeBlock(raw, 'wgsl') ||
                   extractCodeBlock(raw, 'WGSL') ||
                   '// No WGSL shader found – please regenerate';

  let jsonBlock = extractCodeBlock(raw, 'json') || extractCodeBlock(raw, 'JSON') || '{}';

  let jsonData: any = {};
  try {
    // Strip any leftover markdown or explanatory text that sometimes sneaks in
    const jsonOnly = jsonBlock.replace(/^[^{\[]*/, '').replace(/[^}\]]*$/, '');
    jsonData = JSON.parse(jsonOnly);
  } catch (err) {
    console.warn('Could not parse JSON metadata block, falling back to defaults', err);
    jsonData = {};
  }

  const title = jsonData.title && typeof jsonData.title === 'string'
    ? jsonData.title
    : deriveTitleFromPrompt(raw);

  let uniforms: Uniform[] = [];

  if (Array.isArray(jsonData.uniforms)) {
    uniforms = jsonData.uniforms
      .map((u: any): Uniform | null => {
        if (!u || typeof u.name !== 'string') return null;
        return {
          name: u.name.toLowerCase(),
          type: 'f32',
          default: typeof u.default === 'number' ? u.default : 1.0,
          min: typeof u.min === 'number' ? u.min : 0.0,
          max: typeof u.max === 'number' ? u.max : 10.0,
        };
      })
      .filter((u: Uniform | null): u is Uniform => u !== null);
  }

  if (uniforms.length === 0) {
    uniforms = [...DEFAULT_UNIFORMS];
  }

  // Run static analysis and surface clear errors before the GPU ever sees the code
  const analysis = analyzeWGSL(wgslBlock);
  if (!analysis.isValid) {
    console.error(`Static analysis failed for generated shader titled "${title}"`);
  }

  return {
    wgsl: wgslBlock,
    uniforms,
    jsLogic: typeof jsonData.jsLogic === 'string' ? jsonData.jsLogic : '// AI-generated scene logic',
    title,
  };
}
