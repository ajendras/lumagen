/**
 * src/scene/parser.ts
 * Parses raw LLM output (WGSL + JSON metadata) into a typed Scene.
 * Includes static WGSL analysis to catch common errors early.
 * Supports fenced blocks, loose JSON fallback, and exported HTML metadata.
 */

import type { Uniform, Scene } from '../main.js';

export interface AnalysisResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Extracts all ```lang ... ``` blocks from raw text.
 */
function extractCodeBlocks(text: string): Array<{ language: string; content: string }> {
  const regex = /```(\w+)?\s*\n?([\s\S]*?)\n?\s*```/gi;
  const blocks: Array<{ language: string; content: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const language = (match[1] || 'text').toLowerCase().trim();
    const content = match[2].trim();
    blocks.push({ language, content });
  }

  return blocks;
}

/**
 * Runs static analysis on WGSL to catch common Lumagen-required patterns.
 * Does NOT throw — returns structured result so parser can be lenient while
 * pipeline.ts remains strict.
 */
export function analyzeWGSL(wgsl: string): AnalysisResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalized = wgsl.toLowerCase();

  if (!normalized.includes('@vertex') || !normalized.includes('fn vs(')) {
    errors.push('Missing @vertex fn vs() entry point. Full-screen triangle vertex shader is required.');
  }

  if (!normalized.includes('@fragment') || !normalized.includes('fn fs(')) {
    errors.push('Missing @fragment fn fs() entry point.');
  }

  if (!normalized.includes('struct uniforms')) {
    errors.push('Missing struct Uniforms definition.');
  }

  if (!normalized.includes('@group(0) @binding(0) var<uniform> u: uniforms')) {
    errors.push('Missing uniform binding (@group(0) @binding(0) var<uniform> u: Uniforms;)');
  }

  // Simple brace balance check
  let braceCount = 0;
  for (const char of wgsl) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
  }
  if (braceCount !== 0) {
    errors.push('Unbalanced braces in shader code.');
  }

  if (normalized.includes('fn main(')) {
    warnings.push('Prefer explicit vs()/fs() entry points over main().');
  }

  if (normalized.includes('@compute') && (!normalized.includes('fn cs('))) {
    errors.push('Compute shader present but missing fn cs(...) entry point.');
  }

  const hasTime = normalized.includes('time: f32');
  if (!hasTime) {
    warnings.push('Uniforms struct should usually contain a "time: f32" field.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Derives a short, evocative title from a prompt (used as fallback).
 */
export function deriveTitleFromPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('kelp') || lower.includes('underwater')) return 'Kelp Forest';
  if (lower.includes('neon') || lower.includes('garden')) return 'Neon Garden';
  if (lower.includes('particle') || lower.includes('stellar')) return 'Stellar Particles';
  if (lower.includes('fractal') || lower.includes('bloom')) return 'Fractal Bloom';
  if (lower.includes('lava') || lower.includes('magma')) return 'Magma Flow';
  if (lower.includes('aurora') || lower.includes('northern')) return 'Aurora Veil';
  if (lower.includes('bubble')) return 'Bubble Realm';
  if (lower.includes('crystal')) return 'Crystal Lattice';

  // Generic title from first few words
  const words = prompt.split(/\s+/).slice(0, 3);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Parses raw LLM output containing a WGSL shader and JSON metadata.
 * Robust against varying fence styles, ordering, and missing fences.
 */
export function parseLLMOutput(raw: string): Scene {
  if (!raw || typeof raw !== 'string') {
    throw new Error('parseLLMOutput requires a non-empty string');
  }

  const blocks = extractCodeBlocks(raw);

  // Prefer wgsl block by language or by shader signatures
  let wgslBlock = blocks.find(
    b =>
      b.language === 'wgsl' ||
      b.content.includes('@vertex') ||
      b.content.includes('struct Uniforms')
  );
  if (!wgslBlock && blocks.length > 0) {
    wgslBlock = blocks[0];
  }

  // Prefer json block by language or by JSON-like content with known keys
  let jsonBlock = blocks.find(
    b =>
      b.language === 'json' ||
      (b.content.trim().startsWith('{') &&
        (b.content.includes('"title"') || b.content.includes('"uniforms"')))
  );
  if (!jsonBlock && blocks.length > 1) {
    jsonBlock = blocks[1];
  }

  const wgsl = wgslBlock ? wgslBlock.content.trim() : raw.trim();

  let meta: any = {};
  let jsonText = '';

  if (jsonBlock) {
    jsonText = jsonBlock.content.trim();
    // Remove any trailing commas that some LLMs emit (common JSON error)
    jsonText = jsonText.replace(/,\s*(\}|\])/g, '$1');
    try {
      meta = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Failed to parse JSON metadata block: ${(e as Error).message}`);
    }
  } else {
    // Loose match: look for an object containing "title" or "uniforms"
    const looseMatch = raw.match(/(\{[\s\S]*?(?:"title"|"uniforms")[\s\S]*?\})/i);
    if (looseMatch) {
      jsonText = looseMatch[1].replace(/,\s*(\}|\])/g, '$1');
      try {
        meta = JSON.parse(jsonText);
      } catch (e) {
        console.warn('Loose JSON match failed, using defaults');
      }
    }
  }

  const analysis = analyzeWGSL(wgsl);
  if (analysis.errors.length > 0) {
    console.warn('Shader analysis found issues:', analysis.errors);
  }
  if (analysis.warnings.length > 0) {
    console.warn('WGSL analysis warnings:', analysis.warnings);
  }

  const scene: Scene = {
    wgsl,
    uniforms: Array.isArray(meta.uniforms)
      ? meta.uniforms.map((u: any) => ({
          name: u.name || 'intensity',
          type: u.type || 'f32',
          default: typeof u.default === 'number' ? u.default : 1.0,
          min: typeof u.min === 'number' ? u.min : 0.0,
          max: typeof u.max === 'number' ? u.max : 5.0,
        }))
      : [
          { name: 'speed', type: 'f32', default: 1.0, min: 0.2, max: 4.0 },
          { name: 'intensity', type: 'f32', default: 1.2, min: 0.5, max: 3.0 },
        ],
    title: typeof meta.title === 'string' && meta.title.trim()
      ? meta.title.trim()
      : deriveTitleFromPrompt(raw.substring(0, 120)),
    jsLogic: typeof meta.jsLogic === 'string' ? meta.jsLogic.trim() : '',
    hasCompute: meta.hasCompute === true || /@compute|fn cs\(/i.test(wgsl),
  };

  return scene;
}

/**
 * Parses a standalone HTML exported by exportToHTML().
 * Looks for the embedded <script id="lumagen-meta"> first, falls back
 * to regex extraction of shader and uniforms.
 */
export function parseExportedHTML(html: string): Scene {
  if (!html || typeof html !== 'string') {
    throw new Error('parseExportedHTML requires valid HTML string');
  }

  // Primary path: embedded JSON metadata
  const metaMatch = html.match(
    /<script id="lumagen-meta"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (metaMatch && metaMatch[1]) {
    try {
      const meta = JSON.parse(metaMatch[1].trim());
      return {
        wgsl: meta.wgsl || '',
        uniforms: Array.isArray(meta.uniforms) ? meta.uniforms : [],
        title: meta.title || 'Community Scene',
        jsLogic: meta.jsLogic || '',
        hasCompute: meta.hasCompute ?? false,
      };
    } catch (e) {
      console.warn('Failed to parse embedded lumagen-meta JSON, falling back to regex');
    }
  }

  // Fallback regex extraction (for older exports or malformed HTML)
  const wgslMatch = html.match(/wgsl:\s*`([\s\S]*?)`[,}]|wgsl\s*=\s*["']([\s\S]*?)["']/i);
  const wgsl = wgslMatch
    ? (wgslMatch[1] || wgslMatch[2] || '').trim()
    : '// Extracted shader (fallback)';

  const titleMatch = html.match(/title["']\s*:\s*["']([^"']+)["']/i);
  const title = titleMatch ? titleMatch[1] : 'Imported Scene';

  return {
    wgsl,
    uniforms: [],
    title,
    jsLogic: '// Imported from exported HTML',
    hasCompute: /@compute|fn cs\(/i.test(wgsl),
  };
}

/**
 * Creates a new Scene by merging updates while preserving original structure.
 * Useful for partial remixes.
 */
export function remixScene(current: Scene, updates: Partial<Scene>): Scene {
  return {
    wgsl: updates.wgsl ?? current.wgsl,
    uniforms: updates.uniforms ?? current.uniforms,
    title: updates.title ?? current.title,
    jsLogic: updates.jsLogic ?? current.jsLogic,
    hasCompute: updates.hasCompute ?? current.hasCompute,
  };
}
