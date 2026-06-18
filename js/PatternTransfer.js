/**
 * PatternTransfer.js
 *
 * The pattern-transfer rig — the "mix with other context" superpower.
 *
 * Wraps the snakeskin_lens() shader so any external texture (fluid dynamics
 * output, strange-attractor density map, another ShaderForge repo's framebuffer)
 * can be piped in as the fill field while keeping the serpent scale structure
 * and any species palette.
 *
 * Three fully decoupled layers:
 *   TOPOLOGY  — which species lattice + regime parameters (the structure)
 *   FILL      — what fills the field: RD | image texture | external renderer output
 *   PALETTE   — any 1×256 LUT DataTexture (species-accurate or invented)
 *
 * Usage:
 *   const xfer = new PatternTransfer(renderer, 1024, 1024);
 *
 *   // Pipe an external field in (e.g. fluid_dynamics velocity magnitude)
 *   xfer.setFillField(externalTexture);
 *   xfer.setTopology(0);              // reticulated python structure
 *   xfer.setPalette(vaporwavePalette); // any LUT
 *   xfer.render();
 *
 *   displayMesh.material.map = xfer.output;
 *
 * Export helpers:
 *   xfer.normalMap        — scale lattice as a packed normal map
 *   xfer.displacementMap  — scalar displacement (1=keel ridge, 0=edge)
 */

import * as THREE from 'three';
import { paletteForRegime }  from './SpeciesPalettes.js';

// Lens vertex shader
const LENS_VERT = /* glsl */`#version 300 es
in  vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.0, 1.0); }`;

// Lens fragment shader — mirrors glsl/lens.glsl but inlined for standalone use.
// The build pipeline can substitute the full concatenated GLSL here.
const LENS_FRAG = /* glsl */`#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_fillField;
uniform sampler2D u_palette;
uniform float     u_density;
uniform float     u_jitter;
uniform float     u_levels;
uniform vec3      u_lightDir;
uniform bool      u_exportNormal;
uniform bool      u_exportDisplacement;

vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float quantize(float v, float levels) {
    return floor(v * levels + 0.5) / levels;
}

struct ScaleCell { vec2 center; vec2 normal; float id; float levels; };

ScaleCell voronoiScale(vec2 uv, float density, float jitter, float levels) {
    vec2 g  = uv * density;
    vec2 ci = floor(g);
    vec2 bestP = vec2(0.0); vec2 bestId = vec2(0.0); float bestD = 1e9;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 nb  = ci + vec2(float(i), float(j));
        vec2 off = hash22(nb) * jitter;
        vec2 p   = nb + 0.5 + off;
        float d  = distance(g, p);
        if (d < bestD) { bestD = d; bestP = p; bestId = nb; }
    }
    ScaleCell c;
    c.center = bestP / density;
    c.id     = hash21(bestId);
    c.levels = levels;
    float edge = bestD;
    float t    = 1.0 - smoothstep(0.0, 0.45, edge);
    c.normal   = vec2(sin(bestP.x * 6.28318), cos(bestP.y * 6.28318)) * t * 0.6;
    return c;
}

vec3 shadeScale(vec3 col, ScaleCell c, vec2 uv, float density, vec3 lightDir) {
    vec3 N    = normalize(vec3(c.normal.x, 1.0, c.normal.y));
    vec3 view = vec3(0.0, 0.0, 1.0);
    vec3 H    = normalize(lightDir + view);
    float spec  = pow(max(dot(N, H), 0.0), 24.0) * 0.35;
    float edge  = smoothstep(0.55, 0.85, distance(uv, c.center) * density);
    col  *= mix(1.0, 0.50, edge);
    col  += (c.id - 0.5) * 0.06;
    col  += vec3(spec);
    return clamp(col, 0.0, 1.0);
}

void main() {
    ScaleCell c = voronoiScale(v_uv, u_density, u_jitter, u_levels);

    if (u_exportNormal) {
        vec3 N = normalize(vec3(c.normal.x, 1.0, c.normal.y));
        fragColor = vec4(N * 0.5 + 0.5, 1.0);
        return;
    }
    if (u_exportDisplacement) {
        float d = distance(v_uv, c.center) * u_density;
        float disp = 1.0 - smoothstep(0.0, 0.5, d);
        fragColor = vec4(disp, disp, disp, 1.0);
        return;
    }

    float v   = texture(u_fillField, c.center).r;
    v         = quantize(v, c.levels);
    vec3 col  = texture(u_palette, vec2(v, 0.5)).rgb;
    col       = shadeScale(col, c, v_uv, u_density, u_lightDir);
    fragColor = vec4(col, 1.0);
}`;

