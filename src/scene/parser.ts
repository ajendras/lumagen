/**
 * src/scene/parser.ts
 * Extracts WGSL, uniforms metadata and title from LLM markdown/JSON output.
 * Performs static analysis on the WGSL to catch common errors before GPU
 * compilation. Also handles exported-HTML parsing for the community gallery.
 */

import type { Uniform, Scene } from '../main.js';

const UNIFORM_DEFAULTS = {
  time: { default: 0, min: 0, max: 999 },
  speed: { default: 1.0, min: 0.1, max: 5.0 },
  intensity: { default: 1.0, min: 0.2, max: 3.0 },
};

export function parseLLMOutput(raw: string): Scene {
  const wgslMatch = raw.match(/```(?:wgsl|glsl)[\s\S]*?\n([\s\S]*?)\n```/i);
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i);

  if (!wgslMatch) {
    throw new Error('No WGSL code block found in LLM output. The AI must return a ```wgsl block.');
  }
  if (!jsonMatch) {
    throw new Error('No JSON metadata block found in LLM output. The AI must return a ```json block with title and uniforms.');
  }

  const wgsl = wgslMatch[1].trim();
  let meta: any;

  try {
    meta = JSON.parse(jsonMatch[1].trim());
  } catch (e) {
    throw new Error('JSON metadata block is not valid JSON.');
  }

  const uniforms: Uniform[] = (meta.uniforms || []).map((u: any) => ({
    name: u.name,
    type: u.type || 'f32',
    default: u.default ?? (UNIFORM_DEFAULTS[u.name as keyof typeof UNIFORM_DEFAULTS]?.default ?? 1.0),
    min: u.min ?? (UNIFORM_DEFAULTS[u.name as keyof typeof UNIFORM_DEFAULTS]?.min ?? 0.0),
    max: u.max ?? (UNIFORM_DEFAULTS[u.name as keyof typeof UNIFORM_DEFAULTS]?.max ?? 10.0),
  }));

  // Guarantee time uniform exists (first)
  if (!uniforms.some((u) => u.name === 'time')) {
    uniforms.unshift({
      name: 'time',
      type: 'f32',
      default: 0,
      min: 0,
      max: 1000,
    });
  }

  const analysis = analyzeWGSL(wgsl);
  if (!analysis.isValid) {
    throw new Error(
      `Shader validation failed:\n${analysis.errors.map((e) => `• ${e}`).join('\n')}`
    );
  }
  if (analysis.warnings.length > 0) {
    console.warn('WGSL warnings:', analysis.warnings);
  }

  const scene: Scene = {
    title: meta.title || deriveTitleFromPrompt(raw),
    wgsl,
    uniforms,
    jsLogic: meta.jsLogic || '',
    hasCompute: meta.hasCompute === true || /@compute/.test(wgsl),
  };

  return scene;
}

export function analyzeWGSL(code: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const normalized = code.toLowerCase();

  if (!code.includes('@vertex') || !normalized.includes('fn vs(')) {
    errors.push('Missing vertex entry point (@vertex fn vs())');
  }
  if (!code.includes('@fragment') || !normalized.includes('fn fs(')) {
    errors.push('Missing fragment entry point (@fragment fn fs())');
  }
  if (!code.includes('struct Uniforms')) {
    errors.push('Missing "struct Uniforms" definition');
  }
  if (!normalized.includes('@group(0) @binding(0) var<uniform> u: uniforms;') &&
      !normalized.includes('var<uniform> u:')) {
    warnings.push('Uniform binding declaration may be missing or non-standard');
  }

  // Compute shader validation (new)
  const hasCompute = /@compute/.test(code);
  if (hasCompute) {
    if (!normalized.includes('fn cs(')) {
      errors.push('Compute shader must define entry point "fn cs("');
    }
    if (!code.includes('@workgroup_size')) {
      warnings.push('Compute shader should specify @workgroup_size(1) for the Lumagen runtime');
    }
    if (!code.includes('@binding(1)')) {
      warnings.push('Storage buffer should be bound at @binding(1) when using compute');
    }
  }

  const braceOpen = (code.match(/\{/g) || []).length;
  const braceClose = (code.match(/\}/g) || []).length;
  if (braceOpen !== braceClose) {
    errors.push('Unbalanced braces in shader');
  }

  if (normalized.includes('fn main(')) {
    errors.push('Use vs(), fs() and cs() entry points instead of main()');
  }

  if (!code.includes('vertex_index') && !code.includes('builtin(vertex_index)')) {
    warnings.push('Full-screen triangle usually uses @builtin(vertex_index)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function deriveTitleFromPrompt(prompt: string): string {
  const words = prompt.toLowerCase().split(/\s+/).filter(Boolean);
  const titleWords = words.slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1));
  return titleWords.join(' ') || 'Untitled Scene';
}

export function parseExportedHTML(html: string): Scene {
  const metaMatch = html.match(
    /<script id="lumagen-meta" type="application\/json">([\s\S]*?)<\/script>/i
  );

  if (metaMatch && metaMatch[1]) {
    try {
      const meta = JSON.parse(metaMatch[1].trim());
      return {
        title: meta.title || 'Community Scene',
        wgsl: meta.wgsl || '',
        uniforms: meta.uniforms || [],
        jsLogic: meta.jsLogic || '// Community remix ready',
        hasCompute: meta.hasCompute === true || /@compute/.test(meta.wgsl || ''),
      };
    } catch (e) {
      console.warn('Failed to parse lumagen-meta JSON, falling back to regex');
    }
  }

  // Fallback regex extraction for older exports
  const titleMatch = html.match(/<title>([^<]+) — made with Lumagen<\/title>/i);
  const wgslMatch = html.match(/const wgsl = `([\s\S]*?)`;/i);

  return {
    title: (titleMatch ? titleMatch[1].trim() : 'Imported Scene').replace(/ \(Community\)$/, '') + ' (Community)',
    wgsl: wgslMatch ? wgslMatch[1].trim() : '// No shader found',
    uniforms: [
      { name: 'speed', type: 'f32', default: 1.0, min: 0.2, max: 4.0 },
      { name: 'intensity', type: 'f32', default: 1.2, min: 0.5, max: 3.0 },
    ],
    jsLogic: '// Imported from exported HTML',
    hasCompute: /@compute/.test(html),
  };
}

export function remixScene(base: Scene, patch: Partial<Scene>): Scene {
  return {
    ...base,
    ...patch,
    uniforms: patch.uniforms || base.uniforms,
    hasCompute: patch.hasCompute !== undefined ? patch.hasCompute : base.hasCompute,
  };
}
