// lens.glsl — snakeskin_lens: pattern-transfer rig
//
// The superpower of this system: fully decoupled topology / fill / palette.
// Import this shader snippet into any display pipeline that wants to drape
// serpent scales over an arbitrary incoming field.
//
// Depends on:  utils.glsl (voronoiScale, quantize, ScaleCell)
//              shading.glsl (shadeScale)
//
// uniforms expected by the host program:
//   sampler2D u_incomingField  — any greyscale field (RD, fluid, attractor…)
//   sampler2D u_palette        — 1×256 species LUT DataTexture
//   int       u_topology       — 0..6 regime index (drives density/jitter/levels)
//   vec3      u_lightDir       — normalised light direction

// ─── Regime lookup tables ────────────────────────────────────────────────────
// Packed as vec3(density, jitter, levels) for each of the 7 regimes.
// Index matches the seven species (0=reticulated … 6=morphlab).
vec3 regimeParams(int regime) {
    if (regime == 0) return vec3(90.0, 0.45, 3.0);   // reticulated cathedral
    if (regime == 1) return vec3(60.0, 0.30, 5.0);   // gaboon geometry
    if (regime == 2) return vec3(50.0, 0.35, 2.0);   // adder zigzag
    if (regime == 3) return vec3(55.0, 0.35, 3.0);   // diamondback chain
    if (regime == 4) return vec3(30.0, 0.20, 3.0);   // coral mimicry rings
    if (regime == 5) return vec3(80.0, 0.40, 4.0);   // emerald flecks
    /*  6 = morph lab */
    return vec3(65.0, 0.40, 4.0);
}

// ─── The lens ────────────────────────────────────────────────────────────────
//
// Call this from your display fragment shader instead of writing a bespoke
// quantize+shade pipeline for every project.

// #include "utils.glsl"    (provide ScaleCell, voronoiScale, quantize)
// #include "shading.glsl"  (provide shadeScale)

vec3 snakeskin_lens(
    vec2      uv,
    sampler2D incomingField,
    int       topology,
    sampler2D palette,
    vec3      lightDir
) {
    vec3  p    = regimeParams(topology);
    float density = p.x;
    float jitter  = p.y;
    float levels  = p.z;

    // 1. Find the scale cell this fragment belongs to.
    ScaleCell c = voronoiScale(uv, density, jitter, levels);

    // 2. Sample the fill field at the CELL CENTER — the quantization key.
    //    This is what makes every texel inside a scale share one colour.
    float v = texture(incomingField, c.center).r;

    // 3. Posterize to the cell's discrete levels.
    v = quantize(v, c.levels);

    // 4. Map through the species palette LUT.
    vec3 col = texture(palette, vec2(v, 0.5)).rgb;

    // 5. Light the keel ridge and add the imbrication shadow.
    return shadeScale(col, c, uv, density, lightDir);
}

// ─── Two-species hybrid blend ─────────────────────────────────────────────
//
// Blend two regimes' field values (and optionally their palettes) for a
// hybrid skin that never evolved.

vec3 snakeskin_blend(
    vec2      uv,
    sampler2D fieldA,
    sampler2D fieldB,
    sampler2D paletteA,
    sampler2D paletteB,
    int       topologyA,
    int       topologyB,
    float     t,            // 0 = pure A, 1 = pure B
    vec3      lightDir
) {
    vec3  pA = regimeParams(topologyA);
    ScaleCell cA = voronoiScale(uv, pA.x, pA.y, mix(pA.z, regimeParams(topologyB).z, t));

    float vA = texture(fieldA, cA.center).r;
    float vB = texture(fieldB, cA.center).r;
    float v  = quantize(mix(vA, vB, t), cA.levels);

    vec3 colA = texture(paletteA, vec2(v, 0.5)).rgb;
    vec3 colB = texture(paletteB, vec2(v, 0.5)).rgb;
    vec3 col  = mix(colA, colB, t);

    return shadeScale(col, cA, uv, pA.x, lightDir);
}

// ─── Normal / displacement export ────────────────────────────────────────────
//
// Returns the scale lattice as a 2-channel normal map (.rg = XZ normal)
// so downstream repos can drape physical scales over their own output
// without running the full quantize pipeline.

vec2 scaleLatticeNormal(vec2 uv, int topology) {
    vec3  p = regimeParams(topology);
    ScaleCell c = voronoiScale(uv, p.x, p.y, p.z);
    return c.normal * 0.5 + 0.5;   // pack to [0,1] for texture storage
}

// Scalar displacement: 1.0 at keel ridge center, 0.0 at scale edge.
float scaleLatticeDisplacement(vec2 uv, int topology) {
    vec3  p = regimeParams(topology);
    ScaleCell c = voronoiScale(uv, p.x, p.y, p.z);
    float d = distance(uv, c.center) * p.x;
    return 1.0 - smoothstep(0.0, 0.5, d);
}
