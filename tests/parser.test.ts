import { describe, it, expect } from 'vitest';
import { parseLLMOutput, validateWGSL, remixScene } from '../src/scene/parser.js';
import type { Scene, Uniform } from '../src/main.js';

const VALID_WGSL = `struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
  hueShift: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / vec2f(800.0, 600.0) * 2.0 - 1.0;
  return vec4f(0.2, 0.6, 0.9, 1.0);
}`;

describe('scene/parser.ts', () => {
  describe('parseLLMOutput', () => {
    it('parses complete wgsl + json blocks and extracts uniforms', () => {
      const mockLLM = `Here is a beautiful scene:

\`\`\`wgsl
${VALID_WGSL}
\`\`\`

\`\`\`json
{
  "uniforms": [
    {"name":"speed","type":"f32","default":1.8,"min":0.5,"max":4.0},
    {"name":"intensity","type":"f32","default":1.4,"min":0.8,"max":3.0},
    {"name":"hueShift","type":"f32","default":0.6,"min":0.0,"max":1.0}
  ],
  "jsLogic": "uniforms.intensity = Math.sin(time) * 0.2 + 1.2;"
}
\`\`\``;

      const scene = parseLLMOutput(mockLLM);

      expect(scene.wgsl).toContain('struct Uniforms');
      expect(scene.wgsl).toContain('@vertex');
      expect(scene.wgsl).toContain('@fragment');
      expect(scene.uniforms).toHaveLength(4); // time is prepended
      expect(scene.uniforms[0].name).toBe('time');
      expect(scene.uniforms[1].name).toBe('speed');
      expect(scene.uniforms[1].default).toBe(1.8);
      expect(scene.uniforms[1].min).toBe(0.5);
      expect(scene.jsLogic).toContain('Math.sin(time)');
      expect(scene.title).toBe('AI Dreamscape'); // no keyword match
    });

    it('derives friendly titles based on prompt keywords', () => {
      const kelp = parseLLMOutput('gentle underwater kelp forest with swaying blades');
      expect(kelp.title).toBe('Kelp Forest');

      const particles = parseLLMOutput('cosmic dust field with twinkling pastel stars');
      expect(particles.title).toBe('Stellar Particles');

      const fractal = parseLLMOutput('recursive pastel fractal flower that blooms');
      expect(fractal.title).toBe('Fractal Bloom');

      const neon = parseLLMOutput('ethereal glowing neon garden at twilight');
      expect(neon.title).toBe('Neon Garden');

      const lava = parseLLMOutput('molten lava river with heat distortion');
      expect(lava.title).toBe('Magma Flow');

      const aurora = parseLLMOutput('flowing northern-lights curtains in soft mint');
      expect(aurora.title).toBe('Aurora Veil');

      const bubble = parseLLMOutput('underwater bubble world with iridescent soap bubbles');
      expect(bubble.title).toBe('Bubble Realm');

      const crystal = parseLLMOutput('refractive geometric crystal lattice');
      expect(crystal.title).toBe('Crystal Lattice');
    });

    it('falls back to default uniforms when JSON block is missing', () => {
      const mockLLM = `\`\`\`wgsl\n${VALID_WGSL}\n\`\`\``;
      const scene = parseLLMOutput(mockLLM);

      expect(scene.uniforms.length).toBeGreaterThanOrEqual(4);
      expect(scene.uniforms.some((u: Uniform) => u.name === 'speed')).toBe(true);
      expect(scene.uniforms.some((u: Uniform) => u.name === 'intensity')).toBe(true);
      expect(scene.jsLogic).toContain('No additional per-frame JS logic');
    });

    it('gracefully handles malformed JSON and uses defaults', () => {
      const mockLLM = `\`\`\`wgsl\n${VALID_WGSL}\n\`\`\`\n\`\`\`json\n{ "uniforms": "this is not an array" }\n\`\`\``;
      const scene = parseLLMOutput(mockLLM);

      expect(scene.uniforms.length).toBeGreaterThanOrEqual(3);
      expect(scene.uniforms[0].name).toBe('time');
      // Should not throw
    });

    it('gracefully handles missing WGSL block', () => {
      const mockLLM = `\`\`\`json\n{"uniforms":[{"name":"speed","default":2}]}\n\`\`\``;
      const scene = parseLLMOutput(mockLLM);

      expect(scene.wgsl).toContain('Fallback placeholder shader');
      expect(scene.uniforms.length).toBeGreaterThan(0);
    });

    it('throws helpful error on empty or invalid input', () => {
      expect(() => parseLLMOutput('')).toThrow('non-empty string');
      expect(() => parseLLMOutput('   \n\t')).toThrow('non-empty string');
      expect(() => parseLLMOutput(null as any)).toThrow();
      expect(() => parseLLMOutput(123 as any)).toThrow();
    });

    it('always ensures "time" uniform is present at index 0', () => {
      const mockLLM = `\`\`\`wgsl\n${VALID_WGSL}\n\`\`\`\n\`\`\`json\n{"uniforms":[{"name":"hue","default":0.5}]}\n\`\`\``;
      const scene = parseLLMOutput(mockLLM);

      expect(scene.uniforms[0].name).toBe('time');
      expect(scene.uniforms[1].name).toBe('hue');
    });

    it('filters out malformed uniform entries from JSON', () => {
      const mockLLM = `\`\`\`wgsl\n${VALID_WGSL}\n\`\`\`\n\`\`\`json
{
  "uniforms": [
    {"name":"speed","default":1.5},
    {"name":"","default":999},
    {"name":"intensity","default":"not-a-number"}
  ]
}
\`\`\``;

      const scene = parseLLMOutput(mockLLM);
      const validNames = scene.uniforms.map((u: Uniform) => u.name);
      expect(validNames).toContain('speed');
      expect(validNames).not.toContain('');
      // intensity was filtered because default was not a number
    });
  });

  describe('validateWGSL', () => {
    it('returns true for a well-formed full-screen triangle shader', () => {
      expect(validateWGSL(VALID_WGSL)).toBe(true);
    });

    it('returns false for clearly invalid or too-short WGSL', () => {
      expect(validateWGSL('')).toBe(false);
      expect(validateWGSL('fn main() {}')).toBe(false);
      expect(validateWGSL('// just a comment')).toBe(false);
    });

    it('detects missing vertex or fragment entry points', () => {
      const noVertex = VALID_WGSL.replace(/@vertex[\s\S]+?fn vs[\s\S]+?\{[\s\S]+?\}/, '');
      expect(validateWGSL(noVertex)).toBe(false);

      const noFragment = VALID_WGSL.replace(/@fragment[\s\S]+?fn fs[\s\S]+?\{[\s\S]+?\}/, '');
      expect(validateWGSL(noFragment)).toBe(false);
    });

    it('requires uniform binding and proper return types', () => {
      const missingUniform = VALID_WGSL.replace(/var<uniform>/, 'var<storage>');
      expect(validateWGSL(missingUniform)).toBe(false);

      const badReturn = VALID_WGSL.replace('@location(0) vec4f', 'vec3f');
      expect(validateWGSL(badReturn)).toBe(false);
    });

    it('is case-insensitive for keywords', () => {
      const lowerCase = VALID_WGSL.toLowerCase();
      expect(validateWGSL(lowerCase)).toBe(true);
    });
  });

  describe('remixScene', () => {
    const baseScene: Scene = {
      wgsl: VALID_WGSL,
      uniforms: [
        { name: 'speed', type: 'f32', default: 1.0, min: 0.2, max: 5.0 },
        { name: 'intensity', type: 'f32', default: 1.2, min: 0.5, max: 3.0 },
      ],
      jsLogic: '// base logic',
      title: 'Base Scene',
    };

    it('preserves unchanged properties when patching', () => {
      const patched = remixScene(baseScene, {
        title: 'Remixed Lighting',
        jsLogic: '// new motion logic',
      });

      expect(patched.wgsl).toBe(baseScene.wgsl);
      expect(patched.uniforms).toEqual(baseScene.uniforms);
      expect(patched.title).toBe('Remixed Lighting');
      expect(patched.jsLogic).toBe('// new motion logic');
    });

    it('can replace uniforms while keeping shader', () => {
      const newUniforms: Uniform[] = [
        { name: 'speed', type: 'f32', default: 2.5, min: 0.1, max: 10 },
      ];

      const patched = remixScene(baseScene, { uniforms: newUniforms });

      expect(patched.wgsl).toBe(baseScene.wgsl);
      expect(patched.uniforms).toEqual(newUniforms);
    });

    it('returns a new object (immutable)', () => {
      const patched = remixScene(baseScene, { title: 'New Title' });
      expect(patched).not.toBe(baseScene);
    });
  });

  describe('edge cases and robustness', () => {
    it('handles LLM output with extra markdown or explanations before blocks', () => {
      const noisy = `Sure! Here is your pastel scene:\n\n**WGSL shader:**\n\`\`\`wgsl\n${VALID_WGSL}\n\`\`\`\n\nAnd the metadata:\n\`\`\`json\n{"uniforms":[{"name":"density","default":7.5}]}\n\`\`\``;

      const scene = parseLLMOutput(noisy);
      expect(scene.wgsl).toContain('@vertex');
      expect(scene.uniforms.some((u: Uniform) => u.name === 'density')).toBe(true);
    });

    it('normalizes uniform names and ensures numeric values', () => {
      const mock = `\`\`\`wgsl\n${VALID_WGSL}\n\`\`\`\n\`\`\`json\n{"uniforms":[{"name":"SPEED","default":"2.25","min":"0","max":5}]}\n\`\`\``;
      const scene = parseLLMOutput(mock);

      const speedUniform = scene.uniforms.find((u: Uniform) => u.name === 'SPEED');
      expect(speedUniform).toBeDefined();
      expect(speedUniform!.default).toBe(2.25);
      expect(speedUniform!.min).toBe(0);
    });
  });
});
