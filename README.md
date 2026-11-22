<!-- header:start -->
<div align="center">

<img src="./assets/banner.svg" alt="Lumagen" width="100%">

<a href="#-quick-start"><img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&pause=1000&color=67e8f9&center=true&vCenter=true&width=640&lines=Describe+a+world.;AI+writes+the+WGSL+%2B+JS.;Export+a+%3C100KB+standalone+HTML" alt="Describe a world. · AI writes the WGSL + JS. · Export a &lt;100KB standalone HTML"></a>

<a href="LICENSE"><img src="https://img.shields.io/github/license/ajendras/lumagen?style=for-the-badge&color=f472b6" alt="License"></a>
<img src="https://img.shields.io/badge/TypeScript-f472b6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
<a href="https://github.com/ajendras/lumagen/stargazers"><img src="https://img.shields.io/github/stars/ajendras/lumagen?style=for-the-badge&logo=github&color=67e8f9" alt="Stars"></a>
<a href="https://github.com/ajendras/lumagen/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ajendras/lumagen/ci.yml?style=for-the-badge&label=CI" alt="CI"></a>
<img src="https://img.shields.io/github/last-commit/ajendras/lumagen?style=for-the-badge&color=f472b6" alt="Last commit">
<a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-22c55e?style=for-the-badge" alt="PRs welcome"></a>

**AI-powered editor that turns natural language into tiny self-contained WebGPU generative scenes**

