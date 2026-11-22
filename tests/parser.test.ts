import { describe, it, expect } from 'vitest';
import { parseLLMOutput, analyzeWGSL, parseExportedHTML, deriveTitleFromPrompt } from '../src/scene/parser.js';
import type { Scene } from '../src/main.js';

describe('scene/parser.ts', () => {
  const basicOutput = `Here is a nice scene.

\`\`\`wgsl
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / vec2f(800.0, 600.0) * 2.0 - 1.0;
  let color = 0.5 + 0.5 * cos(u.time * u.speed + uv.xyx + vec3(0.0, 2.0, 4.0));
  return vec4f(color * u.intensity, 1.0);
}
\`\`\`

\`\`\`json
{
  "title": "Basic Plasma",
  "uniforms": [
    {"name":"speed","type":"f32","default":1.0,"min":0.2,"max":3.0},
    {"name":"intensity","type":"f32","default":1.5,"min":0.5,"max":2.5}
  ],
  "jsLogic": "console.log('plasma ready');"
}
\`\`\``;

  it('parses basic LLM output correctly', () => {
    const scene = parseLLMOutput(basicOutput);
    expect(scene.title).toBe('Basic Plasma');
    expect(scene.uniforms).toHaveLength(2);
    expect(scene.uniforms.some((u) => u.name === 'speed')).toBe(true);
    expect(scene.uniforms.some((u) => u.name === 'intensity')).toBe(true);
    expect(scene.wgsl).toContain('@vertex');
    expect(scene.jsLogic).toContain('plasma ready');
  });

  it('derives title from prompt when JSON omits it', () => {
    const output = `\`\`\`wgsl
struct Uniforms { time: f32, speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let verts = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(verts[i],0,1); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
\`\`\``;
    const scene = parseLLMOutput(output);
    expect(typeof scene.title).toBe('string');
    expect(scene.title.length).toBeGreaterThan(0);
  });

  it('handles output without JSON block', () => {
    const output = `\`\`\`wgsl
struct Uniforms { time: f32, speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let verts = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(verts[i],0,1); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
\`\`\``;
    const scene = parseLLMOutput(output);
    expect(scene.title).toBeDefined();
    expect(scene.wgsl).toBeDefined();
  });

  it('handles remix output with updated uniforms', () => {
    const remixOutput = `\`\`\`wgsl
struct Uniforms {
  time: f32,
  colorShift: f32,
  speed: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / vec2f(800.0, 600.0);
  let hue = u.colorShift + sin(u.time * u.speed) * 0.1;
  let color = vec3f(sin(hue * 6.28), cos(hue * 3.14), 0.8);
  return vec4f(color, 1.0);
}
\`\`\`

\`\`\`json
{
  "title": "Remixed Kelp",
  "uniforms": [
    {"name":"colorShift","type":"f32","default":0.4,"min":0.0,"max":1.0},
    {"name":"speed","type":"f32","default":1.5,"min":0.5,"max":4.0}
  ]
}
\`\`\``;

    const scene: Scene = parseLLMOutput(remixOutput);
    expect(scene.title).toBe('Remixed Kelp');
    expect(scene.uniforms.some((u) => u.name === 'colorShift')).toBe(true);
    expect(scene.uniforms.some((u) => u.name === 'speed')).toBe(true);
    expect(scene.uniforms.find((u) => u.name === 'colorShift')?.default).toBe(0.4);
  });

  it('deriveTitleFromPrompt creates evocative title', () => {
    const title = deriveTitleFromPrompt('gentle underwater kelp forest with swaying blades');
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });

  describe('analyzeWGSL', () => {
    it('accepts valid shader', () => {
      const valid = `
struct Uniforms { time: f32, speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
`;
      const analysis = analyzeWGSL(valid);
      expect(analysis.isValid).toBe(true);
      expect(analysis.errors.length).toBe(0);
    });

    it('detects missing vertex entry point', () => {
      const invalid = `
struct Uniforms { time: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@fragment fn fs() -> @location(0) vec4f { return vec4f(0.0); }
`;
      const analysis = analyzeWGSL(invalid);
      expect(analysis.isValid).toBe(false);
      expect(analysis.errors.some((e) => e.toLowerCase().includes('vertex') || e.toLowerCase().includes('vs'))).toBe(true);
    });

    it('detects missing fragment entry point', () => {
      const invalid = `
struct Uniforms { time: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0); }
`;
      const analysis = analyzeWGSL(invalid);
      expect(analysis.isValid).toBe(false);
      expect(analysis.errors.some((e) => e.toLowerCase().includes('fragment') || e.toLowerCase().includes('fs'))).toBe(true);
    });

    it('detects missing uniform binding', () => {
      const invalid = `
struct Uniforms { time: f32 }
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
`;
      const analysis = analyzeWGSL(invalid);
      expect(analysis.isValid).toBe(false);
      expect(analysis.errors.some((e) => e.toLowerCase().includes('uniform') || e.toLowerCase().includes('binding'))).toBe(true);
    });

    it('detects unbalanced braces', () => {
      const invalid = `
struct Uniforms { time: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0);
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
`;
      const analysis = analyzeWGSL(invalid);
      expect(analysis.isValid).toBe(false);
      expect(analysis.errors.some((e) => e.toLowerCase().includes('brace') || e.toLowerCase().includes('unbalanced'))).toBe(true);
    });

    it('warns about missing time field', () => {
      const noTime = `
struct Uniforms { speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
`;
      const analysis = analyzeWGSL(noTime);
      expect(analysis.isValid).toBe(true);
      expect(analysis.warnings.some((w) => w.toLowerCase().includes('time'))).toBe(true);
    });
  });

  describe('parseExportedHTML', () => {
    it('parses embedded lumagen-meta JSON', () => {
      const html = `<!DOCTYPE html>
<html>
<head><title>Test Scene — made with Lumagen</title></head>
<body>
<script id="lumagen-meta" type="application/json">
{
  "title": "Community Kelp",
  "wgsl": "struct Uniforms { time: f32, speed: f32 } @group(0) @binding(0) var<uniform> u: Uniforms; @vertex fn vs() {} @fragment fn fs() { return vec4f(0.0); }",
  "uniforms": [{"name":"speed","type":"f32","default":1.2,"min":0.5,"max":3.0}],
  "jsLogic": ""
}
</script>
</body></html>`;
      const scene = parseExportedHTML(html);
      expect(scene.title).toBe('Community Kelp');
      expect(scene.uniforms.some((u) => u.name === 'speed')).toBe(true);
    });

    it('falls back to regex extraction for older exports', () => {
      const html = `<title>Neon Garden — made with Lumagen</title>
<!-- LUMAGEN: {"title":"Neon Garden","uniforms":[{"name":"hueShift","default":0.6}]} -->`;
      const scene = parseExportedHTML(html);
      expect(scene.title).toBe('Neon Garden');
      expect(scene.uniforms).toBeDefined();
    });
  });
});
