// display.frag — Quantize + Palette + Shading display pass
//
// Full pipeline:
//   voronoiScale  →  sample field at cell center  →  quantize  →  palette LUT  →  shadeScale
//
// This shader handles all seven regimes via the u_regime uniform.
// Procedural regimes (gaboon, adder, coral) generate their own field inline;
// RD regimes read from u_rdState (the ping-pong render target).
//
// Depends on:  utils.glsl, shading.glsl  (concatenated before compilation)

#version 300 es
precision highp float;

// ─── Uniforms ────────────────────────────────────────────────────────────────
uniform sampler2D u_rdState;      // Gray-Scott FBO output (.r=A .g=B)
uniform sampler2D u_palette;      // 1×256 species LUT DataTexture
uniform int       u_regime;       // 0..6 species index
uniform vec2      u_resolution;
uniform vec3      u_lightDir;     // normalised light direction

// Regime-specific parameters (set these from SpeciesPalettes.js per regime)
uniform float u_density;
uniform float u_jitter;
uniform float u_levels;

// Adder-specific
uniform int   u_adderMorph;       // 0=grey 1=rust 2=melanistic

// Coral-specific
uniform bool  u_coralMimic;       // false=true coral, true=scarlet king

// Emerald-specific
uniform float u_maturity;         // 0=juvenile, 1=adult

// Morph-lab mutation sliders (all [0,1])
uniform float u_morphPied;
uniform float u_morphClown;
uniform float u_morphSpider;
uniform float u_morphBanana;
uniform float u_morphPastel;
uniform float u_morphAxanthic;

// Pattern-transfer override
uniform bool      u_useLens;
uniform sampler2D u_lensField;    // external incoming field for snakeskin_lens

out vec4 fragColor;

// ─── Inline copies of utils / species / shading ───────────────────────────
// (In the build pipeline these are concatenated from their respective .glsl files.)
// See glsl/utils.glsl, glsl/shading.glsl, glsl/species/*.glsl

// Forward declarations (implemented via includes in build)
// ScaleCell voronoiScale(vec2 uv, float density, float jitter, float levels);
// float     quantize(float v, float levels);
// vec3      shadeScale(vec3 col, ScaleCell c, vec2 uv, float density, vec3 lightDir);

// ─── Field sampling per regime ────────────────────────────────────────────────
float sampleField(vec2 center) {
    // Regimes 0, 3, 5, 6 use Gray-Scott output  (B channel encodes the pattern)
    if (u_regime == 0 || u_regime == 3 || u_regime == 5 || u_regime == 6) {
        vec2 uv = center;

        // Morph-lab spider wobble: jitter the sample point
        if (u_regime == 6 && u_morphSpider > 0.001) {
            float noise = (hash21(floor(uv * 40.0)) * 2.0 - 1.0);
            uv += vec2(noise) * u_morphSpider * 0.015;
        }
        // Morph-lab clown drip: smear downward
        if (u_regime == 6 && u_morphClown > 0.001) {
            uv.y += u_morphClown * 0.08 * sin(uv.x * 18.0);
        }

        float v = texture(u_rdState, uv).g;

        // Diamondback: mask to diamond windows
        if (u_regime == 3) {
            float spacing = 0.12;
            float width   = 0.055;
            float height  = 0.10;
            float xc = round(center.x / spacing) * spacing;
            float dx = abs(center.x - xc) / width;
            float dy = abs(center.y - 0.5) / height;
            v *= 1.0 - smoothstep(0.85, 1.0, dx + dy);
        }

        // Morph-lab pied white-out
        if (u_regime == 6 && u_morphPied > 0.001) {
            vec2 centres[4] = vec2[4](
                vec2(0.22, 0.48), vec2(0.55, 0.52),
                vec2(0.75, 0.45), vec2(0.40, 0.55)
            );
            float radius = 0.08 + u_morphPied * 0.18;
            float mask = 1.0;
            for (int i = 0; i < 4; i++) {
                mask = min(mask, smoothstep(0.0, radius, distance(center, centres[i])));
            }
            v *= mix(1.0, mask, u_morphPied);
        }
        return v;
    }

    // Regime 1: Gaboon — Truchet hourglass field
    if (u_regime == 1) {
        vec2  g      = center * u_density;
        vec2  cell   = floor(g);
        vec2  local  = fract(g) - 0.5;
        float h      = hash21(cell);
        float arc    = (h > 0.5) ? abs(local.x + local.y) : abs(local.x - local.y);
        float band   = smoothstep(0.08, 0.18, arc) - smoothstep(0.30, 0.42, arc);
        float corner = smoothstep(0.38, 0.45, length(abs(local) - vec2(0.45)));
        return clamp(band + (1.0 - corner) * 0.35, 0.0, 1.0);
    }

    // Regime 2: Adder — zigzag ribbon
    if (u_regime == 2) {
        float phase     = center.x * 14.0;
        float zigzag    = abs(fract(phase) * 2.0 - 1.0);
        float ridgeY    = 0.5 + (zigzag - 0.5) * 0.36;
        float dist      = abs(center.y - ridgeY);
        return 1.0 - smoothstep(0.044, 0.055, dist);
    }

    // Regime 4: Coral — 1D banding
    if (u_regime == 4) {
        float period = 0.22;
        float p      = fract(center.x / period);
        if (!u_coralMimic) {
            if (p < 0.30) return 1.0;   // red
            if (p < 0.40) return 0.5;   // yellow
            if (p < 0.60) return 0.0;   // black
            if (p < 0.70) return 0.5;   // yellow
            return 1.0;                 // red
        } else {
            if (p < 0.30) return 1.0;   // red
            if (p < 0.50) return 0.0;   // black
            if (p < 0.60) return 0.5;   // yellow
            if (p < 0.80) return 0.0;   // black
            return 1.0;                 // red
        }
    }

    return 0.0;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // 1. Scale lattice
    ScaleCell c = voronoiScale(uv, u_density, u_jitter, u_levels);

    // 2. Sample field at cell CENTER (not the fragment)
    float v;
    if (u_useLens) {
        v = texture(u_lensField, c.center).r;
    } else {
        v = sampleField(c.center);
    }

    // 3. Posterize
    v = quantize(v, c.levels);

    // 4. Palette lookup
    vec3 col;
    if (u_regime == 6) {
        // Morph-lab palette with mutation modifiers
        float tb  = clamp(v, 0.0, 1.0) * 3.0;
        int   ib  = clamp(int(floor(tb)), 0, 2);
        float fb  = fract(tb);
        // Pull from DataTexture (u_palette) as the canonical path
        col = texture(u_palette, vec2(v, 0.5)).rgb;
        // Apply pastel and axanthic here (banana is baked into the DataTexture)
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, mix(col, vec3(0.5), 0.6), u_morphPastel);
        col = mix(col, vec3(lum), u_morphAxanthic);
    } else {
        col = texture(u_palette, vec2(v, 0.5)).rgb;
    }

    // Emerald vertebral flash overlay
    if (u_regime == 5) {
        float spacing     = 0.08;
        float xPhase      = fract(uv.x / spacing);
        float lateralDist = abs(uv.y - 0.5);
        float flash       = (xPhase < 0.12) ? clamp(1.0 - lateralDist / 0.04, 0.0, 1.0) : 0.0;
        vec3  boneWhite   = vec3(0.945, 0.925, 0.878);
        col = mix(col, boneWhite, flash * 0.8);
    }

    // 5. Shade: keel specular + imbrication
    col = shadeScale(col, c, uv, u_density, u_lightDir);

    fragColor = vec4(col, 1.0);
}