[✨ Features](#-features) • [⚡ Quick start](#-quick-start) • [🧰 Usage](#-usage) • [🧩 Architecture](#-architecture) • [📍 Roadmap](#-roadmap) • [🤝 Contributing](#-contributing)

</div>
<!-- header:end -->

## ✨ Why Lumagen?

Viral single-file WebGPU demos like Abyssal Garden inspire many, yet creating them demands deep graphics and shader expertise. Lumagen fills the gap with a friendly pastel UI, local-LLM scene generation, live preview, and one-click export to optimized standalone HTMLs. Perfect for digital artists, indie devs and educators prototyping immersive procedural experiences.

- **Local-first AI** — `generateScene()` turns natural language into WGSL + uniforms via Ollama (with rich fallback when unavailable)
- **Instant live preview** — tweak sliders or regenerate and see changes reflected immediately via `createPipeline()` and the render loop
- **Tiny standalone exports** — `exportToHTML()` produces dependency-free HTMLs under 100 KB that run anywhere WebGPU is supported
- **Creative velocity** — start from the pastel `galleryTemplates`, remix specific aspects, and copy shader/JS blocks with one click

## 🎬 Demo

<p align="center"><img src="./assets/demo.svg" alt="Lumagen demo" width="760"></p>

## 🚀 Features

<table>
<tr>
<td width="33%" valign="top">
🌐 <b>AI Scene Gen</b><br>
Converts plain-English prompts into complete WGSL shaders, JS logic and uniform metadata via Ollama
</td>
<td width="33%" valign="top">
⚡ <b>Live Preview</b><br>
Real-time WebGPU canvas that instantly reflects prompt changes, uniform tweaks and animation updates
</td>
<td width="33%" valign="top">
📦 <b>One-File Export</b><br>
Bundles scene into a single dependency-free HTML under 100 KB ready for sharing or embedding
</td>
</tr>
<tr>
<td width="33%" valign="top">
🎛️ <b>Smart Controls</b><br>
Auto-generates pastel sliders, color pickers and toggles for every uniform the AI exposes
</td>
<td width="33%" valign="top">
🖼️ <b>Template Gallery</b><br>
Curated starters including kelp forests, sunbeams, particle fields and fractal explorers
</td>
<td width="33%" valign="top">
📊 <b>Perf Monitor</b><br>
Built-in FPS counter, draw-call stats and GPU timing to keep scenes running smoothly
</td>
</tr>
<tr>
<td width="33%" valign="top">
🔄 <b>Partial Remix</b><br>
Regenerate only lighting, motion or color via targeted prompts while preserving the rest
</td>
<td width="33%" valign="top">
📋 <b>Copy Blocks</b><br>
One-click extraction of shader, JS or full HTML for quick iteration in any editor
</td>
<td width="33%" valign="top">
🎤 <b>WebAudio Reactivity</b><br>
Microphone or audio track FFT data drives bass/mid/treble/level uniforms for beat-reactive scenes
</td>
</tr>
<tr>
<td width="33%" valign="top">
🗃️ <b>Community Gallery</b><br>
Upload exported HTMLs to a persistent local community gallery (localStorage). Load, inspect and remix community scenes instantly.
</td>
<td></td>
<td></td>
</tr>
</table>

### 🛡️ Static WGSL Analysis
The new static analysis step scans generated shaders for common pitfalls such as missing `@vertex`/`fn vs()`, missing `@fragment`/`fn fs()`, absent `struct Uniforms` or the required `@group(0) @binding(0) var<uniform> u: Uniforms;`, unbalanced braces, and use of `main()` instead of the expected entry points. It throws clear, actionable errors **before** the GPU attempts compilation.

## 📦 Installation

**Requirements**

- Node.js 18+
- Ollama running locally with the `llama3.2` model (for full AI generation; rich fallback shader is used otherwise)
- Chrome/Edge 113+ (or any browser with WebGPU enabled)

```bash
npm install
npm run dev
```

Open http://localhost:5173. The pastel UI will appear with a live WebGPU canvas.

To prepare a production build:

```bash
npm run build
npm run export
```

## ⚡ Quick start

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import { startEditor, exportCurrentScene, enableAudioReact } from './src/main.ts';
    
    window.addEventListener('load', async () => {
      await startEditor();
      // Type a prompt like "gentle underwater kelp forest" and click Generate
      // Enable audio reactivity:
      // await enableAudioReact();
      // Export with one click:
      // exportCurrentScene();
    });
  </script>
</head>
<body>
  <div id="root"></div>
</body>
</html>
```

The call to `startEditor()` wires the entire pastel UI, GPU context, prompt handler and render loop.

## 🧰 Usage

### Generate a scene from a prompt

```ts
import { generateScene } from './src/ai/client.ts';
import { createPipeline, writeUniforms } from './src/gpu/pipeline.ts';

const scene = await generateScene(
  'ethereal glowing neon garden at twilight with floating orbs'
);
const pipeline = await createPipeline(scene.wgsl, scene.uniforms);
// render loop automatically calls writeUniforms(time)
```

### Enable WebAudio reactivity (microphone or track)

```ts
import { enableAudioReact } from './src/main.ts';

// For live microphone input (requests permission)
await enableAudioReact();

// For audio track: use the track loader in the UI or call loadAudioTrack(file)
```

The analyzer computes real-time FFT and populates `audioLevel`, `audioBass`, `audioMid`, and `audioTreble` uniforms (0.0-2.0 range). Include them in your shader struct and use them to drive color, scale, distortion, or particle density for reactive visuals.

### Load a gallery template

```ts
import { getGalleryTemplates, getRandomTemplate } from './src/gallery.ts';
import { parseLLMOutput } from './src/scene/parser.ts';

const templates = getGalleryTemplates();
const random = getRandomTemplate();
const scene = parseLLMOutput(`\`\`\`wgsl\n${random.prompt}\n\`\`\``); // demo path
```

### Export a standalone HTML

```ts
import { exportToHTML } from './src/exporter.ts';

const html = await exportToHTML(scene, 'My Neon Garden');
console.log(`Exported ${calculateSize(html)} KB file`);
```

### Community Gallery (new)

Exported HTML files now embed rich metadata. Upload them via the **📤 Upload HTML** button (added next to Generate/Remix) to add to your persistent community gallery (localStorage). Uploaded scenes can be loaded and remixed immediately.

```ts
import { uploadToCommunity, getCommunityScenes } from './src/gallery.ts';
import { parseExportedHTML } from './src/scene/parser.ts';

// Upload flow (triggered by UI button)
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.html';
fileInput.onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const scene = await uploadToCommunity(file);
    console.log('Added to community:', scene.title);
  }
};

// Browse community scenes
const community = getCommunityScenes();
console.log('Community has', community.length, 'scenes');

