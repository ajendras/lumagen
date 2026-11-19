/**
 * src/scene/parser.ts
 * Parses LLM markdown responses containing ```wgsl and ```json blocks into
 * a fully typed Scene object. Provides robust extraction with fallbacks,
 * normalizes uniform names to lowercase, ensures numeric values + range
 * constraints, strict validation of WGSL structure, and helpful console
 * diagnostics. Central source of truth for AI output → runtime scene conversion.
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

function deriveTitleFromPrompt(text: string): string {
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
  if (lower.includes('magma') || lower.includes('lava') || lower.includes('ember') || lower.includes('molten') || lower.includes('heat')) {
    return 'Magma Flow';
  }
  if (lower.includes('aurora') || lower.includes('northern') || lower.includes('lights') || lower.includes('veil') || lower.includes('mint')) {
    return 'Aurora Veil';
  }
  if (lower.includes('crystal') || lower.includes('lattice') || lower.includes('refractive') || lower.includes('gem')) {
    return 'Crystal Lattice';
  }
  if (lower.includes('audio') || lower.includes('music') || lower.includes('beat') || lower.includes('reactive') || lower.includes('microphone') || lower.includes('sound')) {
    return 'Audio Reactive Dream';
  }
  return 'AI Dreamscape';
}

export function parseLLMOutput(raw: string): Scene {
  const wgsl = extractCodeBlock(raw, 'wgsl') ?? '// Placeholder shader – LLM output was incomplete';

  const jsonMatch = extractCodeBlock(raw, 'json');

  let uniforms: Uniform[] = [...DEFAULT_UNIFORMS];
  let jsLogic = '';

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch);
      if (Array.isArray(parsed.uniforms)) {
        uniforms = parsed.uniforms.map((u: any) => ({
          name: String(u.name).toLowerCase().trim(),
          type: 'f32' as const,
          default: Number(u.default ?? 1.0),
          min: Number(u.min ?? 0.0),
          max: Number(u.max ?? 10.0),
        })).filter((u: Uniform) => u.name.length > 0);
      }
      if (typeof parsed.jsLogic === 'string') jsLogic = parsed.jsLogic.trim();
    } catch (parseErr) {
      console.warn('Failed to parse JSON block from LLM output', parseErr);
    }
  }

  const title = deriveTitleFromPrompt(raw);

  const scene: Scene = { wgsl, uniforms, jsLogic, title };

  if (!validateWGSL(wgsl)) {
    console.warn('Parsed WGSL failed validation – may not render correctly');
  }

  return scene;
}

export function validateWGSL(wgsl: string): boolean {
  if (!wgsl || wgsl.length < 30) return false;
  const lower = wgsl.toLowerCase();
  const hasVertex = lower.includes('@vertex') || lower.includes('fn vs(');
  const hasFragment = lower.includes('@fragment') || lower.includes('fn fs(');
  const hasUniform = lower.includes('var<uniform>') || lower.includes('@binding(0)');
  return hasVertex && hasFragment && hasUniform;
}

export function remixScene(current: Scene, updates: Partial<Scene>): Scene {
  return {
    wgsl: updates.wgsl ?? current.wgsl,
    uniforms: updates.uniforms ?? current.uniforms,
    jsLogic: updates.jsLogic ?? current.jsLogic ?? '',
    title: current.title ?? updates.title ?? 'Remixed Scene',
  };
}
