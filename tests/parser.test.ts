import { describe, it, expect } from 'vitest';
import { parseLLMOutput, validateWGSL, remixScene } from '../src/scene/parser.js';
import type { Uniform, Scene } from '../src/main.js';

describe('scene/parser.ts', () => {
  describe('parseLLMOutput', () => {
    it('extracts wgsl, json, derives title and handles defaults', () => {
      const raw = `Test prompt for AI Dreamscape.

\`\`\`wgsl
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
  hueShift: f32,
  density: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { 
  let verts = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(verts[i],0,1);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f { return vec4f(0.5); }
\`\`\`

\`\`\`json
{
  "uniforms": [
    {"name":"speed","type":"f32","default":1.8,"min":0.4,"max":6.0},
    {"name":"intensity","type":"f32","default":1.2,"min":0.6,"max":3.5},
    {"name":"hueShift","type":"f32","default":0.65,"min":0.0,"max":1.0},
    {"name":"density","type":"f32","default":6.5,"min":2.0,"max":14.0}
  ],
  "jsLogic": "/* custom logic */"
}
\`\`\``;

      const scene = parseLLMOutput(raw);

      expect(scene.wgsl).toContain('var<uniform>');
      expect(scene.uniforms).toHaveLength(5);
      expect(scene.title).toBe('AI Dreamscape');
      expect(scene.uniforms[0].name).toBe('time');
      expect(scene.uniforms[1].name).toBe('speed');
      expect(scene.jsLogic).toContain('custom logic');
      expect(validateWGSL(scene.wgsl)).toBe(true);
    });
  });

  describe('edge cases and robustness', () => {
    it('handles malformed JSON by falling back to defaults', () => {
      const raw = `malformed test

\`\`\`wgsl
@group(0)@binding(0) var<uniform> u: Uniforms;
@vertex fn vs() {} @fragment fn fs(@builtin(position) p:vec4f)->@location(0)vec4f {return vec4f(1.0);}
\`\`\`

\`\`\`json
{"uniforms": [invalid] }
\`\`\``;

      // should log warn but not throw, use defaults
      const scene = parseLLMOutput(raw);

      expect(scene.uniforms).toHaveLength(5);
      expect(scene.uniforms.some((u) => u.name === 'speed')).toBe(true);
      expect(scene.uniforms.some((u) => u.name === 'time')).toBe(true);
      expect(scene.title).toBe('AI Dreamscape');
    });

    it('normalizes uniform names and ensures numeric values', () => {
      const raw = `\`\`\`json
{
  "uniforms": [
    {"name":"Speed","default":"2.25","min":"0","max":"10"},
    {"name":"  INTENSITY  ","default":1.75,"min":0.1,"max":"4.0"},
    {"name":"hue","default":0.5,"min":0,"max":1}
  ]
}
\`\`\``;

      const scene = parseLLMOutput(raw);

      const speedUniform = scene.uniforms.find((u: Uniform) => u.name === 'speed');
      expect(speedUniform).toBeDefined();
      expect(speedUniform!.default).toBe(2.25);
      expect(speedUniform!.min).toBe(0);
      expect(speedUniform!.max).toBe(10);

      const intensityUniform = scene.uniforms.find((u: Uniform) => u.name === 'intensity');
      expect(intensityUniform).toBeDefined();
      expect(intensityUniform!.default).toBe(1.75);

      // time should still be prepended, names are lowercased
      expect(scene.uniforms[0].name).toBe('time');
      expect(scene.uniforms.length).toBe(4); // time + 3 normalized uniforms
    });

    it('handles missing json block by using defaults', () => {
      const raw = `\`\`\`wgsl

var<uniform> u: Uniforms;

fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0,0.0,0.0,1.0); }

fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f { return vec4f(1.0); }

\`\`\``;

      const scene = parseLLMOutput(raw);

      expect(scene.uniforms).toHaveLength(5);
      expect(scene.wgsl).toContain('var<uniform>');
    });

    it('throws on completely invalid input', () => {
      expect(() => parseLLMOutput('')).toThrow();
      expect(() => parseLLMOutput('   ')).toThrow();
      expect(() => parseLLMOutput((123 as any))).toThrow();
    });
  });

  describe('validateWGSL', () => {
    it('returns false for too short or missing required elements', () => {
      expect(validateWGSL('')).toBe(false);
      expect(validateWGSL('fn main() {}')).toBe(false);
    });

    it('returns true for valid full-screen triangle WGSL', () => {
      const valid = `
struct Uniforms { time: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(0.0, 0.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(1.0, 0.5, 0.8, 1.0);
}
      `;
      expect(validateWGSL(valid)).toBe(true);
    });
  });

  describe('remixScene', () => {
    it('merges base scene with patch correctly', () => {
      const base: Scene = {
        wgsl: 'old shader',
        uniforms: [{ name: 'time', type: 'f32', default: 0 }, { name: 'speed', type: 'f32', default: 1 }],
        jsLogic: 'old logic',
        title: 'Old Title'
      };

      const patched = remixScene(base, {
        wgsl: 'new shader',
        title: 'New Title'
      });

      expect(patched.wgsl).toBe('new shader');
      expect(patched.title).toBe('New Title');
      expect(patched.uniforms).toEqual(base.uniforms);
      expect(patched.jsLogic).toBe('old logic');
    });
  });
});
