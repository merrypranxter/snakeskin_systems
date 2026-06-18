/**
 * SnakeskinRenderer.js
 *
 * Top-level Three.js renderer orchestrating the full six-pass GPU pipeline:
 *
 *   1. Scale Lattice Pass   — jittered Voronoi: cell id, center, keel normal
 *   2. Morphogen FBO Loop   — Gray-Scott ping-pong (~40 substeps)
 *   3. Quantize Pass        — per fragment: scale cell → field at center → posterize
 *   4. Palette Map          — cell value → species LUT
 *   5. Scale Shading        — keel specular + imbrication shadow + optional thin-film
 *   6. Post                 — oil sheen bloom + chromatic edge
 *
 * Usage:
 *   const snake = new SnakeskinRenderer(canvas, { regime: 0, width: 512, height: 512 });
 *   snake.init().then(() => snake.start());
 *
 *   // Switch species at runtime
 *   snake.setRegime(3);   // diamondback
 *
 *   // Pattern transfer: pipe in an external field
 *   snake.setExternalField(yourTexture);
 */

import * as THREE                               from 'three';
import ReactionDiffusion, { REGIME_PARAMS }     from './ReactionDiffusion.js';
import { paletteForRegime, getAllPaletteTextures, buildPaletteTexture } from './SpeciesPalettes.js';
import PatternTransfer                          from './PatternTransfer.js';

// Regime lattice defaults [density, jitter, levels]
const REGIME_LATTICE = [
    [90.0, 0.45, 3.0],
    [60.0, 0.30, 5.0],
    [50.0, 0.35, 2.0],
    [55.0, 0.35, 3.0],
    [30.0, 0.20, 3.0],
    [80.0, 0.40, 4.0],
    [65.0, 0.40, 4.0],
];

// RD-backed regimes
const RD_REGIMES = new Set([0, 3, 5, 6]);

// Map regime index to REGIME_PARAMS key
const RD_REGIME_KEY = ['RETICULATED', null, null, 'DIAMONDBACK', null, 'EMERALD', 'MORPHLAB'];

