/**
 * SpeciesPalettes.js
 *
 * Builds Three.js DataTextures (1×256, RGBAFormat, FloatType) from the
 * seven species hex-stop arrays defined in the repo_seed.
 *
 * Usage:
 *   import { buildPaletteTexture, SPECIES } from './SpeciesPalettes.js';
 *   const tex = buildPaletteTexture(SPECIES.RETICULATED);
 *   material.uniforms.u_palette.value = tex;
 */

import * as THREE from 'three';

// ─── Hex colour helpers ──────────────────────────────────────────────────────

/** Parse '#rrggbb' → [r,g,b] in linear [0,1] (gamma-decoded). */
function hexToLinear(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    // sRGB → linear (approximate)
    return [
        r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4),
        g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4),
        b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4),
    ];
}

/** Linearly interpolate between two [r,g,b] arrays. */
function lerpRGB(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Build a 1×256 THREE.DataTexture that maps [0,1] → colour via linear
 * interpolation across the given array of hex-stop strings.
 *
 * @param {string[]} stops  - Ordered hex colour strings (low→high field value)
 * @returns {THREE.DataTexture}
 */
export function buildPaletteTexture(stops) {
    const WIDTH   = 256;
    const data    = new Float32Array(WIDTH * 4);  // RGBA float
    const colours = stops.map(hexToLinear);
    const n       = colours.length - 1;

    for (let i = 0; i < WIDTH; i++) {
        const t   = i / (WIDTH - 1);           // [0, 1]
        const idx = Math.min(Math.floor(t * n), n - 1);
        const f   = t * n - idx;
        const col = lerpRGB(colours[idx], colours[idx + 1], f);
        data[i * 4 + 0] = col[0];
        data[i * 4 + 1] = col[1];
        data[i * 4 + 2] = col[2];
        data[i * 4 + 3] = 1.0;
    }

    const tex = new THREE.DataTexture(data, WIDTH, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    return tex;
}

// ─── Seven species palette stop arrays ───────────────────────────────────────

export const SPECIES = {
    /** 0 — Reticulated Cathedral: Python reticulatus */
    RETICULATED: ['#0a0805', '#3a2a18', '#7a6a42', '#c9b486', '#efe3c2'],

    /** 1 — Gaboon Geometry: Bitis gabonica */
    GABOON: ['#2b211a', '#5c3b22', '#8a6a4a', '#b9a07a', '#d9c8a8', '#7a6f7d'],

    /** 2a — Adder Zigzag grey morph: Vipera berus */
    ADDER_GREY:       ['#1a1a1a', '#b9bcc0'],

    /** 2b — Adder rust morph (red female) */
    ADDER_RUST:       ['#2a0f08', '#a8502f'],

    /** 2c — Adder melanistic morph */
    ADDER_MELANISTIC: ['#050505', '#1f1f1f'],

    /** 3 — Diamondback Chain: Crotalus */
    DIAMONDBACK: ['#3a3a2a', '#6b6347', '#9a8f63', '#cabf90', '#0d0d08'],

    /** 4 — Coral Mimicry: Micrurus + mimics */
    CORAL: ['#0a0a0a', '#ffd400', '#d7263d'],   // black=0, yellow=0.5, red=1.0

    /** 5 — Emerald Flecks adult: Morelia viridis */
    EMERALD_ADULT:    ['#063d2c', '#0b6e4f', '#2faa6a', '#9fe0b0', '#f1ece0'],

    /** 5b — Emerald Flecks juvenile (hatchling colours) */
    EMERALD_JUVENILE: ['#4b1c08', '#992300', '#d46400', '#f9c832', '#faf3cb'],

    /** 6 — Morph Lab base */
    MORPHLAB_BASE:   ['#1a1206', '#4a3414', '#7a5a2a', '#b58d4a', '#e8d39a'],

    /** 6b — Morph Lab banana mutation */
    MORPHLAB_BANANA: ['#241a2e', '#5a3a6e', '#c9a0e0', '#ffe27a'],
};

// ─── Pre-built palette cache ─────────────────────────────────────────────────

let _cache = null;

/**
 * Return an object containing a pre-built DataTexture for each species.
 * Results are cached after the first call.
 *
 * @returns {{ [key: string]: THREE.DataTexture }}
 */
export function getAllPaletteTextures() {
    if (_cache) return _cache;
    _cache = Object.fromEntries(
        Object.entries(SPECIES).map(([key, stops]) => [key, buildPaletteTexture(stops)])
    );
    return _cache;
}

/**
 * Convenience: return the correct palette texture(s) for a given regime index.
 * For regimes with morphs/mutations, returns the base texture;
 * callers can cross-fade to mutation variants via their own logic.
 *
 * @param {number} regime  0–6
 * @returns {THREE.DataTexture}
 */
export function paletteForRegime(regime) {
    const textures = getAllPaletteTextures();
    switch (regime) {
        case 0:  return textures.RETICULATED;
        case 1:  return textures.GABOON;
        case 2:  return textures.ADDER_GREY;
        case 3:  return textures.DIAMONDBACK;
        case 4:  return textures.CORAL;
        case 5:  return textures.EMERALD_ADULT;
        case 6:  return textures.MORPHLAB_BASE;
        default: return textures.RETICULATED;
    }
}
