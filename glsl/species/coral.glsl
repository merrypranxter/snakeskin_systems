// species/coral.glsl — Regime 4: Coral Mimicry Rings
// Micrurus (true coral) + Batesian mimics — aposematic banding.
//
// Field:   1D banding around the body circumference (NOT 2D Gray-Scott).
//          Band widths are parameterized per the ring order table.
//          Toggle u_coralMimic to flip band order (true coral vs scarlet king).
// Lattice: density=30  jitter=0.20  levels=3  (flat saturated scute feel)
// Palette: red, warning yellow, black
//          ["#d7263d","#ffd400","#0a0a0a"]
//
// Batesian toggle:
//   true coral  (u_coralMimic=false): red-yellow-black-yellow-red  ("red touch yellow…")
//   scarlet king (u_coralMimic=true): red-black-yellow-black-red   ("red touch black…")

const float CORAL_DENSITY = 30.0;
const float CORAL_JITTER  = 0.20;
const float CORAL_LEVELS  = 3.0;

const vec3 CORAL_RED    = vec3(0.843, 0.149, 0.239);   // #d7263d
const vec3 CORAL_YELLOW = vec3(1.000, 0.831, 0.000);   // #ffd400
const vec3 CORAL_BLACK  = vec3(0.039, 0.039, 0.039);   // #0a0a0a

// ─── Banding field ───────────────────────────────────────────────────────────
// uv.x = along-body position (rings advance along x)
// Returns a [0,1] palette index:  0=red  0.5=yellow  1=black
// Band widths (normalized fractions of one triad period):
//   true coral:   red 0.30 | yellow 0.10 | black 0.20 | yellow 0.10 | red 0.30
//   scarlet king: red 0.30 | black  0.20 | yellow0.10 | black  0.20 | red 0.20

// Returns colour directly — this regime is colour-by-band, not field-value-to-LUT.
vec3 coral_color(vec2 uv, bool mimic) {
    float period = 0.22;            // body-length fraction per triad
    float p = fract(uv.x / period); // [0,1) within one repeating triad

    if (!mimic) {
        // true coral: r y b y r   (0.30 / 0.10 / 0.20 / 0.10 / 0.30)
        if (p < 0.30) return CORAL_RED;
        if (p < 0.40) return CORAL_YELLOW;
        if (p < 0.60) return CORAL_BLACK;
        if (p < 0.70) return CORAL_YELLOW;
        return CORAL_RED;
    } else {
        // scarlet king mimic: r b y b r   (0.30 / 0.20 / 0.10 / 0.20 / 0.20)
        if (p < 0.30) return CORAL_RED;
        if (p < 0.50) return CORAL_BLACK;
        if (p < 0.60) return CORAL_YELLOW;
        if (p < 0.80) return CORAL_BLACK;
        return CORAL_RED;
    }
}

// Scalar field version for compatibility with the general quantize pipeline:
// 0=black  0.5=yellow  1=red
float coral_field(vec2 uv, bool mimic) {
    vec3 c = coral_color(uv, mimic);
    if (c == CORAL_BLACK)  return 0.0;
    if (c == CORAL_YELLOW) return 0.5;
    return 1.0;
}

vec3 coral_palette(float v) {
    if (v < 0.333) return CORAL_BLACK;
    if (v < 0.667) return CORAL_YELLOW;
    return CORAL_RED;
}
