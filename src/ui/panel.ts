/**
 * src/ui/panel.ts
 * Pastel control panel with prompt handling, dynamic sliders, gallery thumbnails.
 * All UI is soft, rounded, bouncy and fully accessible.
 */

export interface UniformControl {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

let onUniformChange: ((name: string, value: number) => void) | null = null;
let onGenerate: ((prompt: string) => Promise<void>) | null = null;

const UNIFORMS_LIST_ID = 'uniforms-list';
const MINI_GALLERY_ID = 'mini-gallery';
const FULL_GALLERY_ID = 'gallery-content';

/**
 * Register callback for when any slider changes
 */
export function setUniformChangeHandler(cb: (name: string, value: number) => void): void {
  onUniformChange = cb;
}

/**
 * Register the generate handler (called from main.ts)
 */
export function setGenerateHandler(cb: (prompt: string) => Promise<void>): void {
  onGenerate = cb;
}

/**
 * Creates a single pastel slider UI element
 */
export function createUniformSlider(
  name: string,
  def: number,
  min = 0.0,
  max = 5.0,
  step = 0.05
): HTMLElement {
  const safeName = name.replace(/\s+/g, '-').toLowerCase();
  const wrapper = document.createElement('div');
  wrapper.className = 'panel group';
  
  wrapper.innerHTML = `
    <div class="flex items-center justify-between">
      <label class="text-pink-400 text-sm font-medium capitalize tracking-tight">${name}</label>
      <output id="val-${safeName}" 
              class="font-mono text-xs bg-white px-3 py-1 rounded-3xl text-secondary shadow-inner border border-pink-100">${def.toFixed(2)}</output>
    </div>
    <input type="range" 
           id="slider-${safeName}"
           min="${min}" 
           max="${max}" 
           step="${step}" 
           value="${def}"
           class="slider mt-2 w-full accent-[#f472b6] bg-gradient-to-r from-pink-200 to-pink-100 h-2.5 rounded-3xl cursor-pointer focus:outline-none">
  `;

  const range = wrapper.querySelector('input') as HTMLInputElement;
  const output = wrapper.querySelector('output') as HTMLOutputElement;

  const updateOutput = () => {
    const v = parseFloat(range.value);
    output.textContent = v.toFixed(2);
    if (onUniformChange) onUniformChange(name, v);
  };

  range.addEventListener('input', updateOutput);
  
  // Gentle bounce on release
  range.addEventListener('change', () => {
    range.style.transform = 'scale(1.025)';
    setTimeout(() => { range.style.transform = 'scale(1)'; }, 180);
  });

  // ARIA
  range.setAttribute('aria-label', `${name} slider`);
  
  return wrapper;
}

/**
 * Binds the prompt textarea + generate button (matches plan signature)
 */
export function bindPromptHandler(handler: (prompt: string) => Promise<void>): void {
  const textarea = document.getElementById('prompt-input') as HTMLTextAreaElement;
  const button = document.getElementById('generate-btn') as HTMLButtonElement;
  const btnText = document.getElementById('btn-text') as HTMLElement;

  setGenerateHandler(handler);

  button.addEventListener('click', async () => {
    const promptText = textarea.value.trim();
    if (!promptText) {
      textarea.classList.add('animate-wiggle-once', 'border-red-300');
      setTimeout(() => textarea.classList.remove('animate-wiggle-once', 'border-red-300'), 720);
      return;
    }

    const originalHTML = button.innerHTML;
    button.disabled = true;
    btnText.textContent = 'DREAMING...';
    button.classList.add('!from-pink-300', '!to-cyan-300');

    try {
      await handler(promptText);
    } catch (e) {
      console.error(e);
      alert('Failed to reach local Ollama. Is it running?');
    } finally {
      button.disabled = false;
      button.innerHTML = originalHTML;
      button.classList.remove('!from-pink-300', '!to-cyan-300');
    }
  });

  // Support Ctrl/Cmd + Enter
  textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      button.click();
    }
  });
}

/**
 * Populate the dynamic uniform controls panel
 */
export function populateUniforms(controls: UniformControl[], initialValues: Record<string, number> = {}): void {
  const container = document.getElementById(UNIFORMS_LIST_ID);
  if (!container) return;

  container.innerHTML = '';

  controls.forEach(ctrl => {
    const current = initialValues[ctrl.name] !== undefined ? initialValues[ctrl.name] : ctrl.value;
    const el = createUniformSlider(ctrl.name, current, ctrl.min, ctrl.max, ctrl.step);
    container.appendChild(el);
  });

  // Cute toggle for animation (demo only)
  const toggleHTML = document.createElement('div');
  toggleHTML.className = 'pt-6 border-t border-pink-100 flex items-center justify-between';
  toggleHTML.innerHTML = `
    <span class="text-sm text-pink-400">Animation enabled</span>
    <label class="relative inline-flex cursor-pointer">
      <input type="checkbox" checked class="sr-only peer">
      <div class="w-11 h-6 bg-pink-200 rounded-3xl peer peer-checked:bg-[#67e8f9] transition-colors"></div>
      <div class="absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-3xl transition-all peer-checked:translate-x-5"></div>
    </label>
  `;
  container.appendChild(toggleHTML);
}

