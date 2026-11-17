/**
 * Lumagen main bootstrap
 * Initializes WebGPU, UI panels, render loop, LLM orchestration and export.
 * Fully runnable with mock AI responses and a beautiful procedural shader.
 */

import { 
  bindPromptHandler, 
  createUniformSlider, 
  populateUniforms, 
  populateMiniGallery, 
  populateFullGallery, 
  setUniformChangeHandler, 
  updateSliderValue,
  showLoadingState 
} from './ui/panel.js';

// Re-exported for cross-file consistency with planned architecture
export interface Uniform {
  name: string;
  type: string;
  default: number;
  min?: number;
  max?: number;
}

export interface Scene {
  wgsl: string;
  uniforms: Uniform[];
  jsLogic: string;
  title?: string;
}

// Mock AI generation (real version would call src/ai/client.ts which uses Ollama)
async function generateScene(prompt: string): Promise<Scene> {
  console.log('%c🪄 Sending to local LLM →', 'color:#f472b6;font-weight:500', prompt);
  
  const lower = prompt.toLowerCase();
  let title = 'Pastel Nebula';
  let baseHue = 260;
  
  if (lower.includes('kelp') || lower.includes('ocean') || lower.includes('underwater')) {
    title = 'Kelp Forest';
    baseHue = 158;
  } else if (lower.includes('particle') || lower.includes('star')) {
    title = 'Stellar Dust';
    baseHue = 275;
  } else if (lower.includes('fractal') || lower.includes('mandel')) {
    title = 'Fractal Bloom';
    baseHue = 320;
  } else if (lower.includes('lava') || lower.includes('fire')) {
    title = 'Magma Flow';
    baseHue = 12;
  }
  
  return {
    wgsl: '// WGSL shader synthesized by local LLM (see parser.ts in full version)',
    uniforms: [
      { name: 'speed', type: 'f32', default: 1.4, min: 0.3, max: 5.0 },
      { name: 'intensity', type: 'f32', default: 1.1, min: 0.4, max: 3.5 },
      { name: 'hueShift', type: 'f32', default: baseHue / 360, min: 0.0, max: 1.0 },
      { name: 'density', type: 'f32', default: 6.5, min: 2.0, max: 14.0 },
    ],
    jsLogic: '/* optional per-scene JS logic would be injected here */',
    title,
  };
}

// WebGPU state
let device: GPUDevice | null = null;
let context: GPUCanvasContext | null = null;
let pipeline: GPURenderPipeline | null = null;
let uniformBuffer: GPUBuffer | null = null;
let currentScene: Scene | null = null;
let rafId: number | null = null;
let startTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 60;

const uniformValues: Record<string, number> = {
  speed: 1.4,
  intensity: 1.1,
  hueShift: 0.65,
  density: 6.5,
};

async function initWebGPU(canvas: HTMLCanvasElement): Promise<GPUDevice> {
  if (!('gpu' in navigator)) {
    throw new Error('WebGPU is not supported. Please use Chrome 113+, Edge, or Opera.');
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No appropriate GPU adapter found.');

  device = await adapter.requestDevice({
    requiredLimits: { maxStorageBuffersInFragmentStage: 4 },
  });

  context = canvas.getContext('webgpu') as GPUCanvasContext;
  if (!context) throw new Error('WebGPU canvas context unavailable.');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device!,
    format,
    alphaMode: 'premultiplied',
  });

  await createDemoPipeline(format);
  return device!;
}

async function createDemoPipeline(format: GPUTextureFormat) {
  if (!device) return;

  const shaderCode = `
    struct Uniforms {
      time: f32,
      speed: f32,
      intensity: f32,
      hueShift: f32,
      density: f32,
    };

    @group(0) @binding(0) var<uniform> u: Uniforms;

    @vertex
    fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
      let verts = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f( 3.0, -1.0),
        vec2f(-1.0,  3.0)
      );
      return vec4f(verts[i], 0.0, 1.0);
    }

    fn hue2rgb(h: f32) -> vec3f {
      let r = abs(h * 6.0 - 3.0) - 1.0;
      let g = 2.0 - abs(h * 6.0 - 2.0);
      let b = 2.0 - abs(h * 6.0 - 4.0);
      return clamp(vec3f(r, g, b), vec3(0.0), vec3(1.0));
    }

    @fragment
    fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
      let uv = (pos.xy / vec2f(860.0, 620.0)) * 2.0 - 1.0;
      let aspect = 860.0 / 620.0;
      let st = vec2f(uv.x * aspect, uv.y);
      
      var c = vec3f(0.0);
      let t = u.time * u.speed;
      
      for (var i = 1.0; i <= 6.0; i += 1.0) {
        let p = st * (u.density / i) + vec2f(sin(t * 0.1), cos(t * 0.13));
        let l = length(p);
        let hue = fract(u.hueShift + l * 0.6 + t * 0.07);
        c += hue2rgb(hue) * (1.6 / (l * i * 1.8));
      }
      
      c = pow(c * u.intensity, vec3f(1.15));
      return vec4f(c, 1.0);
    }
  `;

  const module = device.createShaderModule({ code: shaderCode });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' as const },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });

  uniformBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  (window as any).__lumagenBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
}

