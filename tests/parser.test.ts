import { describe, it, expect } from 'vitest';
import { parseLLMOutput, remixScene, deriveTitleFromPrompt } from '../src/scene/parser.js';
import type { Scene, Uniform } from '../src/main.js';

describe('Scene Parser', () => {
  it('parses valid LLM output with wgsl and json blocks', () => {
    const mockLLM = `\`\`\`wgsl
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
  hueShift: f32
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(verts[i],0,1);
}
@fragment fn fs() -> @location(0) vec4f { return vec4f(0.2,0.6,0.9,1.0); }
\`\`\`

\`\`\`json
{
  "title": "AI Dreamscape",
  "uniforms": [
    {"name":"speed","type":"f32","default":1.8,"min":0.4,"max":6.0},
    {"name":"intensity","type":"f32","default":1.2,"min":0.6,"max":3.5},
    {"name":"hueShift","type":"f32","default":0.65,"min":0.0,"max":1.0}
  ],
  "jsLogic": "reactive logic"
}
\`\`\``;

    const scene = parseLLMOutput(mockLLM);
    expect(scene.wgsl).toContain('struct Uniforms');
    expect(scene.uniforms[0].default).toBe(1.8);
    expect(scene.jsLogic).toContain('reactive logic');
    expect(scene.title).toBe('AI Dreamscape'); // now correctly taken from JSON (was overridden by deriveTitleFromPrompt seeing "audio" uniforms)
  });

  it('falls back gracefully on malformed LLM output', () => {
    const malformed = 'this is not valid markdown with blocks';
    const scene = parseLLMOutput(malformed);
    expect(scene.wgsl).toContain('// No WGSL shader was extracted');
    expect(scene.title).toBe('AI Dreamscape');
    expect(scene.uniforms.length).toBeGreaterThan(0);
  });

  it('derives friendly titles from prompt keywords', () => {
    expect(deriveTitleFromPrompt('gentle underwater kelp forest with swaying blades')).toBe('Kelp Forest');
    expect(deriveTitleFromPrompt('ethereal glowing neon garden at twilight')).toBe('Neon Garden');
    expect(deriveTitleFromPrompt('audio reactive beat visualizer with pulsing bars')).toBe('Audio Reactive Dream');
    expect(deriveTitleFromPrompt('abstract pastel waves and gentle noise')).toBe('AI Dreamscape');
    expect(deriveTitleFromPrompt('recursive fractal bloom')).toBe('Fractal Bloom');
  });

  it('extracts uniforms with correct types and ranges', () => {
    const mock = `\`\`\`json
{"title":"Test","uniforms":[{"name":"speed","type":"f32","default":2.5,"min":0.1,"max":10}]}
\`\`\``;
    const scene = parseLLMOutput(mock);
    expect(scene.uniforms[0]).toEqual({
      name: 'speed',
      type: 'f32',
      default: 2.5,
      min: 0.1,
      max: 10,
    });
  });

  it('validates WGSL structure', () => {
    const bad = 'no vertex or fragment';
    const scene = parseLLMOutput(`\`\`\`wgsl\n${bad}\n\`\`\``);
    // validation warning is expected and logged
    expect(scene.wgsl).toContain('no vertex');
  });

  it('remixScene can override title when supplied', () => {
    const base: Scene = { 
      wgsl: '// base', 
      uniforms: [] as Uniform[], 
      jsLogic: '', 
      title: 'Original' 
    };
    const remixed = remixScene(base, { title: 'New Title After Remix' });
    expect(remixed.title).toBe('New Title After Remix');
    expect(remixed.wgsl).toBe('// base');
  });
});
