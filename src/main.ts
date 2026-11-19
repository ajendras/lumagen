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
import { generateScene, remixPart } from './ai/client.js';
import { init as initContext } from './gpu/context.js';
import { 
  createPipeline, 
  writeUniforms, 
  updateUniformBuffer, 
  getCurrentPipeline, 
  getCurrentBindGroup 
} from './gpu/pipeline.js';
import type { Uniform, Scene } from './main.js';

// WebGPU state
let device: GPUDevice | null = null;
let context: GPUCanvasContext | null = null;
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

  const gpuDevice = await initContext(canvas);
  device = gpuDevice;
  context = canvas.getContext('webgpu') as GPUCanvasContext;
  return gpuDevice;
}

function render() {
  if (!device || !context) return;

  const elapsed = (performance.now() - startTime) * 0.001;
  writeUniforms(elapsed);

  const pipe = getCurrentPipeline();
  const group = getCurrentBindGroup();

  if (!pipe || !group) return;

  const encoder = device.createCommandEncoder();
  const view = context.getCurrentTexture().createView();

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view,
      clearValue: [0.98, 0.94, 0.96, 1.0],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    }],
  });

  pass.setPipeline(pipe);
  pass.setBindGroup(0, group);
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
      .then(async () => {
        console.log('%c🌈 WebGPU ready — Lumagen editor started', 'color:#67e8f9;font-family:monospace');
        
        // Load a rich initial scene using real AI path (falls back gracefully)
        showLoadingState(true);
        const initialPrompt = 'gentle underwater kelp forest with swaying blades, soft volumetric caustics, and tiny glowing jellyfish';
        const scene = await generateScene(initialPrompt);
        currentScene = scene;
        showLoadingState(false);

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
        
        // Create real pipeline (uses context from gpu/context.ts)
        await createPipeline(scene.wgsl, scene.uniforms);

        // Wire UI handlers
        setUniformChangeHandler((name: string, value: number) => {
          uniformValues[name] = value;
          updateUniformBuffer(name, value);
          
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
          showLoadingState(true);
          try {
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
            await createPipeline(scene.wgsl, scene.uniforms);
            
            // Subtle animation nudge
            setTimeout(() => {
              if (uniformValues.intensity !== undefined) {
                uniformValues.intensity = Math.max(0.6, Math.min(2.8, uniformValues.intensity + (Math.random() - 0.5) * 0.6));
                updateSliderValue('intensity', uniformValues.intensity);
                updateUniformBuffer('intensity', uniformValues.intensity);
              }
            }, 180);
          } finally {
            showLoadingState(false);
          }
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
        });

        // Add "Remix this part" button dynamically next to generate button
        const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement | null;
        if (generateBtn && generateBtn.parentElement) {
          const remixBtn = document.createElement('button');
          remixBtn.id = 'remix-part-btn';
          remixBtn.textContent = '🎨 Remix this part';
          remixBtn.style.cssText = `
            background: linear-gradient(90deg, #f472b6, #c026d3);
            color: white; 
            border: none; 
            padding: 10px 18px; 
            border-radius: 9999px; 
            font-weight: 700; 
            font-size: 13px; 
            cursor: pointer; 
            margin-left: 12px;
            box-shadow: 0 4px 15px -3px rgb(244 114 182);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          `;
          remixBtn.onmouseover = () => { remixBtn.style.transform = 'translateY(-1px)'; };
          remixBtn.onmouseout = () => { remixBtn.style.transform = 'none'; };
          
          remixBtn.onclick = async () => {
            const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
            const instruction = promptInput?.value.trim();
            
            if (!instruction || !currentScene) {
              alert('Enter a targeted edit instruction in the prompt box (e.g. "make colors more cyan and add gentle waves") and generate a base scene first.');
              return;
            }
            
            showLoadingState(true, 'Remixing specific part with AI...');
            try {
              const updatedScene = await remixPart(currentScene, instruction);
              currentScene = updatedScene;

              const titleEl = document.getElementById('title-text');
              if (titleEl) {
                titleEl.textContent = (updatedScene.title || 'Remixed Scene') + ' ✨';
                setTimeout(() => {
                  if (titleEl && currentScene?.title) titleEl.textContent = currentScene.title;
                }, 2200);
              }

              await createPipeline(updatedScene.wgsl, updatedScene.uniforms);

              const controls = updatedScene.uniforms.map((u: Uniform) => ({
                name: u.name,
                value: u.default,
                min: u.min ?? 0,
                max: u.max ?? 10,
                step: 0.02,
              }));
              populateUniforms(controls, uniformValues);

              console.log('%c✨ Targeted remix applied successfully', 'color:#c026d3;font-weight:600');
            } catch (err: any) {
              console.error(err);
              alert('Remix failed: ' + err.message);
            } finally {
              showLoadingState(false);
            }
          };
          
          generateBtn.parentElement.appendChild(remixBtn);
        }

        // Seed initial controls (already done above with real scene)
        startTime = Date.now();
        lastFpsUpdate = Date.now();
        loop();

        // Keyboard support
        document.addEventListener('keydown', (ev) => {
          if (ev.key === '/' && document.activeElement?.tagName !== 'TEXTAREA') {
            ev.preventDefault();
            (document.getElementById('prompt-input') as HTMLTextAreaElement)?.focus();
          }
          if (ev.key.toLowerCase() === 'r' && currentScene) {
            const remixBtn = document.getElementById('remix-part-btn');
            if (remixBtn) remixBtn.click();
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
    updateUniformBuffer(k, uniformValues[k]);
  });
};
(window as any).randomRemix = () => {
  uniformValues.hueShift = Math.random() * 0.9 + 0.1;
  uniformValues.intensity = 0.7 + Math.random() * 1.6;
  updateSliderValue('hueShift', uniformValues.hueShift);
  updateSliderValue('intensity', uniformValues.intensity);
  updateUniformBuffer('hueShift', uniformValues.hueShift);
  updateUniformBuffer('intensity', uniformValues.intensity);
  
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
