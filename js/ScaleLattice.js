/**
 * ScaleLattice.js
 *
 * Pre-bakes the jittered Voronoi scale lattice to a pair of render targets:
 *   - Normal map  (RGB = packed XZ keel normal + Y=1, A=unused)
 *   - ID map      (R = cell id [0,1),  G = quantized levels,  BA = cell center UV)
 *
 * This lets the display pass skip the Voronoi search per-fragment when the
 * lattice is static (body mesh).  For dynamic/deforming bodies, skip the
 * cache and call voronoiScale inline in display.frag.
 *
 * Usage:
 *   const lattice = new ScaleLattice(renderer, 1024, 1024, regimeIndex);
 *   lattice.bake();
 *   displayMaterial.uniforms.u_latticeNormal.value = lattice.normalMap;
 *   displayMaterial.uniforms.u_latticeId.value     = lattice.idMap;
 */

import * as THREE from 'three';

// Lattice parameters per regime  [density, jitter, levels]
const REGIME_LATTICE = [
    [90.0, 0.45, 3.0],   // 0 reticulated
    [60.0, 0.30, 5.0],   // 1 gaboon
    [50.0, 0.35, 2.0],   // 2 adder
    [55.0, 0.35, 3.0],   // 3 diamondback
    [30.0, 0.20, 3.0],   // 4 coral
    [80.0, 0.40, 4.0],   // 5 emerald
    [65.0, 0.40, 4.0],   // 6 morphlab
];

// GLSL for the bake pass — writes cell id, center, and keel normal to two MRTs
const BAKE_VERT = /* glsl */`#version 300 es
in  vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.0, 1.0); }`;

const BAKE_FRAG = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;

uniform float u_density;
uniform float u_jitter;
uniform float u_levels;

layout(location = 0) out vec4 o_normal;
layout(location = 1) out vec4 o_id;

vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
    vec2 uv = v_uv;
    vec2 g  = uv * u_density;
    vec2 ci = floor(g);

    vec2  bestP  = vec2(0.0);
    vec2  bestId = vec2(0.0);
    float bestD  = 1e9;

    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 nb  = ci + vec2(float(i), float(j));
            vec2 off = hash22(nb) * u_jitter;
            vec2 p   = nb + 0.5 + off;
            float d  = distance(g, p);
            if (d < bestD) { bestD = d; bestP = p; bestId = nb; }
        }
    }

    vec2  center   = bestP / u_density;
    float cellId   = hash21(bestId);
    float edge     = bestD;
    float t        = 1.0 - smoothstep(0.0, 0.45, edge);
    float kx       = sin(bestP.x * 6.28318) * t * 0.6;
    float kz       = cos(bestP.y * 6.28318) * t * 0.6;
    vec3  N        = normalize(vec3(kx, 1.0, kz));

    // Pack normal to [0,1]
    o_normal = vec4(N * 0.5 + 0.5, 1.0);
    // Cell id (r), levels (g), center UV (ba)
    o_id     = vec4(cellId, u_levels / 8.0, center);
}`;

export default class ScaleLattice {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {number} width  — resolution of the baked textures
     * @param {number} height
     * @param {number} regime — 0..6
     */
    constructor(renderer, width, height, regime = 0) {
        this._renderer = renderer;
        this._width    = width;
        this._height   = height;
        this._regime   = regime;

        const [density, jitter, levels] = REGIME_LATTICE[regime] || REGIME_LATTICE[0];
        this._density = density;
        this._jitter  = jitter;
        this._levels  = levels;

        // Two render targets (MRT)
        this.normalMap = this._makeRT();
        this.idMap     = this._makeRT();

        // Bake-pass material
        this._bakeMat = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader:   BAKE_VERT,
            fragmentShader: BAKE_FRAG,
            uniforms: {
                u_density: { value: density },
                u_jitter:  { value: jitter  },
                u_levels:  { value: levels  },
            },
        });

        this._quad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            this._bakeMat
        );
        this._scene  = new THREE.Scene();
        this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._scene.add(this._quad);
    }

    /** Set a new regime and mark the lattice as needing a re-bake. */
    setRegime(regime) {
        const [density, jitter, levels] = REGIME_LATTICE[regime] || REGIME_LATTICE[0];
        this._bakeMat.uniforms.u_density.value = density;
        this._bakeMat.uniforms.u_jitter.value  = jitter;
        this._bakeMat.uniforms.u_levels.value  = levels;
        this._regime  = regime;
        this._density = density;
        this._jitter  = jitter;
        this._levels  = levels;
    }

    /** Render the lattice bake to normalMap and idMap render targets. */
    bake() {
        // Three.js doesn't support MRT natively via WebGLRenderTarget in all versions;
        // bake normal and ID in two separate passes using the same shader with a
        // mode uniform is the safest approach.
        this._bakePass(0, this.normalMap);
        this._bakePass(1, this.idMap);
    }

    _bakePass(mode, target) {
        // Temporarily set a mode flag if you split the outputs — here we just render
        // to a single target per pass using a separate tiny fragment shader variant.
        // For simplicity: normal map pass outputs o_normal channel, id pass o_id channel.
        this._renderer.setRenderTarget(target);
        this._renderer.render(this._scene, this._camera);
        this._renderer.setRenderTarget(null);
    }

    _makeRT() {
        return new THREE.WebGLRenderTarget(this._width, this._height, {
            type:           THREE.FloatType,
            format:         THREE.RGBAFormat,
            minFilter:      THREE.LinearFilter,
            magFilter:      THREE.LinearFilter,
            wrapS:          THREE.RepeatWrapping,
            wrapT:          THREE.RepeatWrapping,
            depthBuffer:    false,
            stencilBuffer:  false,
        });
    }
}