function updateUniformBufferData() {
  if (!device || !uniformBuffer) return;

  const array = new Float32Array(8);
  array[0] = (Date.now() - startTime) * 0.001; // time
  array[1] = uniformValues.speed ?? 1.4;
  array[2] = uniformValues.intensity ?? 1.1;
  array[3] = uniformValues.hueShift ?? 0.65;
  array[4] = uniformValues.density ?? 6.5;

  device.queue.writeBuffer(uniformBuffer, 0, array);
}

function render() {
  if (!device || !context || !pipeline || !uniformBuffer) return;

  updateUniformBufferData();

  const encoder = device.createCommandEncoder();
  const view = context.getCurrentTexture().createView();

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view,
      clearValue: [0.06, 0.04, 0.12, 1],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    }],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, (window as any).__lumagenBindGroup);
  pass.draw(3);
  pass.end();

  device.queue.submit([encoder.finish()]);

  // FPS counter
  frameCount++;
  const now = Date.now();
  if (now - lastFpsUpdate > 650) {
    currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    frameCount = 0;
    lastFpsUpdate = now;

    const fpsEl = document.getElementById('fps');
    if (fpsEl) fpsEl.textContent = String(currentFps);
  }
}

function loop() {
  render();
  rafId = requestAnimationFrame(loop);
}

export function startEditor(): Promise<void> {
  return new Promise((resolve) => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) {
      console.error('Canvas not found');
      resolve();
      return;
    }

    initWebGPU(canvas)
      .then(() => {
        console.log('%c🌈 WebGPU ready — Lumagen editor started', 'color:#67e8f9;font-family:monospace');
        
        currentScene = {
          wgsl: '// initial demo shader',
          uniforms: [],
          jsLogic: '',
          title: 'Kelp Garden',
        };

        // Wire UI
        setUniformChangeHandler((name: string, value: number) => {
          uniformValues[name] = value;
          
          // Live visual feedback on title
          if (name === 'hueShift') {
            const titleContainer = document.getElementById('scene-title');
            if (titleContainer) {
              titleContainer.style.setProperty('--tw-text-opacity', '1');
              (titleContainer.style as any).color = `hsl(${value * 360}, 92%, 52%)`;
            }
          }
        });

        bindPromptHandler(async (prompt: string) => {
          const scene = await generateScene(prompt);
          currentScene = scene;

          const titleEl = document.getElementById('title-text');
          if (titleEl && scene.title) titleEl.textContent = scene.title;

          const controls = scene.uniforms.map((u: Uniform) => ({
            name: u.name,
            value: u.default,
            min: u.min ?? 0,
            max: u.max ?? 5,
            step: 0.02,
          }));

          populateUniforms(controls, uniformValues);
          
          // Simulate AI creativity with tiny random nudge
          setTimeout(() => {
            if (uniformValues.intensity !== undefined) {
              uniformValues.intensity = Math.max(0.6, Math.min(2.8, uniformValues.intensity + (Math.random() - 0.5) * 0.6));
              updateSliderValue('intensity', uniformValues.intensity);
            }
          }, 180);
        });

        populateMiniGallery((idx: number) => {
          const sampleTitles = ['Kelp Forest', 'Stellar Dust', 'Magma Flow', 'Fractal Bloom'];
          const samplePrompts = [
            'gentle underwater kelp forest',
            'floating cosmic particles',
            'flowing lava with heat distortion',
            'recursive pastel fractal'
          ];
          
          currentScene = { 
            ...currentScene!, 
            title: sampleTitles[idx] 
          };
          
          const titleEl = document.getElementById('title-text');
          if (titleEl) titleEl.textContent = sampleTitles[idx];
          
          populateUniforms([
            { name: 'speed', value: 1.4, min: 0.3, max: 5, step: 0.1 },
            { name: 'intensity', value: 1.2, min: 0.4, max: 3.5, step: 0.05 },
            { name: 'hueShift', value: 0.4 + idx * 0.15, min: 0, max: 1, step: 0.01 },
            { name: 'density', value: 6.5, min: 2, max: 14, step: 0.2 },
          ], uniformValues);
        });

        populateFullGallery((prompt: string, title: string) => {
          console.log(`Loading gallery template: ${title}`);
          hideGalleryModal();
          // Would call generateScene internally in full version
        });

        // Seed initial controls
        populateUniforms([
          { name: 'speed', value: 1.4, min: 0.3, max: 5.0, step: 0.1 },
          { name: 'intensity', value: 1.1, min: 0.4, max: 3.5, step: 0.05 },
          { name: 'hueShift', value: 0.65, min: 0.0, max: 1.0, step: 0.01 },
          { name: 'density', value: 6.5, min: 2.0, max: 14.0, step: 0.2 },
        ], uniformValues);

        startTime = Date.now();
        lastFpsUpdate = Date.now();
        loop();

        // Keyboard support
        document.addEventListener('keydown', (ev) => {
          if (ev.key === '/' && document.activeElement?.tagName !== 'TEXTAREA') {
            ev.preventDefault();
            (document.getElementById('prompt-input') as HTMLTextAreaElement)?.focus();
          }
        });

        resolve();
      })
      .catch((err) => {
        console.error(err);
        const canvasParent = canvas.parentElement;
        if (canvasParent) {
          const warning = document.createElement('div');
          warning.className = 'absolute inset-0 flex items-center justify-center bg-black/90 text-white text-center p-12 rounded-3xl';
          warning.innerHTML = `
            <div>
              <div class="text-6xl mb-4">🌊</div>
              <div class="text-xl font-medium mb-2">WebGPU not available</div>
              <div class="max-w-xs mx-auto text-sm opacity-70">This experience requires a modern browser with WebGPU enabled.</div>
            </div>`;
          canvasParent.appendChild(warning);
        }
        resolve();
      });
  });
}

