/**
 * src/gpu/context.ts
 * Acquires WebGPU adapter/device, configures the canvas context, and provides
 * responsive resize handling. Production-ready with clear error messages,
 * high-performance adapter preference, and proper DPR scaling.
 */

export interface GPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

let activeContext: GPUContext | null = null;

export async function init(canvas: HTMLCanvasElement): Promise<GPUDevice> {
  if (!('gpu' in navigator)) {
    throw new Error(
      'WebGPU is not supported. Please use Chrome 113+, Edge 113+, or another Chromium browser with the WebGPU flag enabled.'
    );
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });

  if (!adapter) {
    throw new Error('No appropriate GPU adapter found. Your device may not support WebGPU.');
  }

  const device = await adapter.requestDevice({
    label: 'Lumagen Primary Device',
    requiredLimits: {
      maxStorageBuffersInFragmentStage: 4,
    },
  });

  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) {
    throw new Error('Failed to obtain WebGPU canvas context. The canvas may already be in use.');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  // Respect device pixel ratio for crisp rendering
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);

  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  activeContext = { device, context, format };

  console.log(
    '%c📦 WebGPU context acquired (format=%s)',
    'color:#67e8f9;font-weight:500',
    format
  );

  return device;
}

export function getActiveContext(): GPUContext | null {
  return activeContext;
}

/**
 * Returns a reusable resize handler that updates canvas dimensions and
 * reconfigures the context when the window or container changes size.
 */
export function resizeHandler(canvas: HTMLCanvasElement): () => void {
  return () => {
    if (!activeContext || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const newWidth = Math.floor(canvas.clientWidth * dpr);
    const newHeight = Math.floor(canvas.clientHeight * dpr);

    if (canvas.width === newWidth && canvas.height === newHeight) return;

    canvas.width = newWidth;
    canvas.height = newHeight;

    // Reconfigure is safe and cheap; format does not change
    activeContext.context.configure({
      device: activeContext.device,
      format: activeContext.format,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    console.log(
      `%c📐 Canvas resized to ${newWidth}×${newHeight} (dpr=${dpr})`,
      'color:#f472b6;font-size:10px'
    );
  };
}
