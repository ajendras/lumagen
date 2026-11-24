import { describe, it, expect } from 'vitest';
import {
  parseLLMOutput,
  analyzeWGSL,
  deriveTitleFromPrompt,
  parseExportedHTML,
  remixScene,
} from '../src/scene/parser.js';

const MINIMAL_VALID_WGSL = `struct Uniforms {
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
  return vec4f(0.6, 0.8, 1.0, 1.0) * u.intensity;
}`;

const VALID_JSON_META = `{
  "title": "Test Scene",
  "uniforms": [
    {"name":"speed","type":"f32","default":1.2,"min":0.3,"max":4.0},
    {"name":"intensity","type":"f32","default":1.5,"min":0.5,"max":3.0}
  ],
  "jsLogic": "console.log('test scene running');",
  "hasCompute": false
}`;

describe('scene/parser.ts', () => {
  describe('parseLLMOutput', () => {
    it('extracts wgsl, uniforms, title and jsLogic from LLM output', () => {
      const output = `\`\`\`wgsl
${MINIMAL_VALID_WGSL}
\`\`\`

\`\`\`json
${VALID_JSON_META}
\`\`\``;

      const scene = parseLLMOutput(output);

      expect(scene.wgsl).toContain('struct Uniforms');
      expect(scene.wgsl).toContain('@vertex');
      expect(scene.wgsl).toContain('@fragment');
      expect(scene.title).toBe('Test Scene');
      expect(scene.uniforms).toHaveLength(2);
      expect(scene.uniforms[0].name).toBe('speed');
      expect(scene.uniforms[0].default).toBe(1.2);
      expect(scene.jsLogic).toBe("console.log('test scene running');");
      expect(scene.hasCompute).toBe(false);
    });

    it('handles output with no fenced json by using loose match', () => {
      const output = `\`\`\`wgsl
${MINIMAL_VALID_WGSL}
\`\`\`

{
  "title": "Loose Scene",
  "uniforms": [{"name":"hue","type":"f32","default":0.5,"min":0,"max":1}]
}`;

      const scene = parseLLMOutput(output);

      expect(scene.title).toBe('Loose Scene');
      expect(scene.uniforms).toHaveLength(1);
      expect(scene.uniforms[0].name).toBe('hue');
    });

    it('falls back gracefully when JSON is missing some fields', () => {
      const output = `\`\`\`wgsl
${MINIMAL_VALID_WGSL}
\`\`\`

\`\`\`json
{
  "title": "Minimal Scene"
}
\`\`\``;

      const scene = parseLLMOutput(output);

      expect(scene.title).toBe('Minimal Scene');
      expect(scene.uniforms.length).toBeGreaterThan(0); // defaults injected
      expect(scene.jsLogic).toBe('');
      expect(scene.hasCompute).toBe(false);
    });

    it('derives title when none is provided in JSON', () => {
      const output = `\`\`\`wgsl
${MINIMAL_VALID_WGSL}
\`\`\`

\`\`\`json
{"uniforms": []}
\`\`\``;

      const scene = parseLLMOutput(output);
      expect(scene.title.length).toBeGreaterThan(0);
      // deriveTitleFromPrompt should produce something sensible
      expect(typeof scene.title).toBe('string');
    });
  });

  describe('analyzeWGSL', () => {
    it('reports missing entry points and bindings', () => {
      const badShader = `fn main() { }`;
      const result = analyzeWGSL(badShader);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
      expect(result.errors.some(e => e.includes('vertex'))).toBe(true);
      expect(result.errors.some(e => e.includes('fragment'))).toBe(true);
    });

    it('accepts a minimal valid full-screen triangle shader', () => {
      const result = analyzeWGSL(MINIMAL_VALID_WGSL);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings.length).toBe(0); // no warnings on good shader
    });

    it('warns about missing time uniform', () => {
      const noTime = MINIMAL_VALID_WGSL.replace('time: f32,', '');
      const result = analyzeWGSL(noTime);
      expect(result.warnings.some(w => w.includes('time'))).toBe(true);
    });
  });

  describe('deriveTitleFromPrompt', () => {
    it('returns themed titles for known keywords', () => {
      expect(deriveTitleFromPrompt('gentle underwater kelp forest')).toBe('Kelp Forest');
      expect(deriveTitleFromPrompt('ethereal glowing neon garden')).toBe('Neon Garden');
    });

    it('falls back to capitalized words', () => {
      const title = deriveTitleFromPrompt('a beautiful purple vortex');
      expect(title).toBe('A Beautiful Purple');
    });
  });

  describe('parseExportedHTML', () => {
    it('extracts scene from embedded lumagen-meta JSON', () => {
      const html = `<!DOCTYPE html>
<html><body>
<script id="lumagen-meta" type="application/json">
{
  "title": "Community Test",
  "wgsl": "struct Uniforms { time: f32 } @vertex fn vs(){}",
  "uniforms": [{"name":"speed","default":1.0}],
  "jsLogic": "// test"
}
</script>
</body></html>`;

      const scene = parseExportedHTML(html);
      expect(scene.title).toBe('Community Test');
      expect(scene.wgsl).toContain('struct Uniforms');
      expect(scene.uniforms).toHaveLength(1);
    });

    it('falls back to regex when meta block is missing', () => {
      const html = `<canvas></canvas><script>/* wgsl: \`struct Uniforms{time:f32}\` */</script>`;
      const scene = parseExportedHTML(html);
      expect(scene.title).toBe('Imported Scene');
      expect(scene.wgsl).toContain('struct Uniforms');
    });
  });

  describe('remixScene', () => {
    it('merges updates while preserving original data', () => {
      const original: Scene = {
        wgsl: 'original shader',
        uniforms: [{ name: 'speed', type: 'f32', default: 1, min: 0, max: 10 }],
        title: 'Original',
        jsLogic: 'old logic',
        hasCompute: false,
      };

      const updated = remixScene(original, {
        wgsl: 'new shader',
        title: 'Remixed Title',
      });

      expect(updated.wgsl).toBe('new shader');
      expect(updated.title).toBe('Remixed Title');
      expect(updated.uniforms).toEqual(original.uniforms);
      expect(updated.jsLogic).toBe('old logic');
    });
  });
});
