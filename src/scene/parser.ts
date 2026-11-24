/**
 * src/scene/parser.ts
 * Parses LLM output into a Scene object by extracting the WGSL code block
 * and the JSON metadata block. Runs static analysis on the shader.
 * Also handles parsing of exported HTML files for the community gallery
 * by looking for embedded JSON in <script id="lumagen-meta"> or fallback
 * to older <!-- LUMAGEN: {...} --> comments.
 */

import type { Uniform, Scene } from '../main.js';

export interface AnalysisResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function analyzeWGSL(wgsl: string): AnalysisResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const code = wgsl.trim();

  if (!code) {
    errors.push('Shader code is empty');
    return { isValid: false, errors, warnings };
  }

  const hasVertex = /@vertex/i.test(code) && /fn\s+vs\s*\(/i.test(code);
  const hasFragment = /@fragment/i.test(code) && /fn\s+fs\s*\(/i.test(code);
  const hasMain = /fn\s+main\s*\(/i.test(code);
  const hasUniformStruct = /struct\s+Uniforms\s*\{/i.test(code);
  const hasUniformBinding = /@group\s*\(\s*0\s*\)\s*@binding\s*\(\s*0\s*\)\s*var<uniform>\s+\w+\s*:\s*Uniforms\s*;/i.test(code);
  const hasTime = /time\s*:\s*f32/i.test(code);
  const braceOpen = (code.match(/\{/g) || []).length;
  const braceClose = (code.match(/\}/g) || []).length;
  const hasCompute = /@compute/i.test(code) || /fn\s+cs\s*\(/i.test(code);

  if (!hasVertex) errors.push('Missing @vertex fn vs() entry point. Full-screen triangle vertex shader is required.');
  if (!hasFragment) errors.push('Missing @fragment fn fs() entry point.');
  if (hasMain) errors.push('Found fn main() – use vs() for vertex and fs() for fragment instead.');
  if (!hasUniformStruct) errors.push('Missing struct Uniforms definition.');
  if (!hasUniformBinding) errors.push('Missing uniform binding (@group(0) @binding(0) var<uniform> u: Uniforms;)');
  if (braceOpen !== braceClose) errors.push(`Unbalanced braces: ${braceOpen} opening, ${braceClose} closing.`);

  if (hasUniformStruct && !hasTime) {
    warnings.push('Uniforms struct is missing the "time: f32" field. Animation may not update correctly.');
  }

  if (hasCompute && !/fn\s+cs\s*\(\s*@\s*builtin\(global_invocation_id\)\s+id:\s*u32\)/i.test(code)) {
    warnings.push('Compute entry point should use @builtin(global_invocation_id) id: u32');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function deriveTitleFromPrompt(promptOrCode: string): string {
  const clean = promptOrCode.replace(/```[\s\S]*?```/g, '').trim();
  const firstLine = clean.split('\n')[0] || clean;
  const words = firstLine.split(/\s+/).slice(0, 3);
  return words.map((w) => w.replace(/[^a-zA-Z]/g, '')).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Lumagen Scene';
}

export function parseLLMOutput(raw: string): Scene {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Invalid LLM output: expected a string');
  }

  // Extract WGSL - support both ```wgsl and ```
  let wgslMatch = raw.match(/```(?:wgsl|WGSL)?\s*\n?([\s\S]*?)\n?```/i);
  let wgsl = wgslMatch ? wgslMatch[1].trim() : '';

  if (!wgsl) {
    wgsl = raw.trim();
  }

  // Extract JSON metadata
  let jsonMatch = raw.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/i);
  let meta: any = null;

  if (jsonMatch) {
    const jsonText = jsonMatch[1].trim();
    try {
      meta = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Failed to parse JSON metadata block: ${(e as Error).message}`);
    }
  } else {
    // Fallback: look for any JSON object in the text
    const looseJsonMatch = raw.match(/(\{\s*"title"[\s\S]*?\}\s*(?=\n|$))/);
    if (looseJsonMatch) {
      try {
        meta = JSON.parse(looseJsonMatch[1]);
      } catch (e) {
        // ignore and fall through to error below
      }
    }
  }

  if (!meta || typeof meta.title !== 'string' || !Array.isArray(meta.uniforms)) {
    throw new Error('No JSON metadata block found in LLM output. The AI must return a ```json block with title and uniforms.');
  }

  const uniforms: Uniform[] = meta.uniforms.map((u: any) => ({
    name: u.name,
    type: u.type || 'f32',
    default: typeof u.default === 'number' ? u.default : 1.0,
    min: typeof u.min === 'number' ? u.min : 0.0,
    max: typeof u.max === 'number' ? u.max : 10.0,
  }));

  const title = (meta.title || deriveTitleFromPrompt(raw)).replace(/ \(Community\)$/i, '').trim();

  const analysis = analyzeWGSL(wgsl);
  if (!analysis.isValid) {
    console.warn('Shader analysis found issues:', analysis.errors);
  }

  return {
    title,
    wgsl,
    uniforms,
    jsLogic: meta.jsLogic || meta.js_logic || '',
    hasCompute: !!meta.hasCompute || /@compute|fn cs\(/i.test(wgsl),
  };
}

export function parseExportedHTML(html: string): Scene {
  if (!html || typeof html !== 'string') {
    throw new Error('parseExportedHTML requires valid HTML string');
  }

  // Prefer the new embedded JSON metadata script tag
  const metaScriptRegex = /<script id=["']?lumagen-meta["']?[^>]*>([\s\S]*?)<\/script>/i;
  const scriptMatch = html.match(metaScriptRegex);

  if (scriptMatch && scriptMatch[1]) {
    try {
      const meta = JSON.parse(scriptMatch[1].trim());
      return {
        title: String(meta.title || 'Untitled Scene').replace(/ \(Community\)$/i, '').trim(),
        wgsl: String(meta.wgsl || ''),
        uniforms: Array.isArray(meta.uniforms) ? meta.uniforms : [],
        jsLogic: meta.jsLogic || '',
        hasCompute: !!meta.hasCompute,
      };
    } catch (parseError) {
      console.warn('Failed to parse meta script JSON, falling back to regex', parseError);
    }
  }

  // Fallback for older exports using HTML comment
  const commentRegex = /<!--\s*LUMAGEN:\s*(\{[\s\S]*?\})\s*-->/i;
  const commentMatch = html.match(commentRegex);

  if (commentMatch && commentMatch[1]) {
    try {
      const meta = JSON.parse(commentMatch[1]);
      const wgslMatch = html.match(/```wgsl\s*([\s\S]*?)\s*```/i);
      return {
        title: String(meta.title || 'Untitled Scene').replace(/ \(Community\)$/i, '').trim(),
        wgsl: meta.wgsl || (wgslMatch ? wgslMatch[1].trim() : ''),
        uniforms: Array.isArray(meta.uniforms) ? meta.uniforms : [],
        jsLogic: meta.jsLogic || '',
        hasCompute: !!meta.hasCompute,
      };
    } catch (e) {
      console.warn('Failed to parse LUMAGEN comment JSON');
    }
  }

  // Ultimate fallback: regex extraction from title and any uniform data
  const titleMatch = html.match(/title["']\s*:\s*["']([^"']*?)["']/i) ||
                     html.match(/<title>([^<]+?)(\s*—|\s*-)/i);
  let title = titleMatch ? titleMatch[1].trim() : 'Imported Scene';
  title = title.replace(/ \(Community\)$/i, '').trim();

  const wgslMatch = html.match(/```wgsl\s*([\s\S]*?)\s*```/i);
  const wgsl = wgslMatch ? wgslMatch[1].trim() : '// No WGSL found in export';

  let uniforms: Uniform[] = [];
  const anyJsonMatch = html.match(/(\{[\s\S]*?uniforms[\s\S]*?\})/i);
  if (anyJsonMatch) {
    try {
      const parsed = JSON.parse(anyJsonMatch[1]);
      if (Array.isArray(parsed.uniforms)) {
        uniforms = parsed.uniforms;
      }
    } catch (_) {}
  }

  return {
    title,
    wgsl,
    uniforms,
    jsLogic: '// Parsed from exported HTML',
    hasCompute: false,
  };
}
