/**
 * src/ai/client.ts
 * Ollama HTTP client that sends natural-language prompts and returns
 * a fully typed Scene object. Includes a carefully engineered system
 * prompt that produces valid WGSL + uniform metadata. Falls back
 * gracefully when Ollama is unavailable.
 */

import type { Uniform, Scene } from '../main.js';

const OLLAMA_BASE = 'http://localhost:11434';
const MODEL = 'llama3.2';

const SYSTEM_PROMPT = `You are Lumagen, a creative WebGPU shader artist.
Generate beautiful, self-contained, pastel-themed generative scenes.
Rules:
- Output a complete WGSL shader using a full-screen triangle (vertex_index).
- The shader must define: struct Uniforms { time: f32, speed: f32, intensity: f32, ... } with at least speed and intensity.
- Use organic motion, soft gradients, and gentle noise. Keep code under 110 lines.
- If the prompt mentions music, beat, reactive, audio, visualizer, microphone or sound, include uniforms audioLevel, audioBass, audioMid, audioTreble (all f32, default 0.0, min 0.0, max 2.0). Use them in the shader to pulse colors, scale features, add distortion or drive intensity.
- After the shader, output a JSON block with "uniforms" (array of {name, type:"f32", default, min, max}) and optional "jsLogic".
- Only respond with the two code blocks. No explanations.

Example output format:
\`\`\`wgsl
struct Uniforms { 
  time: f32, speed: f32, intensity: f32, hueShift: f32,
  audioLevel: f32, audioBass: f32, audioMid: f32, audioTreble: f32 
}
@group(0) @binding(0) var<uniform> u: Uniforms;
// ... full shader with vs() and fs() using audio uniforms for reactivity
\`\`\`

\`\`\`json
{
  "uniforms": [
    {"name":"speed","type":"f32","default":1.8,"min":0.4,"max":6.0},
    {"name":"intensity","type":"f32","default":1.2,"min":0.6,"max":3.5},
    {"name":"hueShift","type":"f32","default":0.65,"min":0.0,"max":1.0},
    {"name":"audioLevel","type":"f32","default":0.0,"min":0.0,"max":2.0},
    {"name":"audioBass","type":"f32","default":0.0,"min":0.0,"max":2.0},
    {"name":"audioMid","type":"f32","default":0.0,"min":0.0,"max":2.0},
    {"name":"audioTreble","type":"f32","default":0.0,"min":0.0,"max":2.0}
  ],
  "jsLogic": ""
}
\`\`\``;

