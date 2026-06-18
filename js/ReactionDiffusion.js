/**
 * ReactionDiffusion.js
 *
 * WebGL2 / Three.js Gray-Scott reaction-diffusion ping-pong FBO.
 *
 * Runs the compute shader from glsl/compute.frag on two alternating
 * WebGLRenderTarget (RGBA32F) textures.  Call .step(n) to advance n
 * substeps and .getTexture() to get the current state for display.
 *
 * Usage:
 *   const rd = new ReactionDiffusion(renderer, 512, 512);
 *   rd.setRegime(REGIME.RETICULATED);   // sets F/k + anisotropy
 *   rd.step(40);                         // settle 40 substeps
 *   displayMaterial.uniforms.u_rdState.value = rd.getTexture();
 */

import * as THREE from 'three';

// ─── Gray-Scott F/k parameters per regime ────────────────────────────────────
export const REGIME_PARAMS = {
    RETICULATED:  { fk: [0.026, 0.051], anisotropy: 1.4 },
    DIAMONDBACK:  { fk: [0.035, 0.065], anisotropy: 1.2 },
    MOTTLE:       { fk: [0.030, 0.057], anisotropy: 1.0 },
    WORM:         { fk: [0.039, 0.058], anisotropy: 1.0 },
    HOLES:        { fk: [0.030, 0.062], anisotropy: 1.0 },
    EMERALD:      { fk: [0.030, 0.057], anisotropy: 1.0 },
    MORPHLAB:     { fk: [0.034, 0.060], anisotropy: 1.0 },
};

// Full-screen-quad vertex shader (shared by both passes)
const VERT = /* glsl */`#version 300 es
in  vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv        = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Minimal wrapper to compile and link a WebGL2 program
function buildProgram(gl, vertSrc, fragSrc) {
    const vert = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vert, vertSrc);
    gl.compileShader(vert);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
        throw new Error('Vert shader: ' + gl.getShaderInfoLog(vert));
    }
    const frag = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(frag, fragSrc);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
        throw new Error('Frag shader: ' + gl.getShaderInfoLog(frag));
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('Link: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
}

export default class ReactionDiffusion {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {number} width
     * @param {number} height
     * @param {string} computeFragSrc — GLSL source of glsl/compute.frag
     */
    constructor(renderer, width, height, computeFragSrc) {
        this._renderer = renderer;
        this._width    = width;
        this._height   = height;

        const gl = renderer.getContext();

        // Two ping-pong RGBA32F framebuffers
        this._fbo = [this._makeFBO(gl, width, height), this._makeFBO(gl, width, height)];
        this._read = 0;

        // Compile the compute program
        this._prog    = buildProgram(gl, VERT, computeFragSrc);
        this._uniforms = this._cacheUniforms(gl, this._prog, [
            'u_state', 'u_texel', 'u_fk', 'u_dt', 'u_anisotropy'
        ]);

        // Full-screen quad
        this._quad = this._makeQuad(gl);

        // Seed: splat B near center
        this._seed(gl);

        // Default params
        this._fk        = [0.026, 0.051];
        this._anisotropy = 1.0;
        this._dt        = 1.0;
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    setRegime(key) {
        const p = REGIME_PARAMS[key] || REGIME_PARAMS.RETICULATED;
        this._fk         = p.fk;
        this._anisotropy = p.anisotropy;
    }

    /** Advance n Gray-Scott substeps. */
    step(n = 1) {
        const gl   = this._renderer.getContext();
        const prog = this._prog;
        gl.useProgram(prog);

        const w = 1.0 / this._width;
        const h = 1.0 / this._height;

        for (let i = 0; i < n; i++) {
            const src = this._fbo[this._read];
            const dst = this._fbo[1 - this._read];

            gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
            gl.viewport(0, 0, this._width, this._height);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, src.tex);
            gl.uniform1i(this._uniforms.u_state, 0);
            gl.uniform2f(this._uniforms.u_texel, w, h);
            gl.uniform2f(this._uniforms.u_fk, this._fk[0], this._fk[1]);
            gl.uniform1f(this._uniforms.u_dt, this._dt);
            gl.uniform1f(this._uniforms.u_anisotropy, this._anisotropy);

            this._drawQuad(gl);
            this._read = 1 - this._read;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /** Return the current state as a WebGLTexture (wrap in THREE.Texture if needed). */
    getTexture() {
        return this._fbo[this._read].tex;
    }

    /** Return the current state as a THREE.Texture for use in Three.js materials. */
    getThreeTexture() {
        if (!this._threeTexCache) {
            // Wrap the raw GL texture in a minimal Three.js texture object
            const tex = new THREE.Texture();
            tex.image = { width: this._width, height: this._height };
            // We bypass Three.js texture upload and bind the raw GL tex manually
            tex.__webglTexture = this.getTexture();
            tex.__needsUpdate  = false;
            this._threeTexCache = tex;
        }
        this._threeTexCache.__webglTexture = this.getTexture();
        return this._threeTexCache;
    }

    /** Reset and re-seed the field. */
    reset() {
        const gl = this._renderer.getContext();
        this._seed(gl);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    _makeFBO(gl, w, h) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { tex, fb };
    }

    _seed(gl) {
        // Fill A=1, B=0, then splat B noise near the center
        const w = this._width, h = this._height;
        const data = new Float32Array(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            data[i * 4 + 0] = 1.0;  // A
            data[i * 4 + 1] = 0.0;  // B
            data[i * 4 + 2] = 0.0;
            data[i * 4 + 3] = 1.0;
        }
        // Noise splat of B in the center quarter
        for (let y = h * 0.35; y < h * 0.65; y++) {
            for (let x = w * 0.35; x < w * 0.65; x++) {
                if (Math.random() < 0.35) {
                    const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
                    data[idx + 0] = 0.5;   // A
                    data[idx + 1] = 0.25;  // B seed
                }
            }
        }
        for (let i = 0; i < 2; i++) {
            gl.bindTexture(gl.TEXTURE_2D, this._fbo[i].tex);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, data);
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
        this._read = 0;
    }

    _cacheUniforms(gl, prog, names) {
        const map = {};
        for (const name of names) map[name] = gl.getUniformLocation(prog, name);
        return map;
    }

    _makeQuad(gl) {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(this._prog, 'a_position');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        return vao;
    }

    _drawQuad(gl) {
        gl.bindVertexArray(this._quad);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }
}