// Load & remix a community scene (also available via window.loadCommunityScene(0))
const scene = community[0];
await createPipeline(scene.wgsl, scene.uniforms);
```

The community gallery makes Lumagen a shareable ecosystem: export a scene, send the HTML to a friend, they upload it and remix the shader with AI.

<details><summary>Advanced: Partial remix while preserving uniforms</summary>

```ts
import { remixScene } from './src/scene/parser.ts';
import { remixPart } from './src/ai/client.ts';
import { createPipeline } from './src/gpu/pipeline.ts';
import { populateUniforms } from './src/ui/panel.ts';

const updated = remixScene(currentScene, {
  wgsl: newLightingWGSL,           // only replace lighting
  uniforms: currentScene.uniforms  // keep existing controls
});
await createPipeline(updated.wgsl, updated.uniforms);
```

**AI-powered targeted remix (new)**

The editor now includes a **"🎨 Remix this part"** button. It sends the *current* shader back to the LLM together with a targeted instruction (taken from the prompt textarea). The LLM is instructed to change only the requested aspect (e.g. motion, palette, density) while preserving structure, uniforms and entry points.

```ts
import { remixPart } from './src/ai/client.ts';

const updatedScene = await remixPart(
  currentScene,
  'shift the palette toward cool blues, add gentle waves and increase particle density'
);
await createPipeline(updatedScene.wgsl, updatedScene.uniforms);
populateUniforms(updatedScene.uniforms.map(u => ({
  name: u.name,
  value: u.default,
  min: u.min ?? 0,
  max: u.max ?? 10,
  step: 0.01
})));
```

</details>

<details><summary>Advanced: Manual uniform updates with live feedback</summary>

```ts
import { updateUniformBuffer } from './src/gpu/pipeline.ts';
import { updateSliderValue } from './src/ui/panel.ts';

updateUniformBuffer('hueShift', 0.82);
updateSliderValue('hueShift', 0.82); // UI stays in sync
```

</details>

<details><summary>Advanced: Static WGSL analysis</summary>

```ts
import { analyzeWGSL } from './src/scene/parser.ts';

const analysis = analyzeWGSL(shaderCode);
if (!analysis.isValid) {
  console.error('Shader errors:', analysis.errors);
  // e.g. "Missing vertex entry point", "Unbalanced braces", ...
}
```

The analyzer runs automatically inside `parseLLMOutput()` and `createPipeline()`. It prevents cryptic GPU errors by catching issues early and giving actionable messages.

</details>

## 🧩 Architecture

```mermaid
flowchart TD
    Prompt[Prompt textarea] --> bindPromptHandler
    bindPromptHandler --> generateScene[ai/client.ts → queryOllama]
    generateScene --> parseLLMOutput[scene/parser.ts (with analyzeWGSL)]
    parseLLMOutput --> Scene[Scene {wgsl, uniforms, jsLogic, title}]
    Scene --> createPipeline[gpu/pipeline.ts]
    Scene --> populateUniforms[ui/panel.ts]
    createPipeline --> RenderLoop[main.ts render loop]
    RenderLoop --> writeUniforms[gpu/pipeline.ts]
    Scene --> exportToHTML[exporter.ts + minifier.ts]
    gallery.ts --> populateMiniGallery & populateFullGallery
    gallery.ts --> uploadToCommunity & parseExportedHTML
    style Scene fill:#f9e7f0,stroke:#f472b6