async function queryOllama(prompt: string): Promise<string> {
  const response = await fetch(\`\${OLLAMA_BASE}/api/generate\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt: \`\${SYSTEM_PROMPT}\n\nUser description: \${prompt}\`,
      stream: false,
      temperature: 0.75,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    throw new Error(\`Ollama responded with status \${response.status}\`);
  }

  const data: { response: string } = await response.json();
  return data.response;
}

function extractSceneFromLLMOutput(raw: string): Scene {
  const wgslMatch = raw.match(/```wgsl\s*([\s\S]+?)```/i);
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/i);

  const wgsl = wgslMatch?.[1]?.trim() ?? '// Placeholder shader – LLM output was incomplete';

  let uniforms: Uniform[] = [
    { name: 'speed', type: 'f32', default: 1.4, min: 0.3, max: 5.0 },
    { name: 'intensity', type: 'f32', default: 1.1, min: 0.4, max: 3.5 },
    { name: 'hueShift', type: 'f32', default: 0.65, min: 0.0, max: 1.0 },
  ];

  let jsLogic = '';

  if (jsonMatch) {
    try {
      const jsonText = jsonMatch[1].trim();
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed.uniforms)) {
        uniforms = parsed.uniforms.map((u: any) => ({
          name: String(u.name).toLowerCase(),
          type: 'f32',
          default: Number(u.default ?? 1.0),
          min: Number(u.min ?? 0.0),
          max: Number(u.max ?? 10.0),
        }));
      }
      if (typeof parsed.jsLogic === 'string') jsLogic = parsed.jsLogic;
    } catch (parseErr) {
      console.warn('Failed to parse JSON from LLM, using defaults', parseErr);
    }
  }

  // Derive a friendly title from the prompt (fallback)
  const titleGuess = raw.toLowerCase().includes('kelp')
    ? 'Kelp Forest'
    : raw.toLowerCase().includes('particle')
    ? 'Stellar Particles'
    : raw.toLowerCase().includes('audio') || raw.toLowerCase().includes('music') || raw.toLowerCase().includes('beat')
    ? 'Audio Reactive Dream'
    : 'AI Dreamscape';

  return {
    wgsl,
    uniforms,
    jsLogic,
    title: titleGuess,
  };
}

export async function generateScene(description: string): Promise<Scene> {
  if (!description || description.trim().length < 3) {
    throw new Error('Please provide a meaningful scene description (min 3 characters).');
  }

  console.log(
    '%c🪄 Sending prompt to local Ollama (llama3.2)...',
    'color:#f472b6;font-weight:500',
    description
  );

  try {
    const llmText = await queryOllama(description);
    const scene = extractSceneFromLLMOutput(llmText);

    console.log(
      '%c✅ Scene generated – %d uniforms extracted',
      'color:#67e8f9',
      scene.uniforms.length,
      scene.uniforms.map((u) => u.name)
    );

    return scene;
  } catch (err: any) {
    console.warn('Ollama unavailable – using rich fallback scene', err.message);

    // Rich fallback that matches the visual style of the demo shader and includes audio reactivity
    return {
      wgsl: `// Fallback shader (Ollama not reachable) with audio reactivity
struct Uniforms {
  time: f32,
  speed: f32,
  intensity: f32,
  hueShift: f32,
  density: f32,
  audioLevel: f32,
  audioBass: f32,
  audioMid: f32,
  audioTreble: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let verts = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(verts[i], 0.0, 1.0);
}

fn hue2rgb(h: f32) -> vec3f {
  let r = abs(h*6.0-3.0)-1.0;
  let g = 2.0-abs(h*6.0-2.0);
  let b = 2.0-abs(h*6.0-4.0);
  return clamp(vec3f(r,g,b), vec3(0.0), vec3(1.0));
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / vec2f(860.0, 620.0) * 2.0 - 1.0;
  let st = vec2f(uv.x * 1.38, uv.y);
  var c = vec3f(0.0);
  let t = u.time * u.speed;
  let react = 1.0 + u.audioBass * 1.6 + u.audioLevel * 0.9;
  let distort = u.audioTreble * 0.07;
  for (var i = 1.0; i <= 7.0; i += 1.0) {
    let p = st * (u.density / i) + vec2f(sin(t*0.2), cos(t*0.17)) + vec2f(distort);
    let l = length(p);
    let hue = fract(u.hueShift + l*0.55 + t*0.09);
    c += hue2rgb(hue) * (1.8 / (l * i * 1.6)) * react;
  }
  c = pow(c * u.intensity, vec3f(1.2));
  return vec4f(c, 1.0);
}`,
      uniforms: [
        { name: 'speed', type: 'f32', default: 1.4, min: 0.3, max: 5.0 },
        { name: 'intensity', type: 'f32', default: 1.1, min: 0.4, max: 3.5 },
        { name: 'hueShift', type: 'f32', default: 0.65, min: 0.0, max: 1.0 },
        { name: 'density', type: 'f32', default: 6.5, min: 2.0, max: 14.0 },
        { name: 'audioLevel', type: 'f32', default: 0.0, min: 0.0, max: 2.0 },
        { name: 'audioBass', type: 'f32', default: 0.0, min: 0.0, max: 2.0 },
        { name: 'audioMid', type: 'f32', default: 0.0, min: 0.0, max: 2.0 },
        { name: 'audioTreble', type: 'f32', default: 0.0, min: 0.0, max: 2.0 },
      ],
      jsLogic: '// Fallback – audio reactivity is driven by WebAudio FFT',
      title: description.includes('kelp') ? 'Kelp Forest' : 'Audio Reactive Nebula',
    };
  }
}
