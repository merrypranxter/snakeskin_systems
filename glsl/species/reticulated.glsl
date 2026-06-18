// species/reticulated.glsl — Regime 0: Reticulated Cathedral
// Python reticulatus — labyrinthine net, cream cells in black leading.
//
// Field:   Gray-Scott reticulum  F=0.026  k=0.051
//          Longitudinal anisotropy 1.4× stretches the net along the body axis.
// Lattice: density=90  jitter=0.45  levels=3
// Palette: void(black) → lead → olive → tan → cream
//          ["#0a0805","#3a2a18","#7a6a42","#c9b486","#efe3c2"]

// Gray-Scott parameters — bind to u_fk as vec2(0.026, 0.051)
const vec2  RETICULATED_FK        = vec2(0.026, 0.051);
const float RETICULATED_ANISO     = 1.4;

// Lattice parameters — feed to voronoiScale()
const float RETICULATED_DENSITY   = 90.0;
const float RETICULATED_JITTER    = 0.45;
const float RETICULATED_LEVELS    = 3.0;

// Palette stops (linear sRGB, 5 stops → 1×256 DataTexture)
// Order: lowest field value → highest field value
// #0a0805  void / black lead net
// #3a2a18  dark interior shadow
// #7a6a42  olive mid
// #c9b486  warm tan
// #efe3c2  cream cell centre
const vec3 RETICULATED_PALETTE[5] = vec3[5](
    vec3(0.039, 0.031, 0.020),
    vec3(0.227, 0.165, 0.094),
    vec3(0.478, 0.416, 0.259),
    vec3(0.788, 0.706, 0.525),
    vec3(0.937, 0.890, 0.761)
);

// Convenience: sample the palette by quantized field value v ∈ [0,1].
// In production use the 1×256 DataTexture from SpeciesPalettes.js instead.
vec3 reticulated_palette(float v) {
    float t   = clamp(v, 0.0, 1.0) * 4.0;
    int   idx = int(floor(t));
    float f   = fract(t);
    idx       = clamp(idx, 0, 3);
    return mix(RETICULATED_PALETTE[idx], RETICULATED_PALETTE[idx + 1], f);
}
