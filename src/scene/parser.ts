/**
 * src/scene/parser.ts
 * Parses LLM-generated WGSL + JSON metadata into a typed Scene.
 * Performs static analysis on the shader (entry points, uniforms, braces, etc.).
 * Supports community HTML export parsing (embedded JSON or legacy comment).
 * Used by ai/client.ts, gallery.ts, gpu/pipeline.ts and the test suite.
 */

import type { Uniform, Scene } from '../main.js';

export function deriveTitleFromPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('kelp')) return 'Kelp Forest';
  if (lower.includes('neon') || lower.includes('garden')) return 'Neon Garden';
  if (lower.includes('particle') || lower.includes('star')) return 'Stellar Particles';
  if (lower.includes('fractal') || lower.includes('bloom')) return 'Fractal Bloom';
  if (lower.includes('remix') || lower.includes('updated')) return 'Remixed Kelp';
  return 'Generated Scene';
}

function extractJSONBlock(text: string): any | null {
  // Standard code block (most common from LLM)
  let match = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (match?.[1]) {
    try {
      return JSON.parse(match[1].trim());
    } catch (e) {
      // fall through to next strategy
    }
  }

  // Fallback: any JSON-like object containing a "title" key (robust for remix output)
  match = text.match(/(\{[\s\S]*?"title"[\s\S]*?"uniforms"[\s\S]*?\})/i);
  if (match?.[1]) {
    try {
      return JSON.parse(match[1].trim());
    } catch (e) {
      // final attempt – clean common LLM artifacts
    }
  }

  // Last resort – look for any balanced {} that might be JSON
  const jsonLike = text.match(/(\{[\s\S]*\})/);
  if (jsonLike?.[1]) {
    try {
      const candidate = jsonLike[1]
        .replace(/,\s*}/g, '}') // trailing commas
        .replace(/'/g, '"');     // single quotes
      return JSON.parse(candidate);
    } catch (e) {
      console.warn('JSON extraction failed', e);
    }
  }

  return null;
}

export function analyzeWGSL(wgsl: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const openBraces = (wgsl.match(/\{/g) || []).length;
  const closeBraces = (wgsl.match(/\}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push(`Unbalanced braces: ${openBraces} opening vs ${closeBraces} closing`);
  }

  if (!wgsl.includes('@vertex') || !wgsl.includes('fn vs(')) {
    errors.push('Missing vertex entry point (@vertex fn vs())');
  }
  if (!wgsl.includes('@fragment') || !wgsl.includes('fn fs(')) {
    errors.push('Missing fragment entry point (@fragment fn fs())');
  }
  if (!wgsl.includes('struct Uniforms')) {
    errors.push('Missing Uniforms struct definition');
  }
  if (!wgsl.includes('@group(0) @binding(0) var<uniform> u: Uniforms')) {
    errors.push('Missing uniform binding (@group(0) @binding(0) var<uniform> u: Uniforms)');
  }
  if (wgsl.includes('fn main(')) {
    errors.push('Uses main() instead of vs() and fs() entry points');
  }

  // Warning for missing time (common animation driver)
  if (wgsl.includes('struct Uniforms') && !wgsl.includes('time: f32')) {
    warnings.push('Uniforms struct should contain a "time: f32" field for animation');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function parseLLMOutput(raw: string): Scene {
  if (!raw || typeof raw !== 'string') {
    throw new Error('parseLLMOutput requires a non-empty string');
  }

  const wgslMatch = raw.match(/```wgsl\s*([\s\S]*?)\s*```/i);
  const wgsl = wgslMatch?.[1]?.trim() || '// No WGSL shader found in LLM output';

  const json = extractJSONBlock(raw);

  let title = 'Untitled Scene';
  let uniforms: Uniform[] = [];
  let jsLogic = '';

  if (json) {
    title = json.title && typeof json.title === 'string'
      ? json.title
      : deriveTitleFromPrompt(raw);

    if (Array.isArray(json.uniforms)) {
      uniforms = json.uniforms
        .filter((u: any) => u && typeof u.name === 'string')
        .map((u: any): Uniform => ({
          name: u.name,
          type: u.type === 'f32' || u.type === 'i32' ? u.type : 'f32',
          default: typeof u.default === 'number' ? u.default : 1.0,
          min: typeof u.min === 'number' ? u.min : 0.0,
          max: typeof u.max === 'number' ? u.max : 10.0,
        }));
    }

    if (typeof json.jsLogic === 'string') {
      jsLogic = json.jsLogic;
    }
  } else {
    title = deriveTitleFromPrompt(raw);
  }

  // Always run static analysis and surface issues
  const analysis = analyzeWGSL(wgsl);
  if (!analysis.isValid) {
    console.error('WGSL analysis errors:', analysis.errors);
  }
  if (analysis.warnings.length > 0) {
    console.warn('WGSL analysis warnings:', analysis.warnings);
  }

  return {
    title,
    wgsl,
    uniforms,
    jsLogic,
  };
}

/**
 * Parses an exported Lumagen HTML file.
 * Prefers the embedded <script id="lumagen-meta" type="application/json"> block.
 * Falls back to legacy HTML comment for older exports.
 * Returns a Scene ready for loading, remixing or pipeline creation.
 */
export function parseExportedHTML(html: string): Scene {
  if (!html || typeof html !== 'string') {
    throw new Error('parseExportedHTML requires a non-empty HTML string');
  }

  // Primary path – embedded metadata (current exporter)
  const metaMatch = html.match(
    /<script id="lumagen-meta" type="application\/json">([\s\S]*?)<\/script>/i
  );
  if (metaMatch?.[1]) {
    try {
      const meta = JSON.parse(metaMatch[1].trim());
      return {
        title: meta.title && typeof meta.title === 'string' ? meta.title : 'Community Scene',
        wgsl: meta.wgsl && typeof meta.wgsl === 'string' ? meta.wgsl : '// No shader found',
        uniforms: Array.isArray(meta.uniforms) ? meta.uniforms : [],
        jsLogic: typeof meta.jsLogic === 'string' ? meta.jsLogic : '',
      };
    } catch (err) {
      console.warn('Failed to parse embedded lumagen-meta JSON', err);
    }
  }

  // Legacy fallback – HTML comment used in early exports
  const legacyMatch = html.match(/<!--\s*LUMAGEN:\s*(\{[\s\S]*?\})\s*-->/i);
  if (legacyMatch?.[1]) {
    try {
      const meta = JSON.parse(legacyMatch[1]);
      return {
        title: meta.title && typeof meta.title === 'string' ? meta.title : 'Community Scene',
        wgsl: meta.wgsl && typeof meta.wgsl === 'string' ? meta.wgsl : '// No shader found',
        uniforms: Array.isArray(meta.uniforms) ? meta.uniforms : [],
        jsLogic: typeof meta.jsLogic === 'string' ? meta.jsLogic : '',
      };
    } catch (err) {
      console.warn('Failed to parse legacy LUMAGEN comment', err);
    }
  }

  // Minimal fallback when no metadata is present
  const titleMatch = html.match(/<title>([^<]+?)(?: — made with Lumagen)?<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Imported Scene';

  return {
    title,
    wgsl: '// Shader could not be extracted from HTML',
    uniforms: [],
    jsLogic: '// No JS logic embedded',
  };
}