```

`main.ts` bootstraps the WebGPU context, UI panels and render loop. Natural-language prompts flow through the Ollama client and parser into a typed `Scene`. The GPU layer compiles the WGSL and maintains a dynamic uniform buffer. The exporter inlines everything into a self-contained HTML. Community uploads are parsed by `parseExportedHTML()` (looks for embedded JSON metadata) and persisted via localStorage.

## 📁 Project structure

```text
.
├── package.json                 # Vite, Tailwind, TypeScript, Vitest + "dev", "build", "test", "export" scripts
├── vite.config.ts               # HMR, WebGPU worker support, template.html plugin
├── tailwind.config.ts           # Pastel palette (#f472b6, #67e8f9), Nunito font, rounded-3xl
├── index.html                   # Entry with Tailwind and root canvas
├── src/
│   ├── main.ts                  # Bootstrap, startEditor(), exportCurrentScene(), render loop, community upload button
│   ├── ai/
│   │   └── client.ts            # Ollama HTTP client + SYSTEM_PROMPT + fallback shader
│   ├── scene/
│   │   └── parser.ts            # parseLLMOutput(), analyzeWGSL(), deriveTitleFromPrompt(), parseExportedHTML()
│   ├── gpu/
│   │   ├── context.ts           # init(), resizeHandler(), GPUContext
│   │   └── pipeline.ts          # createPipeline() (now runs static analysis first), updateUniformBuffer(), writeUniforms()
│   ├── ui/
│   │   └── panel.ts             # createUniformSlider(), bindPromptHandler(), populateUniforms(), gallery
│   ├── exporter.ts              # exportToHTML() + self-contained runtime template (now embeds JSON metadata)
│   ├── gallery.ts               # galleryTemplates array + getRandomTemplate(), findTemplateByTitle() + community upload/storage
│   └── utils/
│       └── minifier.ts          # minifyJS(), calculateSize()
└── tests/
    └── parser.test.ts           # Vitest suite for parseLLMOutput, uniform extraction, title derivation, analyzeWGSL() and parseExportedHTML()
```

## 🧪 Testing

```bash
npm test
```

Runs the Vitest suite in `tests/parser.test.ts`. Covers `parseLLMOutput()` edge cases, uniform extraction from JSON blocks, title derivation, `validateWGSL()`, the new `analyzeWGSL()` with test cases for missing entry points, missing uniform bindings, unbalanced braces, missing `time` field (warnings), and the new `parseExportedHTML()` for community uploads.

## 📍 Roadmap

<!-- roadmap:start -->
- [x] **v0.1.0** — first release: AI Scene Gen, Live Preview, One-File Export, Smart Controls
- [x] Add WebAudio reactive mode so scenes respond to microphone or track FFT data
- [x] Implement 'remix this part' button that sends current shader back to LLM with a targeted edit prompt
- [x] Add static analysis step that catches common WGSL errors before attempting to compile
- [x] Build public community gallery site where exported HTMLs can be uploaded and remixed
- [ ] Support compute shaders and multi-pass rendering for more complex effects
- [ ] Add few-shot examples to the system prompt to improve shader quality on first try
- [ ] Create undo/redo stack for prompt iterations and parameter adjustments
- [ ] Optimize exporter with Brotli compression reporting and size budget warnings
- [ ] Add mobile touch-friendly canvas gestures for rotating or zooming procedural cameras
- [ ] Provide a small library of reusable WGSL noise/SDF helpers that LLM is instructed to import
- [ ] Electron wrapper for offline desktop app with direct llama.cpp integration
- [ ] Plugin API for custom post-processing effects contributed by the community

> 🤖 This roadmap is worked through continuously — ideas and PRs welcome!
<!-- roadmap:end -->

## 🤝 Contributing

We'd love your help making Lumagen even friendlier! Please read [CONTRIBUTING.md](https://github.com/ajendras/lumagen/blob/main/CONTRIBUTING.md) and follow our [CODE_OF_CONDUCT.md](https://github.com/ajendras/lumagen/blob/main/CODE_OF_CONDUCT.md).

Good-first-issue PRs are especially welcome — improving gallery templates, adding new uniform widget types, or tightening the minifier are all great places to start. Just open a PR against `main` and we'll review it quickly.

## 📄 License

[MIT License](https://github.com/ajendras/lumagen/blob/main/LICENSE) — feel free to use Lumagen in both personal and commercial projects.

<!-- footer:start -->
<div align="center">

### ⭐ Star history

<a href="https://star-history.com/#ajendras/lumagen&Date"><img src="https://api.star-history.com/svg?repos=ajendras/lumagen&type=Date" alt="Star history" width="600"></a>

If **Lumagen** saves you time, a ⭐ helps others find it.

Made with ❤️ by [Ajendra](https://ajendra.info)

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:f472b6,100:67e8f9&height=120&section=footer" width="100%" alt="">

</div>
<!-- footer:end -->
