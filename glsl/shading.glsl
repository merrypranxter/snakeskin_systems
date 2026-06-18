// shading.glsl — keeled specular highlight + imbrication shadow
// Import this into display.frag and lens.glsl.

// shadeScale — apply keel-ridge lighting and scale-overlap shadow to a base colour.
//
//  baseCol  — linear RGB from the palette LUT
//  c        — ScaleCell from voronoiScale()
//  uv       — fragment UV
//  density  — same density passed to voronoiScale() (needed for edge metric)
//  lightDir — normalised world-space light direction
//
// Returns a lit, imbricated colour ready for output.

vec3 shadeScale(vec3 baseCol, ScaleCell c, vec2 uv, float density, vec3 lightDir) {
    // ── Keel specular ────────────────────────────────────────────────────────
    // Reconstruct a per-scale surface normal from the keel ridge stored in c.normal.
    // Normal is in tangent space with Y up; keel runs along the scale's long axis.
    vec3 N    = normalize(vec3(c.normal.x, 1.0, c.normal.y));
    vec3 view = vec3(0.0, 0.0, 1.0);    // orthographic view along +Z
    vec3 H    = normalize(lightDir + view);
    float spec = pow(max(dot(N, H), 0.0), 24.0) * 0.35;

    // ── Imbrication shadow ───────────────────────────────────────────────────
    // Scales overlap like roof tiles: the trailing (top/posterior) edge of each
    // scale is tucked under the scale above, casting a soft shadow.
    float distToCenter = distance(uv, c.center) * density;
    float edge = smoothstep(0.55, 0.85, distToCenter);
    baseCol *= mix(1.0, 0.50, edge);

    // ── Per-cell micro-variation ─────────────────────────────────────────────
    // Tiny hue/value waver so no two scales look stamped from a cookie cutter.
    float micro = (c.id - 0.5) * 0.06;
    baseCol    += vec3(micro);

    baseCol += vec3(spec);
    return clamp(baseCol, 0.0, 1.0);
}

// ── Optional structural iridescence ─────────────────────────────────────────
// Thin-film shimmer at grazing angles (sunbeam snakes, some pythons).
// Modulate the full thin-film model from thin_film_iridescence by 0.15
// so it only shows at extreme angles.  Placeholder stub — bind the real
// implementation from the sister repo if available.
vec3 thinFilmShimmer(vec3 col, vec3 N, vec3 view, float strength) {
    float grazing = 1.0 - max(dot(N, view), 0.0);
    float shimmer = pow(grazing, 4.0) * strength;
    // Cycle hue: rough cheap iridescence — replace with real thin-film LUT
    vec3 iridColor = vec3(
        0.5 + 0.5 * sin(grazing * 8.0),
        0.5 + 0.5 * sin(grazing * 8.0 + 2.094),
        0.5 + 0.5 * sin(grazing * 8.0 + 4.189)
    );
    return col + iridColor * shimmer;
}
