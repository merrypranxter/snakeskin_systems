// utils.glsl — shared hash, Voronoi scale-cell, and quantize helpers
// Included by compute.frag, display.frag, lens.glsl, and species shaders.
// Rule: sample the field at the CELL CENTER, never per-fragment.

// ─── Hash functions ──────────────────────────────────────────────────────────

// 2D → 2D pseudo-random (Jarzynski & Olano 2020 style)
vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}

// 2D → 1D pseudo-random
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// ─── Scale-cell struct ───────────────────────────────────────────────────────

struct ScaleCell {
    vec2  center;   // UV position of the scale's centroid
    vec2  normal;   // XZ components of the keel ridge normal
    float id;       // unique [0,1) cell identifier (use for per-scale variation)
    float levels;   // posterization steps for this cell
};

// ─── Jittered hex Voronoi scale lattice ─────────────────────────────────────
//
//  density  — scales per unit UV (~30 ventral, ~90 fine dorsal)
//  jitter   — 0 = perfect hex, 1 = fully random (typical: 0.35–0.45)
//  levels   — posterization depth (2 = two-tone, 5 = crisp geometric)

ScaleCell voronoiScale(vec2 uv, float density, float jitter, float levels) {
    vec2 g      = uv * density;
    vec2 cellId = floor(g);

    vec2  bestCenter = vec2(0.0);
    vec2  bestId     = vec2(0.0);
    float bestDist   = 1e9;

    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 nb  = cellId + vec2(float(i), float(j));
            vec2 off = hash22(nb) * jitter;
            vec2 p   = nb + 0.5 + off;          // hex offset: center + jitter
            float d  = distance(g, p);
            if (d < bestDist) {
                bestDist   = d;
                bestCenter = p;
                bestId     = nb;
            }
        }
    }

    ScaleCell c;
    c.center = bestCenter / density;
    c.id     = hash21(bestId);
    c.levels = levels;

    // Keel normal: ridge runs along the scale's long axis.
    // The normal peaks at the cell center (edge = 0) and flattens at borders.
    float edge = bestDist;  // 0 at center, ~0.5 at Voronoi border
    float t    = 1.0 - smoothstep(0.0, 0.45, edge);
    float kx   = sin(bestCenter.x * 6.28318) * t;
    float kz   = cos(bestCenter.y * 6.28318) * t;
    c.normal   = vec2(kx, kz) * 0.6;

    return c;
}

// ─── Posterization ───────────────────────────────────────────────────────────

// Snap a [0,1] value to `levels` discrete steps.
float quantize(float v, float levels) {
    return floor(v * levels + 0.5) / levels;
}
