/**
 * src/scene/parser.ts
 * Parses LLM markdown responses containing ```wgsl and ```json blocks into
 * a fully typed Scene object. Provides robust extraction with fallbacks,
 * strict validation of WGSL structure, and helpful console diagnostics.
 * Central source of truth for AI output → runtime scene conversion.
 */

import type { Scene, Uniform } from '../main.js';

const DEFAULT_UNIFORMS: Uniform[] = [
  { name: 'speed', type: 'f32', default: 1.4, min: 0.3, max: 5.0 },
  { name: 'intensity', type: 'f32', default: 1.1, min: 0.4, max: 3.5 },
  { name: 'hueShift', type: 'f32', default: 0.65, min: 0.0, max: 1.0 },
  { name: 'density', type: 'f32', default: 6.5, min: 2.0, max: 14.0 },
];

function extractCodeBlock(text: string, lang: string): string | null {
  const regex = new RegExp(`\`\`\`(?:${lang}|${lang.toLowerCase()})?\\s*([\\s\\S]+?)(?:\\s*\`\`\`|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() ?? null;
}

function deriveTitleFromPrompt(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('kelp') || lower.includes('sea') || lower.includes('ocean') || lower.includes('underwater')) {
    return 'Kelp Forest';
  }
  if (lower.includes('particle') || lower.includes('star') || lower.includes('cosmic') || lower.includes('nebula')) {
    return 'Stellar Particles';
  }
  if (lower.includes('fractal') || lower.includes('mandel') || lower.includes('bloom')) {
    return 'Fractal Bloom';
  }
  if (lower.includes('neon') || lower.includes('garden')) {
    return 'Neon Garden';
  }
  if (lower.includes('lava') || lower.includes('magma') || lower.includes('fire') || lower.includes('ember')) {
    return 'Magma Flow';
  }
  if (lower.includes('aurora') || lower.includes('veil') || lower.includes('light')) {
    return 'Aurora Veil';
  }
  if (lower.includes('bubble') || lower.includes('jelly')) {
    return 'Bubble Realm';
  }
  if (lower.includes('crystal') || lower.includes('glass') || lower.includes('lattice')) {
    return 'Crystal Lattice';
  }
  return 'AI Dreamscape';
}

/**
 * Parses raw LLM output into a validated Scene object.
 * Handles imperfect markdown, missing JSON, and provides rich defaults.
 * Throws only on completely unusable input.
 */
export function parseLLMOutput(raw: string): Scene {
  if (!raw || typeof raw !== 'string' || raw.trim().length < 10) {
    throw new Error('parseLLMOutput() requires a non-empty string containing shader code');
  }

  const wgslBlock = extractCodeBlock(raw, 'wgsl');
  const jsonBlock = extractCodeBlock(raw, 'json');

  let wgsl = wgslBlock ?? '// Fallback placeholder shader - LLM did not return valid WGSL';
  let uniforms: Uniform[] = [...DEFAULT_UNIFORMS];
  let jsLogic = '// No additional per-frame JS logic supplied by model';

  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock);
      if (Array.isArray(parsed.uniforms) && parsed.uniforms.length > 0) {
        uniforms = parsed.uniforms
          .map((u: any) => ({
            name: String(u.name ?? 'unknown').trim(),
            type: 'f32',
            default: Number(u.default ?? 1.0),
            min: Number(u.min ?? 0.0),
            max: Number(u.max ?? 10.0),
          }))
          .filter((u: Uniform) => u.name.length > 1 && !Number.isNaN(u.default));
      }
      if (typeof parsed.jsLogic === 'string' && parsed.jsLogic.trim().length > 5) {
        jsLogic = parsed.jsLogic.trim();
      }
    } catch (err) {
      console.warn(
        '%c⚠️ JSON metadata block could not be parsed. Using safe defaults.',
        'color:#f472b6;font-weight:500',
        err
      );
    }
  }

  const title = deriveTitleFromPrompt(raw || wgsl);

  // Ensure time is always present at the front
  if (!uniforms.some((u) => u.name === 'time')) {
    uniforms.unshift({ name: 'time', type: 'f32', default: 0, min: 0, max: 1000 });
  }

  const scene: Scene = {
    wgsl,
    uniforms,
    jsLogic,
    title,
  };

  if (!validateWGSL(wgsl)) {
    console.warn(
      '%c⚠️ Generated WGSL failed structural validation. Pipeline creation may fail.',
      'color:#f472b6'
    );
  } else {
    console.log(
      '%c✅ Parsed valid scene "%s" with %d uniforms',
      'color:#67e8f9;font-weight:500',
      title,
      uniforms.length
    );
  }

  return scene;
}

/**
 * Validates that a WGSL shader contains the expected full-screen triangle
 * entry points, uniform binding, and fragment output. Used both before
 * pipeline creation and as a safety gate after LLM generation.
 */
export function validateWGSL(wgsl: string): boolean {
  if (typeof wgsl !== 'string' || wgsl.trim().length < 60) {
    return false;
  }

  const normalized = wgsl.toLowerCase();

  const hasVertexEntry = /@vertex|fn vs\s*\(\s*@\s*builtin\(vertex_index\)|\bvs\s*\(\s*@builtin/.test(normalized);
  const hasFragmentEntry = /@fragment|fn fs\s*\(\s*@\s*builtin\(position\)|\bfs\s*\(\s*@builtin/.test(normalized);
  const hasUniformBlock = /var<uniform>\s+\w+:\s*Uniforms|@binding\(0\).*uniform|struct Uniforms/.test(normalized);
  const hasPositionOutput = /@builtin\(position\)|->\s*@builtin\(position\)/.test(normalized);
  const hasColorOutput = /@location\(0\)|->\s*@location\(0\)\s*vec4f/.test(normalized);

  return hasVertexEntry && hasFragmentEntry && hasUniformBlock && hasPositionOutput && hasColorOutput;
}

/**
 * Creates a new Scene by selectively updating parts of an existing one.
 * Useful for the "partial remix" feature (lighting / motion only).
 */
export function remixScene(base: Scene, patch: Partial<Scene> & { uniforms?: Uniform[] }): Scene {
  return {
    wgsl: patch.wgsl ?? base.wgsl,
    uniforms: patch.uniforms ?? base.uniforms,
    jsLogic: patch.jsLogic ?? base.jsLogic,
    title: patch.title ?? base.title,
  };
}
