/**
 * src/gallery.ts
 * Static curated collection of 8 high-quality starter scenes.
 * Each entry includes a natural-language prompt optimized for the Lumagen
 * system prompt, a pastel thumbnail accent, emoji accent and sensible
 * uniform ranges that produce beautiful results instantly.
 */

import type { Uniform } from './main.js';

export interface GalleryTemplate {
  title: string;
  prompt: string;
  thumbnailColor: string;
  emoji: string;
  initialUniforms: Uniform[];
}

export const galleryTemplates: GalleryTemplate[] = [
  {
    title: 'Kelp Forest',
    prompt: 'gentle underwater kelp forest with swaying blades, soft volumetric caustics, and tiny glowing jellyfish',
    thumbnailColor: '#67e8f9',
    emoji: '🌿',
    initialUniforms: [
      { name: 'speed', type: 'f32', default: 1.25, min: 0.2, max: 4.0 },
      { name: 'intensity', type: 'f32', default: 1.45, min: 0.6, max: 3.2 },
      { name: 'hueShift', type: 'f32', default: 0.48, min: 0.1, max: 0.7 },
      { name: 'density', type: 'f32', default: 8.2, min: 3.0, max: 15.0 },
    ],
  },
  {
    title: 'Neon Garden',
    prompt: 'ethereal glowing neon garden at twilight with floating orbs, soft pastel light trails and gentle wind',
    thumbnailColor: '#f472b6',
    emoji: '🌸',
    initialUniforms: [
      { name: 'speed', type: 'f32', default: 0.95, min: 0.3, max: 3.5 },
      { name: 'intensity', type: 'f32', default: 2.1, min: 0.9, max: 4.0 },
      { name: 'hueShift', type: 'f32', default: 0.72, min: 0.4, max: 0.95 },
      { name: 'density', type: 'f32', default: 5.5, min: 2.0, max: 11.0 },
    ],
  },
  {
    title: 'Stellar Particles',
    prompt: 'cosmic dust field with twinkling pastel stars, slow orbiting nebulae and gentle gravitational wells',
    thumbnailColor: '#a5f3fc',
    emoji: '🌌',
    initialUniforms: [
      { name: 'speed', type: 'f32', default: 2.3, min: 0.6, max: 6.5 },
      { name: 'intensity', type: 'f32', default: 0.95, min: 0.4, max: 2.4 },
      { name: 'hueShift', type: 'f32', default: 0.81, min: 0.0, max: 1.0 },
      { name: 'density', type: 'f32', default: 12.0, min: 5.0, max: 22.0 },
    ],
  },
  {
    title: 'Fractal Bloom',
    prompt: 'recursive pastel fractal flower that gently blooms and pulses with organic noise and soft gradients',
    thumbnailColor: '#c4b5fd',
    emoji: '🌀',
    initialUniforms: [
      { name: 'speed', type: 'f32', default: 0.65, min: 0.1, max: 2.2 },
      { name: 'intensity', type: 'f32', default: 1.85, min: 0.7, max: 3.6 },
      { name: 'hueShift', type: 'f32', default: 0.58, min: 0.2, max: 0.85 },
      { name: 'density', type: 'f32', default: 4.2, min: 1.5, max: 9.5 },
    ],
  },
  {
    title: 'Magma Flow',
    prompt: 'molten lava river with heat distortion, glowing ember particles and warm pulsing organic motion',
    thumbnailColor: '#fed7aa',
    emoji: '🌋',
    initialUniforms: [
      { name: 'speed', type: 'f32', default: 1.55, min: 0.5, max: 5.0 },
      { name: 'intensity', type: 'f32', default: 2.4, min: 1.1, max: 4.5 },
      { name: 'hueShift', type: 'f32', default: 0.08, min: 0.0, max: 0.35 },
      { name: 'density', type: 'f32', default: 7.8, min: 3.5, max: 14.0 },
    ],
  },
  {
    title: 'Aurora Veil',
    prompt: 'flowing northern-lights curtains in soft mint and lavender with subtle twinkling stars behind',
    thumbnailColor: '#67e8f9',
    emoji: '🌌',
    initialUniforms: [
      { name: 'speed', type: 'f32', default: 0.85, min: 0.2, max: 3.0 },
      { name: 'intensity', type: 'f32', default: 1.65, min: 0.8, max: 3.1 },
      { name: 'hueShift', type: 'f32', default: 0.62, min: 0.35, max: 0.9 },
      { name: 'density', type: 'f32', default: 6.0, min: 2.5, max: 12.0 },
    ],
  },
  {
    title: 'Bubble Realm',
    prompt: 'underwater bubble world with iridescent soap bubbles, soft caustics and peaceful jellyfish drift',
    thumbnailColor: '#a7f3d0',
    emoji: '🫧',
    initialUniforms: [
      { name: 'speed', type: 'f32', default: 1.4, min: 0.4, max: 4.2 },
      { name: 'intensity', type: 'f32', default: 1.35, min: 0.6, max: 2.9 },
      { name: 'hueShift', type: 'f32', default: 0.78, min: 0.45, max: 1.0 },
      { name: 'density', type: 'f32', default: 9.5, min: 4.0, max: 19.0 },
    ],
  },
  {
    title: 'Crystal Lattice',
    prompt: 'refractive geometric crystal lattice with soft pastel internal glows, gentle rotation and light caustics',
    thumbnailColor: '#e0f2fe',
    emoji: '💎',
    initialUniforms: [
      { name: 'speed', type: 'f32', default: 0.75, min: 0.2, max: 2.5 },
      { name: 'intensity', type: 'f32', default: 2.15, min: 0.9, max: 4.2 },
      { name: 'hueShift', type: 'f32', default: 0.52, min: 0.1, max: 0.9 },
      { name: 'density', type: 'f32', default: 5.8, min: 2.0, max: 13.5 },
    ],
  },
];

/**
 * Returns all gallery templates. Used by UI panels to populate both
 * the mini sidebar thumbnails and the full modal gallery.
 */
export function getGalleryTemplates(): GalleryTemplate[] {
  return [...galleryTemplates];
}

/**
 * Returns a random template for quick "surprise me" flows.
 */
export function getRandomTemplate(): GalleryTemplate {
  return galleryTemplates[Math.floor(Math.random() * galleryTemplates.length)]!;
}

/**
 * Finds a template by title (case-insensitive). Useful for deep-linking.
 */
export function findTemplateByTitle(title: string): GalleryTemplate | undefined {
  const normalized = title.toLowerCase().trim();
  return galleryTemplates.find((t) => t.title.toLowerCase() === normalized);
}
