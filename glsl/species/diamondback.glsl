// species/diamondback.glsl — Regime 3: Diamondback Chain
// Crotalus — dusty olive ground, dark diamonds with cream borders linked spine-to-tail.
//
// Field:   Gray-Scott spots (F=0.035  k=0.065) masked to a diamond lattice
//          aligned along the spine.  The masking ensures the blotches fall
//          inside rhombic windows rather than scattered at random.
// Lattice: density=55  jitter=0.35  levels=3
// Palette: ground → mid → light → cream border → diamond core
//          ["#3a3a2a","#6b6347","#9a8f63","#cabf90","#0d0d08"]

const vec2  DIAMONDBACK_FK      = vec2(0.035, 0.065);
const float DIAMONDBACK_ANISO   = 1.2;

const float DIAMONDBACK_DENSITY = 55.0;
const float DIAMONDBACK_JITTER  = 0.35;
const float DIAMONDBACK_LEVELS  = 3.0;

const vec3 DIAMONDBACK_PALETTE[5] = vec3[5](
    vec3(0.227, 0.227, 0.165),   // #3a3a2a — dusty olive ground
    vec3(0.420, 0.388, 0.278),   // #6b6347 — mid khaki
    vec3(0.604, 0.561, 0.388),   // #9a8f63 — warm sand
    vec3(0.792, 0.749, 0.565),   // #cabf90 — pale cream border
    vec3(0.051, 0.051, 0.031)    // #0d0d08 — near-black diamond core
);

// ─── Diamond lattice mask ─────────────────────────────────────────────────────
// Returns a [0,1] mask: 1.0 inside a diamond window, 0.0 outside.
// Diamonds are spaced along the spine (x) axis.
// uv.x = along body, uv.y = lateral (0.5 = dorsal midline).
float diamondback_mask(vec2 uv) {
    float spacing = 0.12;           // spacing between diamond centres along spine
    float width   = 0.055;          // half-width of diamond in x
    float height  = 0.10;           // half-height of diamond in y

    // Snap to nearest diamond centre on the spine
    float xc = round(uv.x / spacing) * spacing;
    float dx  = abs(uv.x - xc) / width;
    float dy  = abs(uv.y - 0.5) / height;

    // Diamond = L1 ball
    return 1.0 - smoothstep(0.85, 1.0, dx + dy);
}

// The field from Gray-Scott is multiplied by the mask before quantization.
// Call this in your display pass:
//   float maskedField = texture(u_state, c.center).g * diamondback_mask(c.center);
//   float v = quantize(maskedField, DIAMONDBACK_LEVELS);

vec3 diamondback_palette(float v) {
    float t   = clamp(v, 0.0, 1.0) * 4.0;
    int   idx = int(floor(t));
    float f   = fract(t);
    idx       = clamp(idx, 0, 3);
    return mix(DIAMONDBACK_PALETTE[idx], DIAMONDBACK_PALETTE[idx + 1], f);
}
