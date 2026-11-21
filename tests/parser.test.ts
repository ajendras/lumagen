import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseLLMOutput, analyzeWGSL, deriveTitleFromPrompt } from '../src/scene/parser.js';
import type { Scene } from '../src/main.js';

describe('scene/parser.ts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts WGSL and JSON from LLM markdown output', () => {
    const raw = `Here is a scene:
\`\`\`wgsl
struct Uniforms {
  time: f32,
  speed: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(0.8, 0.6, 1.0, 1.0);
}
\`\`\`

\`\`\`json
{
  "title": "Pastel Dream",
  "uniforms": [
    {"name":"speed","type":"f32","default":1.2,"min":0.5,"max":3.0},
    {"name":"intensity","type":"f32","default":1.0,"min":0.2,"max":2.0}
  ]
}
\`\`\``;

    const scene: Scene = parseLLMOutput(raw);
    expect(scene.title).toBe('Pastel Dream');
    expect(scene.uniforms).toHaveLength(2);
    expect(scene.uniforms[0].name).toBe('speed');
    expect(scene.wgsl).toContain('@vertex');
    expect(scene.wgsl).toContain('fn vs');
  });

  it('derives title from prompt keywords', () => {
    expect(deriveTitleFromPrompt('gentle underwater kelp forest')).toBe('Kelp Forest');
    expect(deriveTitleFromPrompt('ethereal glowing neon garden')).toBe('Neon Garden');
    expect(deriveTitleFromPrompt('cosmic dust field')).toBe('Stellar Particles');
    expect(deriveTitleFromPrompt('recursive pastel fractal')).toBe('Fractal Bloom');
    expect(deriveTitleFromPrompt('molten lava river')).toBe('Magma Flow');
    expect(deriveTitleFromPrompt('unknown prompt with no keywords')).toBe('Generated Scene');
  });

  it('provides fallback uniforms when JSON block is missing or invalid', () => {
    const raw = '```wgsl\nstruct Uniforms { time: f32 }\n@vertex fn vs() -> @builtin(position) vec4f { return vec4f(0); }\n@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }\n```';
    const scene = parseLLMOutput(raw);
    expect(scene.uniforms.length).toBeGreaterThan(0);
    expect(scene.title).toBeDefined();
    expect(scene.uniforms.some(u => u.name === 'speed')).toBe(true);
  });

  describe('analyzeWGSL', () => {
    it('accepts a valid full-screen triangle shader', () => {
      const wgsl = `
struct Uniforms { time: f32, speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let pos = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.9, 0.7, 1.0, 1.0);
}
`;
      const result = analyzeWGSL(wgsl);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports missing vertex entry point', () => {
      const wgsl = `
@fragment
fn fs() -> @location(0) vec4f { return vec4f(1.0); }
`;
      const result = analyzeWGSL(wgsl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('vertex'))).toBe(true);
    });

    it('reports missing fragment entry point', () => {
      const wgsl = `
@vertex
fn vs() -> @builtin(position) vec4f { return vec4f(0.0); }
`;
      const result = analyzeWGSL(wgsl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('fragment'))).toBe(true);
    });

    it('reports missing uniform binding', () => {
      const wgsl = `
@vertex fn vs() -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
`;
      const result = analyzeWGSL(wgsl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('uniform'))).toBe(true);
    });

    it('detects unbalanced braces', () => {
      const wgsl = `
@vertex
fn vs() -> @builtin(position) vec4f { return vec4f(0.0,0.0,0.0,1.0);
@fragment
fn fs() -> @location(0) vec4f { return vec4f(1.0); }
`;
      const result = analyzeWGSL(wgsl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('brace') || e.toLowerCase().includes('unbalanced'))).toBe(true);
    });

    it('warns when time uniform is missing', () => {
      const wgsl = `
struct Uniforms { speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
`;
      const result = analyzeWGSL(wgsl);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.toLowerCase().includes('time'))).toBe(true);
    });

    it('rejects use of main() entry point', () => {
      const wgsl = `
fn main() {}
@vertex fn vs() -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
`;
      const result = analyzeWGSL(wgsl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('main'))).toBe(true);
    });
  });

  it('handles remix output with updated uniforms', () => {
    const remixOutput = `\`\`\`wgsl
// remixed shader
struct Uniforms { time: f32, speed: f32, colorShift: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs() -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
\`\`\`

\`\`\`json
{"title":"Remixed Kelp","uniforms":[{"name":"speed","type":"f32","default":2.1,"min":0.5,"max":5},{"name":"colorShift","type":"f32","default":0.5,"min":0,"max":1}]}
\`\`\``;

    const scene = parseLLMOutput(remixOutput);
    expect(scene.title).toBe('Remixed Kelp');
    expect(scene.uniforms.some(u => u.name === 'colorShift')).toBe(true);
    expect(scene.uniforms.some(u => u.name === 'speed')).toBe(true);
  });
});
