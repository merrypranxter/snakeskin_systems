# 🐍 Snakeskin Systems

> *"The pattern is not painted on the scale. The scale samples a pattern that was already there."*

A biological-pattern module for [RepoScripter2](https://github.com/merrypranxter/reposcripter2). Snake skin is a continuous reaction-diffusion morphogen field **quantized onto a discrete scale lattice** — the scales are the pixels, the Turing field is the image, and each scale snaps the smooth chemistry into a crisp, faceted, stained-glass facet. Seven species engines, a jittered Voronoi scale grid, keeled specular shading, and a pattern-transfer rig that turns any species topology into a reusable lens you can drape over the whole ecosystem.

---

## Why this isn't another reaction-diffusion repo

`reaction_diffusion` and `morphogenesis` already make the *field*. This repo makes it **serpent**:

```
continuous morphogen field  →  quantize to scale cells  →  light the keels  →  species palette
   (Gray-Scott RD)              (Voronoi lattice)           (specular ridges)    (LUT)
```

The quantization is the whole trick. A smooth Turing blob looks like a lava lamp. Snap that same field to the average value under each overlapping scale and it becomes a python. The crispness of real snakeskin is a **sampling artifact** of biology — thousands of tiny tiles each committing to one color.

---

## The Species Engines

Seven distinct skins, each a different marriage of field regime + lattice + palette:

| # | Regime | Species | Visual Character |
|---|--------|---------|-----------------|
| 0 | **reticulated cathedral** | *Python reticulatus* | labyrinthine net, cream cells in black leading |
| 1 | **gaboon geometry** | *Bitis gabonica* | interlocking hourglass leaf-litter — the most beautiful camouflage alive |
| 2 | **adder zigzag** | *Vipera berus* | single dorsal lightning ribbon, warning glyph |
| 3 | **diamondback chain** | *Crotalus* | rhombic diamonds linked spine-to-tail |
| 4 | **coral mimicry rings** | *Micrurus* + mimics | saturated red/yellow/black banding, Batesian toggle |
| 5 | **emerald flecks** | *Morelia viridis* | green field, bone-white vertebral flashes |
| 6 | **morph lab** | ball python morph community | the chaos mode — mutation sliders that corrupt the base field |

### The field math (Gray-Scott)

Most serpent patterns fall out of one equation in different regimes:

```
∂a/∂t = Da·∇²a − a·b² + F·(1 − a)
∂b/∂t = Db·∇²b + a·b² − (F + k)·b
```

| Regime | F | k | yields |
|--------|------|------|--------|
| reticulated net | 0.026 | 0.051 | branching maze / reticulum |
| diamond spots | 0.035 | 0.065 | discrete blotches |
| mottle | 0.030 | 0.057 | soft worm-mottle |

The zigzag, banding, and gaboon geometry are **procedural overrides** — directional sinusoids and Voronoi-Truchet tessellations layered on top of (or instead of) the RD field, because real vipers cheat the chemistry with hox-gene geometry.

---

## GPU Architecture

```
Scale Lattice Pass
  (jittered Voronoi → cell id, cell center, keel normal)
         ↓
Morphogen FBO Ping-Pong
  (Gray-Scott RD — or an imported field from another repo)
         ↓
Quantize Pass
  (per fragment: look up scale cell → sample field at cell center → posterize)
         ↓
Palette Map
  (species LUT — cell value → hex ramp)
         ↓
Scale Shading
  (keel normal → specular + imbrication shadow + optional thin-film iridescence)
         ↓
Screen Output
```

The scale lattice is a **jittered hex Voronoi** — roughly 4,000–12,000 cells across the body. Each fragment finds its nearest scale center, inherits that cell's quantized field value, and shades against a per-scale keel normal so the whole surface reads as overlapping oiled tiles, not flat print.

---

## Pattern Transfer — "mix with other context"

The reason this is a *system* and not a texture pack. Three knobs, fully decoupled:

- **topology** — which species' scale lattice + field regime (the *structure*)
- **fill field** — RD | imported texture | another ecosystem repo's output (the *content*)
- **palette** — any LUT, species-accurate or not (the *skin*)

So you can run **reticulated-python topology + `fluid_dynamics` velocity field + `vaporwave_aesthetic` palette** and get a snake that never existed. Or blend two species' morphogen fields (`mix(fieldA, fieldB, t)`) for a hybrid scale pattern. Or **export the scale lattice as a normal/displacement lens** and drape serpent scales over anything else in the collection.

```glsl
// snakeskin as a lens over any incoming field
vec3 snakeskin_lens(vec2 uv, sampler2D incomingField, int topology, sampler2D palette) {
    ScaleCell c = voronoiScale(uv, topology);          // structure
    float v     = texture(incomingField, c.center).r;  // content (any source)
    v           = posterize(v, c.levels);              // quantize to the scale
    vec3 col    = texture(palette, vec2(v, 0.5)).rgb;   // skin (any palette)
    return shadeKeel(col, c.normal);                   // light the ridge
}
```

---

## Aesthetic Post-Processing

- **Oil sheen** — specular keel highlights + a faint thin-film term (real sunbeam snakes & some pythons are structurally iridescent — see `thin_film_iridescence`)
- **Shed translucency** — optional milky-blue pre-shed mode, the field read through a fogged top layer
- **Imbrication shadow** — soft dark at every scale's trailing edge so tiles overlap convincingly
- **Maximalist override** — ditch earth tones entirely; run species topology under radioactive palettes

---

## Quick Start

```bash
# No bundler required — Three.js loads from CDN
npm run dev
# open http://localhost:3000
```

Or just open `index.html` directly in a browser that supports ES modules + WebGL2.

### Using in your own project

```js
import SnakeskinRenderer      from './js/SnakeskinRenderer.js';
import { buildPaletteTexture } from './js/SpeciesPalettes.js';
import PatternTransfer         from './js/PatternTransfer.js';

// Full pipeline — seven regimes, interactive demo
const snake = new SnakeskinRenderer(canvas, { regime: 0 });
await snake.init();
snake.start();

// Switch species
snake.setRegime(3);          // → diamondback chain

// Pattern transfer: pipe any external texture through serpent scales
const xfer = new PatternTransfer(renderer, 512, 512);
xfer.setFillField(myFluidDynamicsTexture);
xfer.setTopology(0);                          // reticulated python lattice
xfer.setPalette(buildPaletteTexture(['#ff00ff','#00ffff','#ffff00']));  // any palette
xfer.render();
mesh.material.map = xfer.output.texture;

// Export the scale lattice as a normal/displacement map
mesh.material.normalMap       = xfer.normalMap.texture;
mesh.material.displacementMap = xfer.displacementMap.texture;
```

### GLSL — concatenation order for display.frag

`display.frag` expects `utils.glsl` and `shading.glsl` to be prepended before compilation.  
Use any GLSL preprocessor or concatenate manually:

```
glsl/utils.glsl  +  glsl/shading.glsl  +  glsl/display.frag  →  display shader
glsl/utils.glsl  +  glsl/shading.glsl  +  glsl/lens.glsl     →  lens shader
```

`PatternTransfer.js` inlines the full lens GLSL so it compiles standalone without concatenation.

---

## Files

| File | What it is |
|------|-----------|
| `index.html` | Interactive demo — all seven species + morph-lab sliders |
| `glsl/compute.frag` | Gray-Scott RD update pass (ping-pong FBO) |
| `glsl/display.frag` | Quantize + palette + shading display pass (all regimes) |
| `glsl/utils.glsl` | hash22/hash21, `voronoiScale()`, `quantize()` |
| `glsl/shading.glsl` | `shadeScale()` — keel specular + imbrication shadow |
| `glsl/lens.glsl` | `snakeskin_lens()` — pattern-transfer rig; normal/displacement export |
| `glsl/species/*.glsl` | Seven regime parameter + palette + field-generation shaders |
| `js/SnakeskinRenderer.js` | Top-level Three.js orchestrator — six-pass pipeline |
| `js/ReactionDiffusion.js` | WebGL2 Gray-Scott ping-pong class |
| `js/ScaleLattice.js` | Bakes the Voronoi lattice to render targets (normal + ID maps) |
| `js/PatternTransfer.js` | Pattern-transfer rig — self-contained lens over any incoming field |
| `js/SpeciesPalettes.js` | All species DataTextures from hex-stop arrays |
| `repo_seed.txt` | Full deep-dive: RD math, scale-lattice GLSL, seven species regimes with params + palettes, transfer rig |
| `context.manifest.json` | RepoScripter2 file manifest |

---

## Used By / Talks To

Context source for [RepoScripter2](https://github.com/merrypranxter/reposcripter2). Part of the [ShaderForge](https://github.com/merrypranxter/shaderforge3) ecosystem.

**Leans on:** [`reaction_diffusion`](https://github.com/merrypranxter/reaction_diffusion) · [`morphogenesis`](https://github.com/merrypranxter/morphogenesis) · [`cellular_automata`](https://github.com/merrypranxter/cellular_automata) · [`thin_film_iridescence`](https://github.com/merrypranxter/thin_film_iridescence)
**Feeds:** [`textile_pattern_systems`](https://github.com/merrypranxter/textile_pattern_systems) · [`printed_fabric_patterns`](https://github.com/merrypranxter/printed_fabric_patterns) (snakeskin print is a textile, after all)

---

<div align="center">
<sub>seven serpents. ~12,000 scales. one quantized field. all chemistry, no paint.</sub>
</div>
