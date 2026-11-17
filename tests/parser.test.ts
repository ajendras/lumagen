import { describe, it, expect } from 'vitest';
import { parseLLMOutput, validateWGSL, remixScene } from '../src/scene/parser.js';
import type { Uniform, Scene } from '../src/main.js';

const VALID_WGSL = `@group(0) @binding(0) var<uniform> u: Uniforms;

struct Uniforms {
  time: f32,
  hue: f32,
  speed: f32,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.8, 0.6, 1.0, 1.0);
}`;

describe('scene/parser.ts', () => {
  describe('parseLLMOutput', () => {
    it('extracts wgsl, json, derives title and handles defaults', () => {
      const raw = `Description of a nice scene.
\`\`\`wgsl
${VALID_WGSL}
\`\`\`

\`\`\`json
{"uniforms":[{"name":"speed","default":1.8,"min":0.5,"max":4}]}
\`\`\``;

      const scene = parseLLMOutput(raw);
      expect(scene.wgsl).toContain('var<uniform>');
      expect(scene.uniforms).toHaveLength(5);
      expect(scene.title).toBe('AI Dreamscape');
      expect(scene.uniforms[0].name).toBe('time');
    });

    it('derives correct title for different prompts', () => {
      let scene = parseLLMOutput('gentle underwater kelp forest with swaying blades');
      expect(scene.title).toBe('Kelp Forest');

      scene = parseLLMOutput('underwater bubble world with iridescent soap bubbles and jellyfish');
      expect(scene.title).toBe('Bubble Realm');
    });

    it('uses fallback placeholder when no wgsl block is present', () => {
      const raw = `json
{"uniforms":[{"name":"speed","default":2}]}`;
      const scene = parseLLMOutput(raw);
      expect(scene.wgsl).toContain('Fallback placeholder shader');
    });

    it('always ensures "time" uniform is present at index 0', () => {
      const raw = `Some prompt about colors.
\`\`\`wgsl
struct Uniforms { time: f32, hue: f32, intensity: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
\`\`\`

\`\`\`json
{"uniforms":[
  {"name":"hue","default":0.7,"min":0,"max":1},
  {"name":"intensity","default":1.2,"min":0.5,"max":2}
]}
\`\`\``;

      const scene = parseLLMOutput(raw);
      expect(scene.uniforms[0].name).toBe('time');
      expect(scene.uniforms[1].name).toBe('hue');
    });
  });

  describe('validateWGSL', () => {
    it('requires uniform binding and proper return types', () => {
      const missingUniform = VALID_WGSL.replace(/var<uniform>/, 'var<storage>');
      expect(validateWGSL(missingUniform)).toBe(false);

      const badReturn = VALID_WGSL.replace('@location(0) vec4f', 'vec3f');
      expect(validateWGSL(badReturn)).toBe(false);

      expect(validateWGSL(VALID_WGSL)).toBe(true);
    });
  });

  describe('edge cases and robustness', () => {
    it('normalizes uniform names and ensures numeric values', () => {
      const raw = `Edge case test.
\`\`\`json
{"uniforms":[{"name":" Speed ","default":"2.25","min":0,"max":5.0},{"name":"hue","default":0.8}]}
\`\`\``;
      const scene = parseLLMOutput(raw);
      const speedUniform = scene.uniforms.find((u: Uniform) => u.name === 'speed');
      expect(speedUniform).toBeDefined();
      expect(speedUniform!.default).toBe(2.25);
      expect(speedUniform!.min).toBe(0);
      expect(speedUniform!.max).toBe(5);
    });

    it('handles malformed JSON by falling back to defaults', () => {
      const raw = '```wgsl\n' + VALID_WGSL + '\n```\n```json\n{ "uniforms": [invalid] }```';
      const scene = parseLLMOutput(raw);
      expect(scene.uniforms.length).toBeGreaterThan(0);
      expect(scene.uniforms[0].name).toBe('time');
    });

    it('remixScene works as expected', () => {
      const base: Scene = {
        wgsl: 'original wgsl',
        uniforms: [{ name: 'speed', type: 'f32', default: 1, min: 0, max: 10 }],
        jsLogic: 'old logic',
        title: 'Original',
      };
      const patched = remixScene(base, {
        wgsl: 'new wgsl',
        title: 'Remixed',
      });
      expect(patched.wgsl).toBe('new wgsl');
      expect(patched.title).toBe('Remixed');
      expect(patched.uniforms).toEqual(base.uniforms);
      expect(patched.jsLogic).toBe('old logic');
    });
  });
});
