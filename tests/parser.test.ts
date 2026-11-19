import { describe, it, expect } from 'vitest';
import { parseLLMOutput, validateWGSL, remixScene } from '../src/scene/parser.js';
import type { Scene, Uniform } from '../src/main.js';

describe('Scene Parser', () => {
  it('parses valid LLM output with wgsl and json blocks', () => {
    const sampleOutput = `\`\`\`wgsl
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
  hueShift: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(verts[i],0,1);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(0.9,0.7,1.0,1.0);
}
\`\`\`

\`\`\`json
{
  "uniforms": [
    {"name":"speed","type":"f32","default":1.8,"min":0.5,"max":4.0},
    {"name":"intensity","type":"f32","default":1.2,"min":0.8,"max":2.5},
    {"name":"hueShift","type":"f32","default":0.6,"min":0.0,"max":1.0}
  ],
  "jsLogic": "console.log('reactive logic loaded');"
}
\`\`\``;

    const scene = parseLLMOutput(sampleOutput);
    expect(scene.wgsl).toContain('@vertex');
    expect(scene.wgsl).toContain('@fragment');
    expect(scene.uniforms).toHaveLength(3);
    expect(scene.uniforms[0].name).toBe('speed');
    expect(scene.uniforms[0].default).toBe(1.8);
    expect(scene.jsLogic).toContain('reactive logic');
    expect(scene.title).toBe('AI Dreamscape'); // default when no keywords match
  });

  it('falls back gracefully on malformed LLM output', () => {
    const badOutput = 'just some random text without code blocks';
    const scene = parseLLMOutput(badOutput);
    expect(scene.wgsl).toContain('// Placeholder shader');
    expect(scene.uniforms.length).toBeGreaterThan(2);
    expect(scene.title).toBe('AI Dreamscape');
  });

  it('derives friendly titles from prompt keywords', () => {
    expect(parseLLMOutput('kelp forest with swaying blades').title).toBe('Kelp Forest');
    expect(parseLLMOutput('cosmic dust field with twinkling pastel stars').title).toBe('Stellar Particles');
    expect(parseLLMOutput('recursive pastel fractal flower').title).toBe('Fractal Bloom');
    expect(parseLLMOutput('molten lava river with heat distortion').title).toBe('Magma Flow');
    expect(parseLLMOutput('audio reactive visualizer with microphone').title).toBe('Audio Reactive Dream');
  });

  it('validates WGSL for required structures', () => {
    const valid = `
      struct Uniforms { time: f32 }
      @group(0) @binding(0) var<uniform> u: Uniforms;
      @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0); }
      @fragment fn fs() -> @location(0) vec4f { return vec4f(1); }
    `;
    expect(validateWGSL(valid)).toBe(true);

    expect(validateWGSL('missing vertex and fragment')).toBe(false);
    expect(validateWGSL('only vertex')).toBe(false);
  });

  it('remixScene merges partial updates while preserving original fields', () => {
    const original: Scene = {
      wgsl: 'original full shader code here...',
      uniforms: [
        { name: 'speed', type: 'f32', default: 1.4, min: 0.3, max: 5.0 },
        { name: 'hueShift', type: 'f32', default: 0.65, min: 0.0, max: 1.0 },
      ],
      jsLogic: 'original js logic',
      title: 'Kelp Forest',
    };

    const partialUpdate = {
      wgsl: 'updated shader with new motion logic only',
      // uniforms and title intentionally omitted
    };

    const remixed = remixScene(original, partialUpdate);

    expect(remixed.wgsl).toBe('updated shader with new motion logic only');
    expect(remixed.uniforms).toEqual(original.uniforms); // preserved
    expect(remixed.jsLogic).toBe('original js logic');
    expect(remixed.title).toBe('Kelp Forest');
  });

  it('remixScene can override title when supplied', () => {
    const base: Scene = { wgsl: '// base', uniforms: [], jsLogic: '', title: 'Original' };
    const remixed = remixScene(base, { title: 'New Title After Remix' });
    expect(remixed.title).toBe('New Title After Remix');
  });
});