export default class SnakeskinRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} opts
     * @param {number} [opts.regime=0]           — species index 0–6
     * @param {number} [opts.width=512]
     * @param {number} [opts.height=512]
     * @param {number} [opts.rdSubsteps=40]      — RD steps per display frame
     */
    constructor(canvas, opts = {}) {
        this._canvas     = canvas;
        this._regime     = opts.regime     ?? 0;
        this._width      = opts.width      ?? 512;
        this._height     = opts.height     ?? 512;
        this._rdSubsteps = opts.rdSubsteps ?? 40;
        this._running    = false;
        this._raf        = null;

        // Mutation sliders (morph-lab, regime 6)
        this.mutations = {
            pied: 0, clown: 0, spider: 0, banana: 0, pastel: 0, axanthic: 0,
        };
        // Adder morph: 0=grey 1=rust 2=melanistic
        this.adderMorph = 0;
        // Coral mimic toggle
        this.coralMimic = false;
        // Emerald maturity
        this.emeraldMaturity = 1.0;
        // Light direction
        this.lightDir = new THREE.Vector3(0.3, 0.6, 0.7).normalize();
    }

    /** Async init: sets up renderer, loads shaders, boots RD. */
    async init() {
        // Three.js renderer
        this._renderer = new THREE.WebGLRenderer({
            canvas:    this._canvas,
            antialias: false,
            alpha:     false,
        });
        this._renderer.setSize(this._width, this._height);
        this._renderer.setPixelRatio(1);

        // Verify WebGL2 + float texture support
        const gl = this._renderer.getContext();
        if (!gl.getExtension('EXT_color_buffer_float')) {
            console.warn('EXT_color_buffer_float not available — RD quality may be limited');
        }

        // Load shader sources
        const [computeSrc, displaySrc] = await Promise.all([
            this._fetchShader('glsl/compute.frag'),
            this._fetchShader('glsl/display.frag'),
        ]);
        this._computeSrc = computeSrc;
        this._displaySrc = displaySrc;

        // Reaction-diffusion engine
        this._rd = new ReactionDiffusion(
            this._renderer, this._width, this._height, computeSrc
        );
        this._rd.setRegime(RD_REGIME_KEY[this._regime] || 'RETICULATED');

        // Palettes
        this._palettes = getAllPaletteTextures();

        // Display material (Three.js RawShaderMaterial wrapping display.frag)
        this._displayMat = this._buildDisplayMaterial(displaySrc);

        // Full-screen quad scene
        const quad     = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._displayMat);
        this._scene    = new THREE.Scene();
        this._camera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._scene.add(quad);

        // Pattern transfer rig
        this._transfer = new PatternTransfer(this._renderer, this._width, this._height);
        this._transfer.setTopology(this._regime);
        this._transfer.setPalette(paletteForRegime(this._regime));

        // Run 40 warm-up substeps so the field is populated on first frame
        this._rd.step(this._rdSubsteps * 2);

        return this;
    }

    /** Start the render loop. */
    start() {
        this._running = true;
        this._loop();
        return this;
    }

    /** Pause the render loop. */
    pause() {
        this._running = false;
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    /** Switch to a different species regime (0–6). */
    setRegime(regime) {
        this._regime = regime;
        const [density, jitter, levels] = REGIME_LATTICE[regime];
        const u = this._displayMat.uniforms;
        u.u_regime.value  = regime;
        u.u_density.value = density;
        u.u_jitter.value  = jitter;
        u.u_levels.value  = levels;
        u.u_palette.value = paletteForRegime(regime);

        if (RD_REGIMES.has(regime)) {
            const key = RD_REGIME_KEY[regime];
            if (key) this._rd.setRegime(key);
            this._rd.reset();
            this._rd.step(this._rdSubsteps * 2);
        }
        this._transfer.setTopology(regime);
        this._transfer.setPalette(paletteForRegime(regime));
    }

    /**
     * Override the fill field with an external texture.
     * When set, the display pass uses this instead of the RD output.
     *
     * @param {THREE.Texture|null} tex  — pass null to revert to RD
     */
    setExternalField(tex) {
        const u = this._displayMat.uniforms;
        if (tex) {
            u.u_useLens.value   = true;
            u.u_lensField.value = tex;
            this._transfer.setFillField(tex);
        } else {
            u.u_useLens.value = false;
        }
    }

    /**
     * Override the palette with a custom 1×256 DataTexture or hex-stop array.
     *
     * @param {THREE.DataTexture|string[]} paletteOrStops
     */
    setPalette(paletteOrStops) {
        const tex = Array.isArray(paletteOrStops)
            ? buildPaletteTexture(paletteOrStops)
            : paletteOrStops;
        this._displayMat.uniforms.u_palette.value = tex;
        this._transfer.setPalette(tex);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    _loop() {
        if (!this._running) return;
        this._raf = requestAnimationFrame(() => this._loop());

        // Advance RD for RD-backed regimes
        if (RD_REGIMES.has(this._regime)) {
            this._rd.step(this._rdSubsteps);
            // Bind RD texture — works by passing the raw GL texture handle
            const gl   = this._renderer.getContext();
            const unit = 3;
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, this._rd.getTexture());
            this._displayMat.uniforms.u_rdState.value = null;  // prevent Three.js clobber
            // Inject the unit index directly via a custom uniform setter in the mat
            this._displayMat.uniforms._rdUnit = { value: unit };
        }

        // Update per-frame uniforms
        const u = this._displayMat.uniforms;
        u.u_lightDir.value.copy(this.lightDir);
        u.u_adderMorph.value    = this.adderMorph;
        u.u_coralMimic.value    = this.coralMimic;
        u.u_maturity.value      = this.emeraldMaturity;
        u.u_morphPied.value     = this.mutations.pied;
        u.u_morphClown.value    = this.mutations.clown;
        u.u_morphSpider.value   = this.mutations.spider;
        u.u_morphBanana.value   = this.mutations.banana;
        u.u_morphPastel.value   = this.mutations.pastel;
        u.u_morphAxanthic.value = this.mutations.axanthic;

        this._renderer.render(this._scene, this._camera);
    }

    _buildDisplayMaterial(fragSrc) {
        const [density, jitter, levels] = REGIME_LATTICE[this._regime];
        return new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: /* glsl */`#version 300 es
                in  vec2 a_position;
                void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`,
            fragmentShader: fragSrc,
            uniforms: {
                u_rdState:       { value: null },
                u_palette:       { value: paletteForRegime(this._regime) },
                u_regime:        { value: this._regime },
                u_resolution:    { value: new THREE.Vector2(this._width, this._height) },
                u_lightDir:      { value: this.lightDir.clone() },
                u_density:       { value: density },
                u_jitter:        { value: jitter  },
                u_levels:        { value: levels  },
                u_adderMorph:    { value: 0   },
                u_coralMimic:    { value: false },
                u_maturity:      { value: 1.0 },
                u_morphPied:     { value: 0.0 },
                u_morphClown:    { value: 0.0 },
                u_morphSpider:   { value: 0.0 },
                u_morphBanana:   { value: 0.0 },
                u_morphPastel:   { value: 0.0 },
                u_morphAxanthic: { value: 0.0 },
                u_useLens:       { value: false },
                u_lensField:     { value: null  },
            },
        });
    }

    async _fetchShader(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to load shader: ${path}`);
        return res.text();
    }
}
