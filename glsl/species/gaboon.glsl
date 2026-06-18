// species/gaboon.glsl — Regime 1: Gaboon Geometry
// Bitis gabonica — interlocking hourglass leaf-litter camouflage.
//
// Field:   Procedural Voronoi-Truchet tessellation — NOT Gray-Scott.
//          Two sets of orthogonal Truchet arcs rotate based on cell hash,
//          producing the interlocking hourglass / bowtie geometry.
// Lattice: density=60  jitter=0.30  levels=5  (crisp geometric facets)
// Palette: dark chocolate → sienna → buff → sand → cream → violet-grey
//          ["#2b211a","#5c3b22","#8a6a4a","#b9a07a","#d9c8a8","#7a6f7d"]

const float GABOON_DENSITY = 60.0;
const float GABOON_JITTER  = 0.30;
const float GABOON_LEVELS  = 5.0;

const vec3 GABOON_PALETTE[6] = vec3[6](
    vec3(0.169, 0.129, 0.102),   // #2b211a — deep chocolate
    vec3(0.361, 0.231, 0.133),   // #5c3b22 — dark sienna
    vec3(0.541, 0.416, 0.290),   // #8a6a4a — warm buff
    vec3(0.725, 0.627, 0.478),   // #b9a07a — sand
    vec3(0.851, 0.784, 0.659),   // #d9c8a8 — pale cream
    vec3(0.478, 0.435, 0.490)    // #7a6f7d — violet-grey accent
);

// ─── Truchet / hourglass field ───────────────────────────────────────────────
// Returns a [0,1] field value at uv using a Voronoi-Truchet pattern.
// The hash of each cell chooses arc orientation (0° or 90°).
// This replaces the Gray-Scott FBO for this regime.
float gaboon_field(vec2 uv) {
    vec2  g      = uv * GABOON_DENSITY;
    vec2  cell   = floor(g);
    vec2  local  = fract(g) - 0.5;  // [-0.5, 0.5] within the cell

    // Choose arc orientation from cell hash
    float h   = hash21(cell);
    float arc;
    if (h > 0.5) {
        // Arc connects (top-left, bottom-right): hyperbola-like
        arc = abs(local.x + local.y);
    } else {
        // Arc connects (top-right, bottom-left)
        arc = abs(local.x - local.y);
    }

    // Truchet arc bandwidth — thinner = more geometric, wider = more painterly
    float band = smoothstep(0.08, 0.18, arc) - smoothstep(0.30, 0.42, arc);

    // Add corner accent triangles (the "hourglass" caps)
    float corner = smoothstep(0.38, 0.45, length(abs(local) - vec2(0.45, 0.45)));
    return clamp(band + (1.0 - corner) * 0.35, 0.0, 1.0);
}

vec3 gaboon_palette(float v) {
    float t   = clamp(v, 0.0, 1.0) * 5.0;
    int   idx = int(floor(t));
    float f   = fract(t);
    idx       = clamp(idx, 0, 4);
    return mix(GABOON_PALETTE[idx], GABOON_PALETTE[idx + 1], f);
}
