import { describe, it, expect } from 'vitest';
import { parseLLMOutput, analyzeWGSL, deriveTitleFromPrompt, validateWGSL } from '../src/scene/parser.ts';

describe('scene/parser.ts', () => {
  describe('deriveTitleFromPrompt', () => {
    it('derives title for kelp prompt', () => {
      expect(deriveTitleFromPrompt('gentle underwater kelp forest')).toBe('Kelp Forest');
    });

    it('derives title for neon garden', () => {
      expect(deriveTitleFromPrompt('ethereal glowing neon garden')).toBe('Neon Garden');
    });

    it('derives title for magma', () => {
      expect(deriveTitleFromPrompt('molten lava river with heat distortion')).toBe('Magma Flow');
    });

    it('falls back to generic title', () => {
      expect(deriveTitleFromPrompt('random description with no keywords')).toBe('Generative Scene');
    });
  });

  describe('analyzeWGSL', () => {
    it('accepts a valid minimal WGSL shader', () => {
      const validWGSL = `
struct Uniforms {
  time: f32,
  speed: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.9, 0.6, 0.8, 1.0);
}
      `.trim();

      const result = analyzeWGSL(validWGSL);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('catches missing entry points', () => {
      const invalid = `struct Uniforms { time: f32 }`;
      const result = analyzeWGSL(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.some(e => e.includes('vertex'))).toBe(true);
      expect(result.errors.some(e => e.includes('fragment'))).toBe(true);
    });

    it('catches missing uniform binding', () => {
      const noBinding = `
struct Uniforms { time: f32 }
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
      `;
      const result = analyzeWGSL(noBinding);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('uniform'))).toBe(true);
    });

    it('detects unbalanced braces', () => {
      const unbalanced = `
struct Uniforms { time: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(0.0, 0.0, 0.0, 1.0);
`;
      const result = analyzeWGSL(unbalanced);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('braces'))).toBe(true);
    });

    it('warns about missing time uniform', () => {
      const noTime = `
struct Uniforms { speed: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(verts[i],0.0,1.0);
}
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
      `;
      const result = analyzeWGSL(noTime);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('time'))).toBe(true);
    });

    it('warns when full-screen triangle pattern is missing', () => {
      const noIndex = `
struct Uniforms { time: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs() -> @builtin(position) vec4f { return vec4f(0.0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
      `;
      const result = analyzeWGSL(noIndex);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('vertex_index'))).toBe(true);
    });
  });

  describe('validateWGSL', () => {
    it('returns true for valid shader', () => {
      const valid = `struct Uniforms{time:f32} @group(0)@binding(0)var<uniform>u:Uniforms;@vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position)vec4f{let a=array<vec2f,3>(vec2(-1,-1),vec2(3,-1),vec2(-1,3));return vec4f(a[i],0,1);} @fragment fn fs()->@location(0)vec4f{return vec4(0.2,0.6,0.9,1);}`;
      expect(validateWGSL(valid)).toBe(true);
    });

    it('returns false for invalid shader', () => {
      const invalid = `fn main() { }`;
      expect(validateWGSL(invalid)).toBe(false);
    });
  });

  describe('parseLLMOutput', () => {
    it('parses complete LLM output with wgsl and json', () => {
      const sample = `\`\`\`wgsl
struct Uniforms {
  time: f32,
  intensity: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(verts[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.3, 0.6, 0.9, 1.0);
}
\`\`\`

\`\`\`json
{"title": "Test Scene", "uniforms": [{"name": "intensity", "type": "f32", "default": 1.2, "min": 0.5, "max": 3.0}]}
\`\`\``;

      const scene = parseLLMOutput(sample);
      expect(scene.title).toBe('Test Scene');
      expect(scene.uniforms.length).toBeGreaterThan(1);
      expect(scene.wgsl).toContain('@vertex');
      expect(scene.wgsl).toContain('fn fs');
    });

    it('handles missing json block gracefully', () => {
      const sample = '```wgsl\nstruct Uniforms { time: f32 }\n@group(0)@binding(0)var<uniform>u:Uniforms;\n@vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position)vec4f{return vec4f(0);} \n@fragment fn fs()->@location(0)vec4f{return vec4f(1);}\n```';
      const scene = parseLLMOutput(sample);
      expect(scene.title).toBe('Generative Scene');
      expect(scene.uniforms.length).toBeGreaterThan(0);
    });

    it('runs static analysis and logs errors for bad shader', () => {
      const badSample = '```wgsl\nfn main() {}\n```';
      // parseLLMOutput will log error but still produce a Scene object
      const scene = parseLLMOutput(badSample);
      expect(scene).toHaveProperty('wgsl');
      expect(scene.wgsl).toContain('main');
    });

    it('throws on completely invalid input', () => {
      expect(() => parseLLMOutput('')).toThrow();
    });
  });
});
