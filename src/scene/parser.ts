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
  if (lower.includes('neon') || lower.includes('garden') || lower.includes('twilight') || lower.includes('orb')) {
    return 'Neon Garden';
  }
  if (lower.includes('magma') || lower.includes('lava') || lower.includes('ember') || lower.includes('molten')) {
    return 'Magma Flow';
  }
  if (lower.includes('aurora') || lower.includes('veil') || lower.includes('northern') || lower.includes('lights')) {
    return 'Aurora Veil';
  }
  if (lower.includes('crystal') || lower.includes('lattice') || lower.includes('refractive')) {
    return 'Crystal Lattice';
  }
  return 'Generative Scene';
}

export function analyzeWGSL(wgsl: string): {isValid: boolean; errors: string[]; warnings: string[]} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!wgsl || wgsl.trim().length < 50) {
    errors.push('Shader code is too short or empty');
    return { isValid: false, errors, warnings };
  }

  const hasVertex = /@vertex|fn vs\s*\(/i.test(wgsl);
  const hasFragment = /@fragment|fn fs\s*\(/i.test(wgsl);
  const hasUniformStruct = /struct\s+Uniforms/i.test(wgsl);
  const hasUniformBinding = /@group\(0\)\s*@binding\(0\)|@binding\(0\)\s*@group\(0\)/i.test(wgsl) && /var<uniform>/i.test(wgsl);
  const hasTime = /time\s*:\s*f32/i.test(wgsl);

  if (!hasVertex) {
    errors.push('Missing vertex entry point: add "@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f"');
  }
  if (!hasFragment) {
    errors.push('Missing fragment entry point: add "@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f"');
  }
  if (!hasUniformStruct) {
    errors.push('Missing "struct Uniforms { time: f32, ... }" definition required by the runtime');
  }
  if (!hasUniformBinding) {
    errors.push('Missing uniform declaration: "@group(0) @binding(0) var<uniform> u: Uniforms;"');
  }
  if (!hasTime) {
    warnings.push('Uniforms struct should include "time: f32" for animation timing');
  }

  // Check for full screen triangle pattern (common in Lumagen scenes)
  if (!wgsl.includes('vertex_index') && !/builtin\(vertex_index\)/i.test(wgsl)) {
    warnings.push('Recommended to use @builtin(vertex_index) with full-screen triangle for post-processing style effects');
  }

  // Basic syntax checks
  const braceCount = (wgsl.match(/\{/g) || []).length - (wgsl.match(/\}/g) || []).length;
  if (braceCount !== 0) {
    errors.push('Unbalanced curly braces in shader code');
  }

  const parenCount = (wgsl.match(/\(/g) || []).length - (wgsl.match(/\)/g) || []).length;
  if (parenCount !== 0) {
    errors.push('Unbalanced parentheses in shader code');
  }

  if (/fn main/i.test(wgsl)) {
    errors.push('Use "vs" and "fs" entry points instead of "main" to match the pipeline configuration');
  }

  if (/^ *var +[a-z]/im.test(wgsl)) {
    warnings.push('WGSL best practice: prefer "let" for immutable locals over "var" where possible');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Updated validateWGSL that uses the new static analysis.
 */
export function validateWGSL(wgsl: string): boolean {
  const analysis = analyzeWGSL(wgsl);
  return analysis.isValid;
}

export function parseLLMOutput(raw: string): Scene {
  if (!raw) {
    throw new Error('parseLLMOutput received empty input');
  }

  const wgsl = extractCodeBlock(raw, 'wgsl') || extractCodeBlock(raw, 'WGSL');
  if (!wgsl) {
    // fallback to whole text if no block
    if (raw.includes('fn vs') && raw.includes('fn fs')) {
      return {
        wgsl: raw.trim(),
        uniforms: [...DEFAULT_UNIFORMS],
        jsLogic: '',
        title: deriveTitleFromPrompt(raw),
      };
    }
    throw new Error('No ```wgsl code block found in the LLM response. The AI must output a wgsl block.');
  }

  let jsonStr = extractCodeBlock(raw, 'json');
  if (!jsonStr) {
    // Try to find any json-like structure
    const jsonMatch = raw.match(/(\{[\s\S]*?\})/);
    jsonStr = jsonMatch ? jsonMatch[0] : '{}';
  }

  let metadata: any = {};
  try {
    metadata = JSON.parse(jsonStr.trim());
  } catch (e) {
    console.warn('Failed to parse JSON metadata block, using defaults', e);
    metadata = { title: deriveTitleFromPrompt(raw), uniforms: [] };
  }

  const analysis = analyzeWGSL(wgsl);
  if (!analysis.isValid) {
    console.error(
      '%c❌ WGSL Static Analysis Failed',
      'color:#f472b6;font-weight:bold',
      analysis.errors
    );
  } else if (analysis.warnings.length > 0) {
    console.warn('WGSL analysis warnings:', analysis.warnings);
  }

  const title = metadata.title || deriveTitleFromPrompt(wgsl + raw);

  const rawUniforms = Array.isArray(metadata.uniforms) ? metadata.uniforms : DEFAULT_UNIFORMS;
  const uniforms: Uniform[] = rawUniforms.map((u: any) => ({
    name: (u.name || 'param').toString().trim().toLowerCase(),
    type: u.type || 'f32',
    default: typeof u.default === 'number' ? u.default : 1.0,
    min: typeof u.min === 'number' ? u.min : 0.0,
    max: typeof u.max === 'number' ? u.max : (u.name === 'hueShift' ? 1.0 : 10.0),
  } as Uniform));

  // Ensure we always have time, speed, intensity at minimum
  if (!uniforms.some(u => u.name === 'time')) {
    uniforms.unshift({ name: 'time', type: 'f32', default: 0, min: 0, max: 100 });
  }

  const scene: Scene = {
    wgsl: wgsl.trim(),
    uniforms: uniforms.length ? uniforms : DEFAULT_UNIFORMS,
    jsLogic: metadata.jsLogic || '// No additional JS logic',
    title: title,
  };

  console.log(
    '%c📋 Parsed scene "%s" with %d uniforms',
    'color:#67e8f9',
    scene.title,
    scene.uniforms.length
  );

  return scene;
}
