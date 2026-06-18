// compute.frag — Gray-Scott reaction-diffusion update pass
// Ping-pong between two RGBA32F render targets.
// .r = A (substrate)  .g = B (autocatalyst)
//
// Run ~40 substeps per display frame with u_dt = 1.0.
// Seed the field with a noise splat of B near center; let it grow outward.

#version 300 es
precision highp float;

uniform sampler2D u_state;      // .r = A, .g = B  (current ping)
uniform vec2      u_texel;      // 1.0 / resolution
uniform vec2      u_fk;         // .x = feed (F),  .y = kill (k)
uniform float     u_dt;         // time step — keep <= 1.0
uniform float     u_anisotropy; // > 1.0 = stretch B diffusion along x (body axis)

out vec4 fragColor;

// 9-point weighted Laplacian (separable approximation).
// Returns the Laplacian of both A and B channels simultaneously.
vec2 laplacian(vec2 uv) {
    vec2 s = vec2(0.0);
    s += texture(u_state, uv + vec2(-u_texel.x,  0.0        )).rg * 0.20;
    s += texture(u_state, uv + vec2( u_texel.x,  0.0        )).rg * 0.20;
    s += texture(u_state, uv + vec2( 0.0,        -u_texel.y )).rg * 0.20;
    s += texture(u_state, uv + vec2( 0.0,         u_texel.y )).rg * 0.20;
    s += texture(u_state, uv + vec2(-u_texel.x,  -u_texel.y )).rg * 0.05;
    s += texture(u_state, uv + vec2( u_texel.x,  -u_texel.y )).rg * 0.05;
    s += texture(u_state, uv + vec2(-u_texel.x,   u_texel.y )).rg * 0.05;
    s += texture(u_state, uv + vec2( u_texel.x,   u_texel.y )).rg * 0.05;
    s -= texture(u_state, uv).rg;   // center weight = -(sum of neighbours) = -1.0
    return s;
}

// Anisotropic Laplacian variant: stretch B diffusion along the x-axis
// to elongate the pattern longitudinally (body-axis stretch).
vec2 laplacianAniso(vec2 uv) {
    float tx = u_texel.x * u_anisotropy;
    float ty = u_texel.y / max(u_anisotropy, 1.0);

    vec2 s = vec2(0.0);
    // Cardinals weighted by direction so that A stays isotropic, B is stretched
    vec2 lapA = laplacian(uv);  // isotropic for A

    // Anisotropic for B: wider x offsets
    float B_xm  = texture(u_state, uv + vec2(-tx,  0.0)).g;
    float B_xp  = texture(u_state, uv + vec2( tx,  0.0)).g;
    float B_ym  = texture(u_state, uv + vec2( 0.0, -ty)).g;
    float B_yp  = texture(u_state, uv + vec2( 0.0,  ty)).g;
    float B_c   = texture(u_state, uv).g;
    float lapB  = (B_xm + B_xp) * 0.25 + (B_ym + B_yp) * 0.25 - B_c;

    return vec2(lapA.x, lapB);
}

void main() {
    vec2 uv  = gl_FragCoord.xy * u_texel;
    vec2 st  = texture(u_state, uv).rg;   // A, B
    float A  = st.x;
    float B  = st.y;

    vec2 L   = (u_anisotropy > 1.001) ? laplacianAniso(uv) : laplacian(uv);

    float Da       = 1.0;
    float Db       = 0.5;
    float F        = u_fk.x;
    float k        = u_fk.y;
    float reaction = A * B * B;

    float dA = Da * L.x - reaction + F * (1.0 - A);
    float dB = Db * L.y + reaction - (F + k) * B;

    vec2 next = clamp(st + vec2(dA, dB) * u_dt, 0.0, 1.0);
    fragColor = vec4(next, 0.0, 1.0);
}
