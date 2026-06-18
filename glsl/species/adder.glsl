// species/adder.glsl — Regime 2: Adder Zigzag
// Vipera berus — single dorsal lightning ribbon.
//
// Field:   Directional triangle wave running down the spine (procedural).
//          Amplitude ~ 0.18 of body width; no Gray-Scott.
//          Three palette modes: grey (default), rust (red female morph),
//          melanistic (all-black).
// Lattice: density=50  jitter=0.35  levels=2  (hard two-tone)
// Palette grey:      ["#1a1a1a","#b9bcc0"]
// Palette rust:      ["#2a0f08","#a8502f"]
// Palette melanistic:["#050505","#1f1f1f"]

const float ADDER_DENSITY = 50.0;
const float ADDER_JITTER  = 0.35;
const float ADDER_LEVELS  = 2.0;

// Spine UV convention: uv.x = along body (0=head, 1=tail), uv.y = around body (0.5=dorsal midline)
const float ADDER_ZIGZAG_FREQ      = 14.0;  // oscillations along body length
const float ADDER_ZIGZAG_AMPLITUDE = 0.18;  // fraction of lateral body width
const float ADDER_RIBBON_WIDTH     = 0.055; // half-width of the dark ribbon

// Palette definitions — 0 = dark ground, 1 = light ribbon (or vice versa for melanistic)
const vec3 ADDER_PALETTE_GREY[2] = vec3[2](
    vec3(0.102, 0.102, 0.102),   // #1a1a1a — dark grey ground
    vec3(0.725, 0.737, 0.753)    // #b9bcc0 — silver body
);
const vec3 ADDER_PALETTE_RUST[2] = vec3[2](
    vec3(0.165, 0.059, 0.031),   // #2a0f08 — dark red-brown
    vec3(0.659, 0.314, 0.184)    // #a8502f — rust orange
);
const vec3 ADDER_PALETTE_MELANISTIC[2] = vec3[2](
    vec3(0.020, 0.020, 0.020),   // #050505 — near-black
    vec3(0.122, 0.122, 0.122)    // #1f1f1f — very dark grey
);

// ─── Zigzag field ────────────────────────────────────────────────────────────
// Returns 1.0 inside the dark dorsal ribbon, 0.0 outside.
// uv.x is the longitudinal (along-body) coordinate.
// uv.y is the lateral coordinate (0 = left flank, 0.5 = dorsal, 1 = right flank).
float adder_field(vec2 uv) {
    // Triangular wave along the spine
    float phase  = uv.x * ADDER_ZIGZAG_FREQ;
    float zigzag = abs(fract(phase) * 2.0 - 1.0);  // 0..1 triangle wave
    float ridgeY = 0.5 + (zigzag - 0.5) * ADDER_ZIGZAG_AMPLITUDE * 2.0;

    float dist = abs(uv.y - ridgeY);
    return 1.0 - smoothstep(ADDER_RIBBON_WIDTH * 0.8, ADDER_RIBBON_WIDTH, dist);
}

// morph: 0=grey, 1=rust, 2=melanistic
vec3 adder_palette(float v, int morph) {
    if (morph == 1) return mix(ADDER_PALETTE_RUST[0],       ADDER_PALETTE_RUST[1],       v);
    if (morph == 2) return mix(ADDER_PALETTE_MELANISTIC[0], ADDER_PALETTE_MELANISTIC[1], v);
    return mix(ADDER_PALETTE_GREY[0], ADDER_PALETTE_GREY[1], v);
}
