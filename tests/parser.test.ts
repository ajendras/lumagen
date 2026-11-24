import { describe, it, expect } from 'vitest';
import { parseLLMOutput, analyzeWGSL, parseExportedHTML } from '../src/scene/parser.js';

describe('scene/parser.ts', () => {
  describe('parseLLMOutput', () => {
    it('extracts wgsl, uniforms, title and jsLogic from LLM output', () => {
      const mockOutput = `Here is a nice shader:

\`\`\`wgsl
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32
}
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.5, 0.8, 1.0, 1.0);
}
\`\`\`

\`\`\`json
{
  "title": "Pastel Dream",
  "uniforms": [
    {"name":"speed","type":"f32","default":1.5,"min":0.5,"max":3.0},
    {"name":"intensity","type":"f32","default":1.2,"min":0.8,"max":2.5}
  ],
  "jsLogic": "console.log('hello');",
  "hasCompute": false
}
\`\`\``;

      const scene = parseLLMOutput(mockOutput);
      expect(scene.title).toBe('Pastel Dream');
      expect(scene.uniforms).toHaveLength(2);
      expect(scene.uniforms[0].name).toBe('speed');
      expect(scene.wgsl).toContain('struct Uniforms');
      expect(scene.wgsl).toContain('fn vs(');
      expect(scene.jsLogic).toBe("console.log('hello');");
      expect(scene.hasCompute).toBe(false);
    });

    it('falls back gracefully when JSON is missing some fields', () => {
      const mockOutput = `\`\`\`wgsl
struct Uniforms { time: f32, speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs() {} @fragment fn fs() {}
\`\`\`
{
  "title": "Minimal",
  "uniforms": [{"name":"speed","default":1.0}]
}`;
      const scene = parseLLMOutput(mockOutput);
      expect(scene.title).toBe('Minimal');
      expect(scene.uniforms).toHaveLength(1);
    });

    it('handles output with no fenced json by using loose match', () => {
      const output = `shader here
{"title":"Test Scene","uniforms":[{"name":"hue","default":0.5}]}
more text`;
      const scene = parseLLMOutput(output);
      expect(scene.title).toBe('Test Scene');
      expect(scene.uniforms).toHaveLength(1);
    });
  });

  describe('analyzeWGSL', () => {
    it('accepts a valid shader', () => {
      const valid = `
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32
}
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { 
  return vec4f(0.0, 0.0, 0.0, 1.0); 
}

@fragment
fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f { 
  return vec4f(1.0); 
}`;
      const analysis = analyzeWGSL(valid);
      expect(analysis.isValid).toBe(true);
      expect(analysis.errors).toHaveLength(0);
    });

    it('detects missing uniform binding', () => {
      const invalid = `
struct Uniforms { time: f32 }
@vertex fn vs() { }
@fragment fn fs() { }`;
      const analysis = analyzeWGSL(invalid);
      expect(analysis.isValid).toBe(false);
      expect(analysis.errors.some(e => e.toLowerCase().includes('uniform binding') || e.toLowerCase().includes('uni'))).toBe(true);
    });

    it('warns about missing time field', () => {
      const noTime = `
struct Uniforms { speed: f32, intensity: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(); }
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f { return vec4f(1.0); }`;
      const analysis = analyzeWGSL(noTime);
      expect(analysis.isValid).toBe(true);
      expect(analysis.warnings.some(w => w.toLowerCase().includes('time'))).toBe(true);
    });

    it('detects missing vertex entry point', () => {
      const noVertex = `struct Uniforms { time: f32 } @group(0)@binding(0) var<uniform> u: Uniforms; @fragment fn fs() {}`;
      const analysis = analyzeWGSL(noVertex);
      expect(analysis.isValid).toBe(false);
      expect(analysis.errors.some(e => e.toLowerCase().includes('vertex'))).toBe(true);
    });

    it('detects unbalanced braces', () => {
      const unbalanced = `struct Uniforms { time: f32 } fn vs() { if (true) { `;
      const analysis = analyzeWGSL(unbalanced);
      expect(analysis.isValid).toBe(false);
      expect(analysis.errors.some(e => e.toLowerCase().includes('brace') || e.toLowerCase().includes('unbalanced'))).toBe(true);
    });

    it('detects use of main()', () => {
      const bad = `struct Uniforms { time: f32 } @group(0)@binding(0)var<uniform>u:Uniforms; fn main() {}`;
      const analysis = analyzeWGSL(bad);
      expect(analysis.isValid).toBe(false);
      expect(analysis.errors.some(e => e.toLowerCase().includes('main'))).toBe(true);
    });
  });

  describe('parseExportedHTML', () => {
    it('parses new style export with embedded meta script', () => {
      const html = `<script id="lumagen-meta" type="application/json">
{
  "title": "Neon Garden",
  "wgsl": "struct Uniforms { time: f32 } ...",
  "uniforms": [{"name":"speed","default":1.0}],
  "hasCompute": false
}
</script>`;
      const scene = parseExportedHTML(html);
      expect(scene.title).toBe('Neon Garden');
      expect(scene.uniforms).toBeDefined();
      expect(scene.uniforms.length).toBe(1);
    });

    it('falls back to regex extraction for older exports', () => {
      const html = `<!DOCTYPE html>
<title>Neon Garden (Community) — made with Lumagen</title>
<!-- LUMAGEN: {"title":"Neon Garden","uniforms":[{"name":"hueShift","default":0.5}]} -->
<canvas></canvas>`;
      const scene = parseExportedHTML(html);
      expect(scene.title).toBe('Neon Garden');
      expect(scene.uniforms).toBeDefined();
    });

    it('handles community uploaded scenes', () => {
      const html = `<script id="lumagen-meta" type="application/json">{"title":"Neon Garden (Community)","uniforms":[]}</script>`;
      const scene = parseExportedHTML(html);
      expect(scene.title).toBe('Neon Garden');
    });
  });
});