export async function exportCurrentScene(): Promise<void> {
  if (!currentScene) {
    alert('Generate a scene first before exporting!');
    return;
  }

  const title = currentScene.title || 'Lumagen Scene';
  const htmlContent = await createExportHTML(currentScene, title);
  
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
  
  console.log(`%c✅ Exported ${title} — ${Math.round(htmlContent.length / 1024)} KB`, 'color:#67e8f9');
}

// Minimal self-contained HTML exporter (real version lives in src/exporter.ts + minifier)
async function createExportHTML(scene: Scene, title: string): Promise<string> {
  const minifiedDemo = `const c=document.getElementById("c");c.width=innerWidth;c.height=innerHeight;const g=c.getContext("webgpu");console.log("Lumagen exported scene ready — ${title}");`;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title} — made with Lumagen</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@500&amp;display=swap');
  body{margin:0;overflow:hidden;background:#0a0a1f;font-family:system-ui}
  canvas{display:block}
  .overlay{position:absolute;bottom:24px;left:24px;color:#fff9;background:rgba(15,23,42,0.6);padding:10px 22px;border-radius:9999px;font-size:13px;backdrop-filter:blur(8px);font-family:'Quicksand',sans-serif}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="overlay">🌸 ${title} • exported from Lumagen</div>
<script>
${minifiedDemo}
// Full inline WGSL + render loop would be here in production export (~70KB total)
<\/script>
</body>
</html>`;
}

// Global helpers for inline HTML onclick handlers
(window as any).exportCurrentScene = exportCurrentScene;
(window as any).resetUniforms = () => {
  Object.keys(uniformValues).forEach(k => {
    if (k === 'hueShift') uniformValues[k] = 0.6;
    else if (k === 'speed') uniformValues[k] = 1.4;
    else uniformValues[k] = 1.0;
    updateSliderValue(k, uniformValues[k]);
  });
};
(window as any).randomRemix = () => {
  uniformValues.hueShift = Math.random() * 0.9 + 0.1;
  uniformValues.intensity = 0.7 + Math.random() * 1.6;
  updateSliderValue('hueShift', uniformValues.hueShift);
  updateSliderValue('intensity', uniformValues.intensity);
  
  const t = document.getElementById('title-text');
  if (t) {
    t.textContent = 'Remixed ✨';
    setTimeout(() => {
      if (currentScene && currentScene.title) t.textContent = currentScene.title;
    }, 1600);
  }
};
(window as any).showGalleryModal = () => {
  const modal = document.getElementById('modal-backdrop') as HTMLElement;
  if (modal) modal.classList.remove('hidden', 'opacity-0');
  populateFullGallery(() => {});
};
(window as any).hideGalleryModal = () => {
  const modal = document.getElementById('modal-backdrop') as HTMLElement;
  if (modal) modal.classList.add('hidden');
};

// Auto-bootstrap
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    startEditor().catch(console.error);
  });
}
