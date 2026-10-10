# dibusynth — Design Spec
_Date: 2026-10-10_

## Overview

dibusynth is a browser-based experimental synthesizer where the user draws freehand on a canvas and a scanner line converts the drawing into music. Each color has a configurable timbre, the Y-axis maps to pitch within a selected scale, and multiple directional sweeps can run simultaneously.

Target: mobile-first, touch + mouse, no build step, vanilla JS + Web Audio API + Canvas 2D.

---

## Architecture

```
dibusynth/
  index.html      ← layout, script load order
  style.css       ← responsive layout, panel, themes
  canvas.js       ← drawing engine, stroke data, undo, lookup grid
  scanner.js      ← sweep animation, 4 directional modes, intersection dots
  audio.js        ← Web Audio context, voice pool, note mapping, timbres
  ui.js           ← control panel events, color picker, timbre config panel
```

No imports/exports — scripts loaded in order (canvas → audio → scanner → ui). Each module is a plain object with `init()` and a public API.

---

## Canvas & Drawing

### Layout
- `<canvas>` fills 100% of viewport width, dynamic height (viewport minus panel height).
- On `resize`: canvas dimensions update, strokes re-rendered from vector data (no pixel loss).
- Background: CSS-based grid (SVG data-URI as `background-image`), no canvas cost.
- Optional background themes (CSS class on wrapper): `theme-paper` (default), `theme-sky`, `theme-dark`.

### Drawing input
- Unified pointer events: `pointerdown / pointermove / pointerup` — covers touch and mouse.
- Active tool: `pencil` or `eraser`.
- Pencil: appends points to current stroke on move.
- Eraser: on move, removes any stroke whose points come within N px of pointer (whole-stroke erase).

### Stroke data structure
```js
// strokes: global array, source of truth
strokes = [
  { color: '#e74c3c', width: 4, points: [{x, y}, ...] }
]
```
- Canvas is always a re-render of `strokes` (no persistent pixel state).
- Undo: `strokes.pop()` + full redraw.
- Clear: `strokes = []` + clear canvas.

### Lookup grid (built after each stroke ends)
```js
// Horizontal scanners (→ ←): Map<col_x, [{y, color}]>
hGrid = new Map()
// Vertical scanners (↓ ↑): Map<row_y, [{x, color}]>
vGrid = new Map()
```
Grid resolution: 1px columns/rows. Built by iterating all stroke points and inserting into both grids. Rebuilt on every stroke-end and undo.

---

## Scanner

### 4 directional modes
| ID | Direction | Reads from |
|----|-----------|------------|
| `lr` | left → right | `hGrid[scanX]` → y values |
| `rl` | right → left | `hGrid[scanX]` → y values |
| `tb` | top → bottom | `vGrid[scanY]` → x values |
| `bt` | bottom → top | `vGrid[scanY]` → x values |

Each mode is independently toggleable (on/off button in UI). Multiple modes can be active simultaneously — each has its own position and gain node.

### Speed
- All active scanners share the global BPM.
- One full sweep = `beatsPerSweep` beats (default: 4).
- `pixelsPerMs = canvasSize / (beatsPerSweep * (60000 / bpm))`
- Animated with `requestAnimationFrame`, delta-time based (no drift).
- Scanner loops: when it reaches the end, it resets to start and continues.

### Intersection dots
- At each frame, after reading hits from grid, draw a filled circle (color of hit stroke) on the scanner line at the hit Y (or X) position.
- Dots are drawn on top of strokes each frame (no persistent state needed).

### Visual scanner line
- Thin line (1px, `rgba(0,0,0,0.5)`), drawn each frame at current position.

---

## Audio Engine

### Web Audio graph
```
OscillatorNode → GainNode (envelope) → GainNode (sweep volume) → GainNode (master) → destination
```

### Voice pool
- 16 pre-created oscillator slots. On trigger: find idle voice, or steal oldest active voice.
- Each voice: `{ osc, envGain, active, startTime }`.
- Envelope: attack 5ms, sustain at 0.7, release 150ms. Short and clean, good for polyphony.

### Note mapping
- Scale array: pre-computed list of frequencies for the selected root + mode, spanning canvas height in notes.
- `noteIndex = Math.floor((y / canvasHeight) * scale.length)`
- Y=0 (top) → highest note. Y=canvasHeight (bottom) → lowest note.
- `frequency = scale[noteIndex]`

### Scales available (v1)
- Major, Natural Minor, Pentatonic Major, Pentatonic Minor, Blues, Chromatic.

### Root note
- C through B (12 options), selected in UI.

### Timbre per color
Each of the 9 colors stores:
```js
colorConfig[color] = {
  waveform: 'sine' | 'triangle' | 'square' | 'sawtooth',
  // future: filter cutoff, reverb send
}
```
Default waveforms assigned by color family (e.g. green=sine, red=sawtooth, purple=triangle).

### Per-sweep volume
Each active scanner has its own `GainNode` (0.0–1.0), controlled by a slider in the UI.

### Master volume
Single `GainNode` before destination, controlled by global vol slider.

---

## Control Panel (UI)

Fixed bottom bar, mobile-first. Three rows:

**Row 1 — transport & tools**
`▶/⏸` · `✏️ pencil` · `◻ eraser` · `↩ undo` · `✕ clear` · `BPM − [value] +` · `vol ——●——`

**Row 2 — colors**
9 color swatches. Tap: select color. Long-press (500ms): open timbre config popover for that color (waveform selector: sine / triangle / square / sawtooth).

**Row 3 — sweeps, scale, key**
`→` `←` `↓` `↑` (toggle buttons, each with a mini volume slider below when active) · `Key: C` (dropdown) · `Scale: Major` (dropdown) · `Theme: 🌤` (cycle button)

### Responsive behavior
- On narrow screens (< 400px): Row 3 scrolls horizontally.
- Panel height is fixed; canvas height = `window.innerHeight - panelHeight`.

---

## Future ideas (v2+)
- Pixel art mode (grid-snapped drawing)
- Stamp/icon triggers (one-shot percussion hits)
- Background themes (sky, dark, custom image)
- Export audio recording
- Save/load drawing (JSON blob or URL hash)
- ADSR per color (full envelope control)
- Reverb / delay send per color

---

## Success criteria
- Draws smoothly on mobile (60fps or near) while scanner plays.
- Undo and clear work instantly.
- Switching BPM, key, and scale updates sound immediately (no restart needed).
- Multiple scanners active simultaneously produce audible layered result.
- Works in Safari iOS, Chrome Android, Chrome/Firefox desktop.
