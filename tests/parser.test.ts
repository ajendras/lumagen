import { describe, it, expect, vi } from 'vitest';
import { parseLLMOutput, analyzeWGSL, deriveTitleFromPrompt, type AnalysisResult } from '../src/scene/parser.js';

describe('scene/parser.ts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses complete LLM output with wgsl and json', () => {
    const completeOutput = `
\`\`\`wgsl
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
  hueShift: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.4, 0.8, 1.0, 1.0);
}
\`\`\`

\`\`\`json
{
  "title": "Test Scene",
  "uniforms": [
    {"name":"speed","type":"f32","default":1.2,"min":0.5,"max":4.0},
    {"name":"intensity","type":"f32","default":0.9,"min":0.2,"max":2.5}
  ],
  "jsLogic": "console.log('test');"
}
\`\`\`
    `;

    const scene = parseLLMOutput(completeOutput);
    expect(scene.title).toBe('Test Scene');
    expect(scene.uniforms).toHaveLength(2);
    expect(scene.uniforms[0].name).toBe('speed');
    expect(scene.uniforms[0].default).toBe(1.2);
    expect(scene.jsLogic).toBe("console.log('test');");
    expect(scene.wgsl).toContain('@vertex');
    expect(scene.wgsl).toContain('@fragment');
  });

  it('handles missing json block gracefully', () => {
    const noJson = `
\`\`\`wgsl
struct Uniforms { time: f32, speed: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(i: u32) -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
\`\`\`
    `;

    const scene = parseLLMOutput(noJson);
    expect(scene.title).toBe('Generative Scene');
    expect(scene.uniforms.length).toBeGreaterThan(0);
    expect(console.warn).toHaveBeenCalledWith('No JSON metadata block found in LLM output, using defaults');
  });

  it('handles malformed json gracefully', () => {
    const badJson = `
\`\`\`wgsl
@vertex fn vs(i: u32) -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
\`\`\`

\`\`\`json
{,
  "title": "Bad"
}
\`\`\`
    `;

    const scene = parseLLMOutput(badJson);
    expect(scene.title).toBe('Generative Scene');
    expect(console.error).toHaveBeenCalledWith(
      'Failed to parse JSON metadata block, using defaults',
      expect.stringContaining('Expected property name or')
    );
  });

  it('derives meaningful titles from prompts', () => {
    expect(deriveTitleFromPrompt('gentle underwater kelp forest')).toBe('Kelp Forest');
    expect(deriveTitleFromPrompt('ethereal neon garden at twilight')).toBe('Neon Garden');
    expect(deriveTitleFromPrompt('cosmic stellar particles')).toBe('Stellar Particles');
    expect(deriveTitleFromPrompt('recursive fractal bloom')).toBe('Fractal Bloom');
    expect(deriveTitleFromPrompt('molten magma flow')).toBe('Magma Flow');
    expect(deriveTitleFromPrompt('unknown prompt')).toBe('Generative Scene');
  });

  describe('analyzeWGSL', () => {
    it('returns valid for a correct full-screen triangle shader', () => {
      const valid = `
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.0, 0.0, 0.0, 1.0);
}
      `;

      const result: AnalysisResult = analyzeWGSL(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('catches missing entry points', () => {
      const invalid = `
struct Uniforms { time: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;

fn computeSomething() -> f32 { return 1.0; }
      `;

      const result: AnalysisResult = analyzeWGSL(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.some(e => e.includes('vertex'))).toBe(true);
      expect(result.errors.some(e => e.includes('fragment'))).toBe(true);
      expect(result.errors.some(e => e.includes('entry point'))).toBe(true);
    });

    it('catches use of main() entry point', () => {
      const invalid = `
@vertex fn vs(i: u32) -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
fn main() { }
      `;

      const result: AnalysisResult = analyzeWGSL(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('main()'))).toBe(true);
    });

    it('detects unbalanced braces', () => {
      const invalid = `
@vertex fn vs(i: u32) -> @builtin(position) vec4f { return vec4f(0.0);
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
      `;

      const result: AnalysisResult = analyzeWGSL(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Unbalanced braces'))).toBe(true);
    });

    it('runs static analysis and logs errors for bad shader', () => {
      const badShader = 'fn main() {}';
      const result = analyzeWGSL(badShader);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('too short or empty');
      expect(console.error).toHaveBeenCalledWith(
        '❌ WGSL Static Analysis Failed',
        expect.arrayContaining([expect.stringContaining('too short')])
      );
    });

    it('issues warnings for missing Uniforms struct and binding', () => {
      const minimal = `
@vertex fn vs(i: u32) -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
      `;

      const result: AnalysisResult = analyzeWGSL(minimal);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(1);
      expect(result.warnings.some(w => w.includes('struct Uniforms'))).toBe(true);
      expect(result.warnings.some(w => w.includes('uniform binding'))).toBe(true);
    });

    it('accepts shader with time uniform warning only', () => {
      const okButNoTime = `
struct Uniforms { speed: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(i: u32) -> @builtin(position) vec4f { return vec4f(0); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
      `;

      const result: AnalysisResult = analyzeWGSL(okButNoTime);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBe(0); // time is not strictly required by analyzer
    });
  });

  it('normalizes uniform values from JSON', () => {
    const output = `
\`\`\`wgsl
@vertex fn vs() {} @fragment fn fs() {}
\`\`\`
\`\`\`json
{"title":"Normalized","uniforms":[{"name":"intensity","default":"1.5","min":"0","max":3}]}
\`\`\`
    `;
    const scene = parseLLMOutput(output);
    const intensity = scene.uniforms.find(u => u.name === 'intensity');
    expect(intensity).toBeDefined();
    expect(intensity!.default).toBe(1.5);
    expect(intensity!.min).toBe(0);
    expect(intensity!.max).toBe(3);
  });
});
