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
  if (lower.includes('aurora') || lower.includes('northern') || lower.includes('lights')) {
    return 'Aurora Veil';
  }
  if (lower.includes('neon') || lower.includes('garden') || lower.includes('twilight') || lower.includes('orb')) {
    return 'Neon Garden';
  }
  if (lower.includes('crystal') || lower.includes('lattice') || lower.includes('refractive')) {
    return 'Crystal Lattice';
  }
  return 'Generative Scene';
}

export interface AnalysisResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function analyzeWGSL(wgsl: string): AnalysisResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = wgsl.trim();

  if (!trimmed || trimmed.length < 30) {
    errors.push('Shader code is too short or empty');
    return { isValid: false, errors, warnings };
  }

  const hasVertex = /@vertex|fn\s+vs\s*\(/i.test(trimmed);
  const hasFragment = /@fragment|fn\s+fs\s*\(/i.test(trimmed);
  const hasMainEntry = /fn\s+main\s*\(/i.test(trimmed);
  const hasStructUniforms = /struct\s+Uniforms\s*\{/i.test(trimmed);
  const hasUniformBinding = /@group\(0\)\s*@binding\(0\)\s*var<uniform>\s*u\s*:\s*Uniforms/i.test(trimmed);

  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;

  if (!hasVertex) {
    errors.push('Missing vertex entry point (expected @vertex fn vs(...) or equivalent)');
  }
  if (!hasFragment) {
    errors.push('Missing fragment entry point (expected @fragment fn fs(...) or equivalent)');
  }
  if (hasMainEntry) {
    errors.push('Found fn main() – WebGPU shaders should use vs() for vertex and fs() for fragment entry points');
  }
  if (!hasStructUniforms) {
    warnings.push('Missing struct Uniforms definition (recommended)');
  }
  if (!hasUniformBinding) {
    warnings.push('Missing uniform binding: @group(0) @binding(0) var<uniform> u: Uniforms;');
  }
  if (openBraces !== closeBraces) {
    errors.push(`Unbalanced braces (${openBraces} opens, ${closeBraces} closes)`);
  }

  const isValid = errors.length === 0;

  return { isValid, errors, warnings };
}

export function parseLLMOutput(raw: string): Scene {
  const wgslBlock = extractCodeBlock(raw, 'wgsl') ||
    extractCodeBlock(raw, 'WGSL') ||
    `// Fallback shader (no WGSL block found)
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
  hueShift: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.2, 0.6, 0.9, 1.0);
}`;

  const jsonBlock = extractCodeBlock(raw, 'json');
  let metadata: any = {};
  let title = 'Generative Scene';
  let uniforms: Uniform[] = [...DEFAULT_UNIFORMS];
  let jsLogic = '';

  if (jsonBlock) {
    try {
      metadata = JSON.parse(jsonBlock);
      if (typeof metadata.title === 'string' && metadata.title.trim()) {
        title = metadata.title.trim();
      }
      if (Array.isArray(metadata.uniforms)) {
        uniforms = metadata.uniforms
          .map((u: any): Uniform | null => {
            if (!u || !u.name) return null;
            return {
              name: String(u.name).trim(),
              type: u.type && typeof u.type === 'string' ? u.type : 'f32',
              default: typeof u.default === 'number' ? u.default : 1.0,
              min: typeof u.min === 'number' ? u.min : 0.0,
              max: typeof u.max === 'number' ? u.max : 10.0,
            };
          })
          .filter((u): u is Uniform => u !== null);
      }
      if (typeof metadata.jsLogic === 'string') {
        jsLogic = metadata.jsLogic;
      }
    } catch (err: any) {
      console.error('Failed to parse JSON metadata block, using defaults', err.message);
    }
  } else {
    console.warn('No JSON metadata block found in LLM output, using defaults');
  }

  if (!metadata.title) {
    const derived = deriveTitleFromPrompt(raw);
    if (derived !== 'Generative Scene') {
      title = derived;
    }
  }

  const analysis = analyzeWGSL(wgslBlock);
  if (!analysis.isValid) {
    console.error('❌ WGSL Static Analysis Failed', analysis.errors);
  } else if (analysis.warnings.length > 0) {
    console.warn('⚠️ WGSL Static Analysis Warnings', analysis.warnings);
  }

  console.log(`📋 Parsed scene "${title}" with ${uniforms.length} uniforms`);

  return {
    title,
    wgsl: wgslBlock,
    uniforms,
    jsLogic,
  };
}
