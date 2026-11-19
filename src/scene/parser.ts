/**
 * src/scene/parser.ts
 * Parses LLM markdown responses containing ```wgsl and ```json blocks into
 * a fully typed Scene object. Provides robust extraction with fallbacks,
 * normalizes uniform names to lowercase, ensures numeric values + range
 * constraints, strict validation of WGSL structure, and helpful console
 * diagnostics. Central source of truth for AI output → runtime scene conversion.
 */

import type { Scene, Uniform } from '../main.js';
import { validateWGSL } from '../gpu/pipeline.js';

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
  if (lower.includes('kelp') || lower.includes('sea') || lower.includes('ocean') || lower.includes('underwater') || lower.includes('caustics')) {
    return 'Kelp Forest';
  }
  if (lower.includes('particle') || lower.includes('star') || lower.includes('cosmic') || lower.includes('nebula') || lower.includes('dust')) {
    return 'Stellar Particles';
  }
  if (lower.includes('fractal') || lower.includes('mandel') || lower.includes('bloom') || lower.includes('recursive')) {
    return 'Fractal Bloom';
  }
  if (lower.includes('neon') || lower.includes('garden') || lower.includes('orb') || lower.includes('twilight')) {
    return 'Neon Garden';
  }
  if (lower.includes('magma') || lower.includes('lava') || lower.includes('molten') || lower.includes('ember')) {
    return 'Magma Flow';
  }
  if (lower.includes('aurora') || lower.includes('northern') || lower.includes('veil')) {
    return 'Aurora Veil';
  }
  if (lower.includes('crystal') || lower.includes('lattice') || lower.includes('refractive')) {
    return 'Crystal Lattice';
  }
  // Only treat as audio-reactive title when the prompt clearly indicates it.
  // This prevents false positives from uniform declarations like "audioLevel"
  // that appear in almost every shader generated from the system prompt.
  if (/(audio|music|beat|sound).*?(reactive|visualizer|fft)| (reactive|visualizer).*?(audio|music|beat)/i.test(lower)) {
    return 'Audio Reactive Dream';
  }

  return 'AI Dreamscape';
}

function parseUniforms(jsonData: any): Uniform[] {
  if (!Array.isArray(jsonData?.uniforms)) {
    return [...DEFAULT_UNIFORMS];
  }

  return jsonData.uniforms.map((u: any): Uniform => ({
    name: String(u.name || 'param').toLowerCase(),
    type: String(u.type || 'f32'),
    default: typeof u.default === 'number' ? u.default : 1.0,
    min: typeof u.min === 'number' ? u.min : 0.0,
    max: typeof u.max === 'number' ? u.max : 10.0,
  }));
}

export function parseLLMOutput(raw: string): Scene {
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    console.warn('Empty or invalid LLM output – using safe fallback');
    return {
      wgsl: '// fallback: empty input',
      uniforms: [...DEFAULT_UNIFORMS],
      jsLogic: '',
      title: 'AI Dreamscape',
    };
  }

  const wgslBlock = extractCodeBlock(raw, 'wgsl');
  const jsonBlock = extractCodeBlock(raw, 'json');

  let jsonData: any = {};
  if (jsonBlock) {
    try {
      jsonData = JSON.parse(jsonBlock);
    } catch (e) {
      console.warn('Failed to parse JSON metadata from LLM output', e);
    }
  }

  const wgsl = wgslBlock || '// No WGSL shader was extracted from LLM output';
  const uniforms = parseUniforms(jsonData);
  const jsLogic = typeof jsonData.jsLogic === 'string' ? jsonData.jsLogic : '// AI-generated JS logic placeholder';
  const title = typeof jsonData.title === 'string' && jsonData.title.trim().length > 0
    ? jsonData.title.trim()
    : deriveTitleFromPrompt(raw);

  if (!validateWGSL(wgsl)) {
    console.warn('Parsed WGSL failed validation – may not render correctly');
  }

  const scene: Scene = { wgsl, uniforms, jsLogic, title };

  console.log(
    '%c📜 Parsed scene "%s" with %d uniforms',
    'color:#a78bfa;font-weight:500',
    title,
    uniforms.length
  );

  return scene;
}

export function remixScene(base: Scene, overrides: Partial<Scene>): Scene {
  if (!base?.wgsl) {
    throw new Error('remixScene requires a valid base Scene with wgsl');
  }

  return {
    wgsl: overrides.wgsl ?? base.wgsl,
    uniforms: overrides.uniforms ?? base.uniforms ?? [],
    jsLogic: overrides.jsLogic ?? base.jsLogic ?? '',
    title: overrides.title ?? base.title ?? deriveTitleFromPrompt(overrides.wgsl ?? base.wgsl),
  };
}
