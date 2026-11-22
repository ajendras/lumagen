/**
 * src/exporter.ts
 * Produces a single-file, dependency-free HTML (~45-75 KB) containing:
 *   • The AI-generated WGSL shader
 *   • A complete WebGPU render loop with dynamic uniform buffer
 *   • Pastel-themed minimal UI (title, FPS, pause, randomize)
 *   • Responsive canvas with DPR handling
 *   • WebAudio reactive mode (mic + track support with FFT analysis)
 * All JS is minified before embedding. The resulting file runs instantly
 * when opened in any WebGPU-capable browser.
 * 
 * Now embeds a JSON metadata block (lumagen-meta) so the community gallery
 * can parse uploaded HTMLs and extract title, wgsl, uniforms for instant remixing.
 */

import type { Scene, Uniform } from './main.js';
import { minifyJS } from './utils/minifier.js';

const EXPORT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{{TITLE}} — made with Lumagen</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600&amp;family=Nunito:wght@400;500;600&amp;display=swap');
  :root { --primary: #f472b6; --secondary: #67e8f9; }
  body {
    margin: 0; overflow: hidden; background: #fff1f2; font-family: 'Nunito', system-ui, sans-serif;
    touch-action: none;
  }
  canvas { display: block; width: 100vw; height: 100vh; }
  .overlay {
    position: absolute; top: 24px; left: 24px; background: rgba(255,247,237,0.92);
    backdrop-filter: blur(16px); padding: 14px 22px; border-radius: 24px; box-shadow: 0 10px 30px -10px rgb(244 114 182);
    border: 2px solid #fdf4f8; color: #831843; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 12px;
    user-select: none; pointer-events: none;
  }
  .controls {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(255,247,237,0.92); backdrop-filter: blur(16px); padding: 10px 18px;
    border-radius: 9999px; box-shadow: 0 10px 25px -5px rgb(103 232 249 / 0.3);
    border: 2px solid #fdf4f8; display: flex; gap: 12px; align-items: center; font-size: 13px;
  }
  button {
    background: white; border: 2px solid #f9d0e1; color: #db2777; padding: 6px 16px; border-radius: 9999px;
    font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  button:hover { transform: scale(1.08); background: #fdf4f8; }
  button.active { background:#67e8f9; color:white; border-color:#67e8f9; }
  .fps {
    font-family: monospace; font-size: 13px; background: #fff; padding: 2px 9px; border-radius: 9999px;
    border: 1px solid #f9d0e1; color: #67e8f9; font-weight: 700;
  }
  .info {
    position: absolute; bottom: 24px; right: 24px; font-size: 10px; font-family: monospace;
    color: #f9a8d4; background: rgba(255,255,255,0.7); padding: 4px 10px; border-radius: 9999px;
  }
</style>
</head>
<body>
<canvas id="c"></canvas>

<div class="overlay">
  <span style="font-size:28px">🌸</span>
  <span id="title">{{TITLE}}</span>
</div>

<div class="controls">
  <button id="pause">⏸︎ PAUSE</button>
  <button id="random">♻︎ REMIX</button>
  <button id="mic">🎤 MIC</button>
  <button id="track">🎵 TRACK</button>
  <div class="fps">FPS <span id="fps-val">60</span></div>
</div>

<div class="info">exported from lumagen • {{SIZE}}kb • reactive</div>

<script id="lumagen-meta" type="application/json">
{{META}}
</script>

<script>
{{MINIFIED_JS}}
</script>
</body>
</html>`;

function buildRuntimeJS(scene: Scene, title: string): string {
  const uniformDefaults: Record<string, number> = {};
  scene.uniforms.forEach((u) => {
    uniformDefaults[u.name] = u.default;
  });

  // The runtime is completely self-contained and mirrors the production pipeline.
  // WebAudio reactive mode feeds FFT data into audio* uniforms when enabled.
  return `(() => {
  const canvas = document.getElementById('c');
  const titleEl = document.getElementById('title');
  const fpsEl = document.getElementById('fps-val');
  const pauseBtn = document.getElementById('pause');
  const remixBtn = document.getElementById('random');
  const micBtn = document.getElementById('mic');
  const trackBtn = document.getElementById('track');

  let device, context, pipeline, uniformBuffer, bindGroup;
  let raf = null;
  let isPaused = false;
  let startTime = performance.now();
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 60;

  const uniforms = ${JSON.stringify(uniformDefaults)};
  const wgsl = ${JSON.stringify(scene.wgsl)};

  let audioContext = null;
  let analyser = null;
  let frequencyData = new Uint8Array(128);
  let audioElement = null;
  let isAudioEnabled = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    if (context) {
      context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'premultiplied',
      });
    }
  }

  async function initWebGPU() {
    if (!navigator.gpu) {
      canvas.style.background = '#1e2937';
      const err = document.createElement('div');
      err.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:white;font-family:monospace;background:rgba(15,23,42,0.9);';
      err.innerHTML = '<div style="text-align:center"><div style="font-size:72px;margin-bottom:16px">🌊</div><div>WebGPU not supported in this browser</div></div>';
      document.body.appendChild(err);
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    device = await adapter.requestDevice({ label: 'Lumagen Exported Scene' });

    context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });

    const shaderModule = device.createShaderModule({
      label: 'Lumagen exported shader',
      code: wgsl
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      }]
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{ format }]
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' }
    });

    uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    console.log('%c🌟 Lumagen standalone scene ready — ' + ${JSON.stringify(title)}, 'color:#67e8f9;font-family:monospace');
    return true;
  }

  function updateAudioData() {
    if (!isAudioEnabled || !analyser) return;
    analyser.getByteFrequencyData(frequencyData);
    let bass = 0, mid = 0, treble = 0, total = 0;
    for (let i = 0; i < 32; i++) { bass += frequencyData[i]; total += frequencyData[i]; }
    for (let i = 32; i < 64; i++) { mid += frequencyData[i]; total += frequencyData[i]; }
    for (let i = 64; i < 128; i++) { treble += frequencyData[i]; total += frequencyData[i]; }
    const len = frequencyData.length || 1;
    const audioBassVal = Math.min(2.0, (bass / (32 * 255)) * 2.2);
    const audioMidVal = Math.min(2.0, (mid / (32 * 255)) * 2.0);
    const audioTrebleVal = Math.min(2.0, (treble / (64 * 255)) * 2.4);
    const audioLevelVal = Math.min(2.0, (total / (len * 255)) * 2.8);
    if ('audioBass' in uniforms) uniforms.audioBass = audioBassVal;
    if ('audioMid' in uniforms) uniforms.audioMid = audioMidVal;
    if ('audioTreble' in uniforms) uniforms.audioTreble = audioTrebleVal;
    if ('audioLevel' in uniforms) uniforms.audioLevel = audioLevelVal;
  }

  function writeUniforms(time) {
    if (!uniformBuffer) return;
    updateAudioData();
    const data = new Float32Array(16);
    data[0] = time;
    let idx = 1;
    for (const key of Object.keys(uniforms)) {
      if (key !== 'time') {
        data[idx++] = uniforms[key] ?? 0.0;
      }
    }
    device.queue.writeBuffer(uniformBuffer, 0, data);
  }

  function render() {
    if (!device || !context || !pipeline || isPaused) return;

    const elapsed = (performance.now() - startTime) * 0.001;
    writeUniforms(elapsed);

    const encoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: [0.98, 0.94, 0.96, 1.0],
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);

    // FPS
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 800) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      frameCount = 0;
      lastFpsTime = now;
      if (fpsEl) fpsEl.textContent = currentFps;
    }
  }

  function loop() {
    render();
    raf = requestAnimationFrame(loop);
  }

  function togglePause() {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? '▶ PLAY' : '⏸︎ PAUSE';
  }

  function randomize() {
    if (uniforms.speed !== undefined) uniforms.speed = 0.6 + Math.random() * 2.8;
    if (uniforms.intensity !== undefined) uniforms.intensity = 0.7 + Math.random() * 2.1;
    if (uniforms.hueShift !== undefined) uniforms.hueShift = Math.random();
    if (uniforms.density !== undefined) uniforms.density = 4 + Math.random() * 9;
    if (uniforms.audioLevel !== undefined) uniforms.audioLevel = Math.random();
    startTime = performance.now();
    titleEl.style.transition = 'all .4s cubic-out';
    titleEl.style.transform = 'scale(1.15)';
    setTimeout(() => { titleEl.style.transform = 'scale(1)'; }, 420);
  }

  async function enableMic() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        isAudioEnabled = true;
        micBtn.classList.add('active');
        micBtn.textContent = '🎤 LIVE';
        console.log('%c🎤 Microphone reactivity enabled (FFT running)', 'color:#67e8f9');
      } catch (e) {
        console.error('Microphone access denied', e);
        alert('Microphone access denied. Check permissions.');
      }
    } else {
      isAudioEnabled = !isAudioEnabled;
      micBtn.classList.toggle('active', isAudioEnabled);
      micBtn.textContent = isAudioEnabled ? '🎤 LIVE' : '🎤 MIC';
    }
  }

  function loadTrack() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
      }
      if (audioElement) {
        audioElement.pause();
        audioElement = null;
      }
      const url = URL.createObjectURL(file);
      audioElement = new Audio(url);
      const source = audioContext.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      audioElement.play().catch(console.error);
      isAudioEnabled = true;
      trackBtn.classList.add('active');
      trackBtn.textContent = '♫ ' + file.name.substring(0, 12);
      console.log('%c🎵 Audio track loaded and playing with FFT reactivity', 'color:#67e8f9');
    };
    input.click();
  }

  window.addEventListener('resize', resize);

  pauseBtn.addEventListener('click', togglePause);
  remixBtn.addEventListener('click', randomize);
  micBtn.addEventListener('click', enableMic);
  trackBtn.addEventListener('click', loadTrack);

  // Keyboard support
  document.addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    if (e.key.toLowerCase() === 'r') randomize();
    if (e.key.toLowerCase() === 'm') enableMic();
  });

  initWebGPU().then(success => {
    if (!success) return;
    resize();
    startTime = performance.now();
    lastFpsTime = performance.now();
    loop();
  });
})();
`;
}

/**
 * Returns a complete standalone HTML file ready for distribution.
 * The shader, uniforms and render loop are fully inlined. WebAudio
 * reactivity (mic + track) is included when audio uniforms are present.
 * A lumagen-meta JSON block is embedded for community gallery parsing.
 */
export async function exportToHTML(scene: Scene, title: string = 'Lumagen Scene'): Promise<string> {
  if (!scene || !scene.wgsl) {
    throw new Error('exportToHTML requires a valid Scene with wgsl property');
  }

  const safeTitle = title.replace(/[<>&"']/g, '').trim() || 'Lumagen Scene';
  let runtime = buildRuntimeJS(scene, safeTitle);

  // Use the dedicated minifier (falls back gracefully if unavailable)
  try {
    runtime = minifyJS(runtime);
  } catch (err) {
    console.warn('Minifier unavailable, using unminified JS', err);
    // simple whitespace collapse as fallback
    runtime = runtime.replace(/\s+/g, ' ').trim();
  }

  const meta = JSON.stringify({
    title: safeTitle,
    wgsl: scene.wgsl,
    uniforms: scene.uniforms,
    jsLogic: scene.jsLogic || '// Community remix ready'
  }, null, 2);

  let html = EXPORT_TEMPLATE
    .replace(/\{\{TITLE\}\}/g, safeTitle)
    .replace('{{META}}', meta)
    .replace('{{MINIFIED_JS}}', runtime);

  // Final size annotation
  const sizeKB = Math.round(html.length / 1024);
  html = html.replace('{{SIZE}}', String(sizeKB));

  console.log(
    '%c📦 Exported standalone HTML — %d KB — %s (with WebAudio reactivity + community metadata)',
    'color:#67e8f9;font-weight:600',
    sizeKB,
    safeTitle
  );

  return html;
}