const REGIME_PARAMS = [
    [90.0, 0.45, 3.0],  // 0 reticulated
    [60.0, 0.30, 5.0],  // 1 gaboon
    [50.0, 0.35, 2.0],  // 2 adder
    [55.0, 0.35, 3.0],  // 3 diamondback
    [30.0, 0.20, 3.0],  // 4 coral
    [80.0, 0.40, 4.0],  // 5 emerald
    [65.0, 0.40, 4.0],  // 6 morphlab
];

export default class PatternTransfer {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {number} width
     * @param {number} height
     */
    constructor(renderer, width, height) {
        this._renderer = renderer;

        const mkRT = () => new THREE.WebGLRenderTarget(width, height, {
            type: THREE.FloatType, format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
            depthBuffer: false,
        });

        this.output          = mkRT();
        this.normalMap       = mkRT();
        this.displacementMap = mkRT();

        // Placeholder 1×1 black fill
        const blackData = new Float32Array([0, 0, 0, 1]);
        const blackTex  = new THREE.DataTexture(blackData, 1, 1, THREE.RGBAFormat, THREE.FloatType);
        blackTex.needsUpdate = true;

        this._fillField = blackTex;
        this._palette   = paletteForRegime(0);
        this._params    = REGIME_PARAMS[0];
        this._lightDir  = new THREE.Vector3(0.3, 0.6, 0.7).normalize();

        this._mat = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader:   LENS_VERT,
            fragmentShader: LENS_FRAG,
            uniforms: {
                u_fillField:         { value: this._fillField },
                u_palette:           { value: this._palette   },
                u_density:           { value: this._params[0] },
                u_jitter:            { value: this._params[1] },
                u_levels:            { value: this._params[2] },
                u_lightDir:          { value: this._lightDir  },
                u_exportNormal:      { value: false },
                u_exportDisplacement:{ value: false },
            },
        });

        const quad    = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat);
        this._scene   = new THREE.Scene();
        this._camera  = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._scene.add(quad);
    }

    /** Set the fill field texture (any greyscale or RGBA source). */
    setFillField(tex) {
        this._fillField = tex;
        this._mat.uniforms.u_fillField.value = tex;
    }

    /** Set the species topology (0–6). Updates density/jitter/levels. */
    setTopology(regime) {
        const p = REGIME_PARAMS[regime] || REGIME_PARAMS[0];
        this._params = p;
        this._mat.uniforms.u_density.value = p[0];
        this._mat.uniforms.u_jitter.value  = p[1];
        this._mat.uniforms.u_levels.value  = p[2];
    }

    /** Set the palette LUT DataTexture. */
    setPalette(tex) {
        this._palette = tex;
        this._mat.uniforms.u_palette.value = tex;
    }

    /** Set the light direction (THREE.Vector3, will be normalised). */
    setLightDir(v) {
        this._lightDir.copy(v).normalize();
    }

    /** Render the lens output to this.output. */
    render() {
        this._mat.uniforms.u_exportNormal.value       = false;
        this._mat.uniforms.u_exportDisplacement.value = false;
        this._renderer.setRenderTarget(this.output);
        this._renderer.render(this._scene, this._camera);

        // Also bake the helper maps
        this._mat.uniforms.u_exportNormal.value = true;
        this._renderer.setRenderTarget(this.normalMap);
        this._renderer.render(this._scene, this._camera);

        this._mat.uniforms.u_exportNormal.value       = false;
        this._mat.uniforms.u_exportDisplacement.value = true;
        this._renderer.setRenderTarget(this.displacementMap);
        this._renderer.render(this._scene, this._camera);

        this._renderer.setRenderTarget(null);
    }
}
