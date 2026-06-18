// species/morphlab.glsl — Regime 6: Morph Lab
// Ball python morph community — THE CHAOS MODE.
//
// Field:   Base blotch RD field (F=0.034  k=0.060) corrupted by six
//          stackable mutation operators, each driven by a [0,1] uniform.
// Lattice: density=65  jitter=0.40  levels=4
//
// Base palette:   ["#1a1206","#4a3414","#7a5a2a","#b58d4a","#e8d39a"]
// Banana palette: ["#241a2e","#5a3a6e","#c9a0e0","#ffe27a"]
//
// Mutation operators (stackable, each u_morph* ∈ [0,1]):
//   u_morphPied      — white-out: zero the field inside random circular patches
//   u_morphClown     — drip: downward advection smear (pass vertical shift)
//   u_morphSpider    — wobble: add phase noise, thin and stress the lines
//   u_morphBanana    — palette shift to lavender/yellow + dark freckles
//   u_morphPastel    — contrast lift + highlight blow-out
//   u_morphAxanthic  — desaturate to silver greyscale

const vec2  MORPHLAB_FK      = vec2(0.034, 0.060);

const float MORPHLAB_DENSITY = 65.0;
const float MORPHLAB_JITTER  = 0.40;
const float MORPHLAB_LEVELS  = 4.0;

const vec3 MORPHLAB_PALETTE_BASE[5] = vec3[5](
    vec3(0.102, 0.071, 0.024),   // #1a1206
    vec3(0.290, 0.204, 0.078),   // #4a3414
    vec3(0.478, 0.353, 0.165),   // #7a5a2a
    vec3(0.710, 0.553, 0.290),   // #b58d4a
    vec3(0.910, 0.827, 0.604)    // #e8d39a
);
const vec3 MORPHLAB_PALETTE_BANANA[4] = vec3[4](
    vec3(0.141, 0.102, 0.180),   // #241a2e — deep purple
    vec3(0.353, 0.227, 0.431),   // #5a3a6e — mid purple
    vec3(0.788, 0.627, 0.878),   // #c9a0e0 — lavender
    vec3(1.000, 0.886, 0.478)    // #ffe27a — banana yellow
);

// ─── Mutation operators ───────────────────────────────────────────────────────

// PIED: zero the field inside random circular patches (white spotting)
float morph_pied(vec2 uv, float strength) {
    if (strength < 0.001) return 1.0;
    // Several fixed pseudo-random patch centres
    float mask = 1.0;
    vec2 centres[4] = vec2[4](
        vec2(0.22, 0.48), vec2(0.55, 0.52),
        vec2(0.75, 0.45), vec2(0.40, 0.55)
    );
    float radius = 0.08 + strength * 0.18;
    for (int i = 0; i < 4; i++) {
        float d = distance(uv, centres[i]);
        mask = min(mask, smoothstep(0.0, radius, d));
    }
    return mix(1.0, mask, strength);
}

// CLOWN: vertical smear — shift the sample UV downward proportional to strength
vec2 morph_clown(vec2 uv, float strength) {
    return vec2(uv.x, uv.y + strength * 0.08 * sin(uv.x * 18.0));
}

// SPIDER: add phase noise to the field UV (makes the lines jittery/stressed)
vec2 morph_spider(vec2 uv, float strength) {
    float noise = hash21(floor(uv * 40.0)) * 2.0 - 1.0;
    return uv + vec2(noise, noise) * strength * 0.015;
}

// PASTEL: lift contrast — compress the field range toward 0.5
float morph_pastel(float v, float strength) {
    return mix(v, 0.5 + (v - 0.5) * 0.4, strength);
}

// AXANTHIC: desaturate — caller should apply to the final RGB
vec3 morph_axanthic(vec3 col, float strength) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    return mix(col, vec3(lum), strength);
}

// BANANA: palette chooser — at strength > 0 blend base into banana
vec3 morphlab_palette(float v, float banana, float pastel, float axanthic) {
    // Base palette lookup
    float t   = clamp(v, 0.0, 1.0) * 4.0;
    int   idx = int(floor(t));
    float f   = fract(t);
    idx       = clamp(idx, 0, 3);
    vec3 base = mix(MORPHLAB_PALETTE_BASE[idx], MORPHLAB_PALETTE_BASE[idx + 1], f);

    // Banana palette lookup (4 stops)
    float tb  = clamp(v, 0.0, 1.0) * 3.0;
    int   ib  = clamp(int(floor(tb)), 0, 2);
    float fb  = fract(tb);
    vec3 ban  = mix(MORPHLAB_PALETTE_BANANA[ib], MORPHLAB_PALETTE_BANANA[ib + 1], fb);

    vec3 col = mix(base, ban, clamp(banana, 0.0, 1.0));
    col = morph_pastel(col.r, pastel) * vec3(1.0);  // scalar pastel on each channel
    col = vec3(
        morph_pastel(col.r, pastel),
        morph_pastel(col.g, pastel),
        morph_pastel(col.b, pastel)
    );
    return morph_axanthic(col, axanthic);
}
