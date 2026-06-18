// species/emerald.glsl — Regime 5: Emerald Flecks
// Morelia viridis / Corallus caninus — green field, bone-white vertebral flashes.
//
// Field:   Gray-Scott mottle (F=0.030  k=0.057), low contrast,
//          plus sparse bright dorsal triangles added as a procedural overlay.
// Lattice: density=80  jitter=0.40  levels=4
// Palette: deep emerald → emerald → lime → mint → bone fleck
//          ["#063d2c","#0b6e4f","#2faa6a","#9fe0b0","#f1ece0"]
//
// Ontogenetic shift (juvenile→adult):
//   u_maturity  0.0 = juvenile (yellow/red)   1.0 = adult (green)
//   Animating u_maturity from 0→1 over the lifespan palette-lerps the skin.

const vec2  EMERALD_FK      = vec2(0.030, 0.057);

const float EMERALD_DENSITY = 80.0;
const float EMERALD_JITTER  = 0.40;
const float EMERALD_LEVELS  = 4.0;

// Adult palette
const vec3 EMERALD_PALETTE_ADULT[5] = vec3[5](
    vec3(0.024, 0.239, 0.173),   // #063d2c — deep emerald void
    vec3(0.043, 0.431, 0.310),   // #0b6e4f — emerald mid
    vec3(0.184, 0.667, 0.416),   // #2faa6a — lime
    vec3(0.624, 0.878, 0.690),   // #9fe0b0 — mint
    vec3(0.945, 0.925, 0.878)    // #f1ece0 — bone vertebral flash
);

// Juvenile palette: hatching colour — warm yellow/orange/red
const vec3 EMERALD_PALETTE_JUVENILE[5] = vec3[5](
    vec3(0.290, 0.110, 0.031),   // deep brick
    vec3(0.600, 0.220, 0.039),   // russet
    vec3(0.820, 0.490, 0.059),   // amber
    vec3(0.980, 0.780, 0.200),   // golden yellow
    vec3(0.980, 0.960, 0.780)    // pale cream flash
);

// ─── Vertebral flash overlay ──────────────────────────────────────────────────
// Sparse bright triangular flecks along the dorsal midline.
// Returns 1.0 over a flash, 0.0 elsewhere.
float emerald_vertebralFlash(vec2 uv) {
    float spacing = 0.08;
    float xPhase  = fract(uv.x / spacing);
    // Triangular flash: narrow spike at the midline
    float lateralDist = abs(uv.y - 0.5);
    float spikeMask   = (xPhase < 0.12) ? (1.0 - lateralDist / 0.04) : 0.0;
    return clamp(spikeMask, 0.0, 1.0);
}

// Lerp palette by maturity and apply the vertebral flash overlay.
vec3 emerald_palette(float v, float maturity) {
    float t   = clamp(v, 0.0, 1.0) * 4.0;
    int   idx = int(floor(t));
    float f   = fract(t);
    idx       = clamp(idx, 0, 3);
    vec3 adultCol    = mix(EMERALD_PALETTE_ADULT[idx],    EMERALD_PALETTE_ADULT[idx+1],    f);
    vec3 juvenileCol = mix(EMERALD_PALETTE_JUVENILE[idx], EMERALD_PALETTE_JUVENILE[idx+1], f);
    return mix(juvenileCol, adultCol, clamp(maturity, 0.0, 1.0));
}