/**
 * Populate the tiny gallery thumbnails in the sidebar
 */
export function populateMiniGallery(onSelect: (index: number) => void): void {
  const container = document.getElementById(MINI_GALLERY_ID);
  if (!container) return;
  container.innerHTML = '';

  const palette = ['#f472b6', '#67e8f9', '#a7f3d0', '#fed7aa'];
  const icons = ['🌿', '🌌', '🔥', '🌀'];

  palette.forEach((color, i) => {
    const div = document.createElement('div');
    div.className = `thumbnail aspect-square rounded-2xl flex items-center justify-center text-3xl shadow-inner border-2 border-white cursor-pointer`;
    div.style.backgroundColor = color;
    div.textContent = icons[i];
    div.addEventListener('click', () => onSelect(i));
    container.appendChild(div);
  });
}

/**
 * Populate the full gallery modal (demo templates)
 */
export function populateFullGallery(onLoad: (prompt: string, title: string) => void): void {
  const container = document.getElementById(FULL_GALLERY_ID);
  if (!container) return;

  container.innerHTML = `
    <div onclick="this.classList.add('ring-4','ring-pink-300');setTimeout(()=>window.hideGalleryModal&&window.hideGalleryModal(),420)" 
         class="group bg-gradient-to-br from-pink-50 to-rose-50 p-5 rounded-3xl cursor-pointer hover:shadow-xl transition-all">
      <div class="h-44 bg-white rounded-2xl mb-5 flex items-center justify-center text-7xl transition-transform group-active:scale-90">🌿</div>
      <div class="font-semibold text-pink-500">Kelp Forest</div>
      <div class="text-xs text-pink-400 mt-1">Swaying kelp, sunbeams, gentle bubbles</div>
    </div>
    
    <div onclick="this.classList.add('ring-4','ring-pink-300');setTimeout(()=>window.hideGalleryModal&&window.hideGalleryModal(),420)" 
         class="group bg-gradient-to-br from-cyan-50 to-sky-50 p-5 rounded-3xl cursor-pointer hover:shadow-xl transition-all">
      <div class="h-44 bg-white rounded-2xl mb-5 flex items-center justify-center text-7xl transition-transform group-active:scale-90">🌌</div>
      <div class="font-semibold text-cyan-500">Nebula Particles</div>
      <div class="text-xs text-pink-400 mt-1">Twinkling cosmic dust and slow orbits</div>
    </div>
    
    <div onclick="this.classList.add('ring-4','ring-pink-300');setTimeout(()=>window.hideGalleryModal&&window.hideGalleryModal(),420)" 
         class="group bg-gradient-to-br from-orange-50 to-amber-50 p-5 rounded-3xl cursor-pointer hover:shadow-xl transition-all">
      <div class="h-44 bg-white rounded-2xl mb-5 flex items-center justify-center text-7xl transition-transform group-active:scale-90">🌋</div>
      <div class="font-semibold text-orange-400">Magma Flow</div>
      <div class="text-xs text-pink-400 mt-1">Glowing lava with heat distortion</div>
    </div>
    
    <div onclick="this.classList.add('ring-4','ring-pink-300');setTimeout(()=>window.hideGalleryModal&&window.hideGalleryModal(),420)" 
         class="group bg-gradient-to-br from-purple-50 to-fuchsia-50 p-5 rounded-3xl cursor-pointer hover:shadow-xl transition-all">
      <div class="h-44 bg-white rounded-2xl mb-5 flex items-center justify-center text-7xl transition-transform group-active:scale-90">🌀</div>
      <div class="font-semibold text-purple-400">Fractal Dream</div>
      <div class="text-xs text-pink-400 mt-1">Infinite recursive geometry</div>
    </div>
  `;
}

/**
 * Programmatically update a slider (used by main.ts after AI generation)
 */
export function updateSliderValue(name: string, newValue: number): void {
  const safe = name.replace(/\s+/g, '-').toLowerCase();
  const slider = document.getElementById(`slider-${safe}`) as HTMLInputElement | null;
  const output = document.getElementById(`val-${safe}`) as HTMLOutputElement | null;
  
  if (slider) slider.value = String(newValue);
  if (output) output.textContent = newValue.toFixed(2);
}

/**
 * Show loading state in UI (used during generation)
 */
export function showLoadingState(isLoading: boolean): void {
  const btn = document.getElementById('generate-btn') as HTMLButtonElement | null;
  if (!btn) return;
  
  if (isLoading) {
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.7';
  } else {
    btn.style.pointerEvents = 'all';
    btn.style.opacity = '1';
  }
}

// Make a few helpers available globally for modal inline handlers
(window as any).updateSliderValue = updateSliderValue;
