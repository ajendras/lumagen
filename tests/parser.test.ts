import { describe, it, expect } from 'vitest';
import { parseLLMOutput, analyzeWGSL, deriveTitleFromPrompt, parseExportedHTML } from '../src/scene/parser.js';
import { SYSTEM_PROMPT } from '../src/ai/client.js';

describe('Scene Parser', () => {
  it('parseLLMOutput extracts WGSL, uniforms, title, jsLogic and hasCompute', () => {
    const mockOutput = `\`\`\`wgsl
struct Uniforms { 
  time: f32, speed: f32, intensity: f32, hueShift: f32 
}
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.9, 0.7, 1.0, 1.0);
}
\`\`\`

\`\`\`json
{
  "title": "Test Dreamscape",
  "uniforms": [
    {"name":"speed","type":"f32","default":1.2,"min":0.5,"max":3.0},
    {"name":"intensity","type":"f32","default":1.5,"min":0.8,"max":2.5},
    {"name":"hueShift","type":"f32","default":0.6,"min":0.0,"max":1.0}
  ],
  "jsLogic": "console.log('demo js logic');",
  "hasCompute": false
}
\`\`\``;

    const scene = parseLLMOutput(mockOutput);
    expect(scene.title).toBe('Test Dreamscape');
    expect(scene.uniforms.length).toBe(3);
    expect(scene.uniforms[0].name).toBe('speed');
    expect(scene.uniforms[0].default).toBe(1.2);
    expect(scene.jsLogic).toBe("console.log('demo js logic');");
    expect(scene.hasCompute).toBe(false);
    expect(scene.wgsl).toContain('@vertex');
    expect(scene.wgsl).toContain('fn fs(');
  });

  it('analyzeWGSL detects missing vertex and fragment entry points', () => {
    const invalid = 'fn main() { }';
    const analysis = analyzeWGSL(invalid);
    expect(analysis.isValid).toBe(false);
    expect(analysis.errors).toContain('Missing vertex entry point');
    expect(analysis.errors).toContain('Missing fragment entry point');
  });

  it('analyzeWGSL detects missing Uniforms struct and binding', () => {
    const missingUniform = `
@vertex fn vs(i: u32) -> vec4f { return vec4f(0.0); }
@fragment fn fs() -> vec4f { return vec4f(1.0); }
    `;
    const analysis = analyzeWGSL(missingUniform);
    expect(analysis.isValid).toBe(false);
    expect(analysis.errors.some(e => e.includes('Uniforms') || e.includes('binding'))).toBe(true);
  });

  it('analyzeWGSL warns on missing time uniform but still validates', () => {
    const noTime = `
struct Uniforms { speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { 
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0); 
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f { return vec4f(1.0); }
    `;
    const analysis = analyzeWGSL(noTime);
    expect(analysis.isValid).toBe(true);
    expect(analysis.warnings.length).toBeGreaterThan(0);
    expect(analysis.warnings.some(w => w.includes('time'))).toBe(true);
  });

  it('analyzeWGSL passes a well-formed shader', () => {
    const good = `
struct Uniforms { time: f32, speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { 
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0); 
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f { return vec4f(1.0); }
    `;
    const analysis = analyzeWGSL(good);
    expect(analysis.isValid).toBe(true);
    expect(analysis.errors.length).toBe(0);
  });

  it('deriveTitleFromPrompt creates evocative titles from natural language', () => {
    expect(deriveTitleFromPrompt('gentle underwater kelp forest with swaying blades')).toBe('Kelp Forest');
    expect(deriveTitleFromPrompt('ethereal glowing neon garden at twilight')).toBe('Neon Garden');
    expect(deriveTitleFromPrompt('cosmic dust field with twinkling pastel stars')).toBe('Stellar Particles');
  });

  it('parseExportedHTML extracts embedded lumagen-meta JSON and falls back to regex', () => {
    const htmlWithMeta = `<!DOCTYPE html><script id="lumagen-meta" type="application/json">
{"title":"Community Kelp","wgsl":"struct Uniforms...","uniforms":[{"name":"speed","default":1.2}],"jsLogic":""}
</script><canvas></canvas>`;
    const scene = parseExportedHTML(htmlWithMeta);
    expect(scene.title).toBe('Community Kelp');
    expect(scene.uniforms.length).toBeGreaterThan(0);
    expect(scene.wgsl).toBeDefined();

    // fallback test
    const plainHtml = `<title>My Scene — made with Lumagen</title><script>/* wgsl here */</script>`;
    const fallbackScene = parseExportedHTML(plainHtml);
    expect(fallbackScene.title).toContain('My Scene');
  });

  it('system prompt contains few-shot examples to improve shader quality on first try', () => {
    expect(SYSTEM_PROMPT).toContain('Few-shot examples');
    expect(SYSTEM_PROMPT).toContain('soft pastel clouds drifting over a tranquil lake at sunset');
    expect(SYSTEM_PROMPT).toContain('vibrant audio reactive particle field that pulses to the beat');
    expect(SYSTEM_PROMPT).toContain('hue2rgb');
    expect(SYSTEM_PROMPT).toContain('Example 1 - Basic organic scene');
    expect(SYSTEM_PROMPT).toContain('Example 2 - Audio reactive scene');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(3500);
    // ensure rules reference the examples
    expect(SYSTEM_PROMPT).toContain('Follow the style and structure of the few-shot examples below');
  });
});
