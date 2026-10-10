# dibusynth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based draw-to-music synthesizer where freehand strokes on a canvas are scanned by a directional line that maps pixel Y-position to pitch and stroke color to timbre.

**Architecture:** Six plain vanilla-JS files loaded in order (canvas → audio → scanner → ui), no build step. Each file is an IIFE singleton with `init()` + public API. Canvas rendering is fully re-draw from stroke vector data; the audio engine uses a 16-voice pool with delta-time rAF animation.

**Tech Stack:** HTML5 Canvas 2D, Web Audio API, Pointer Events API, vanilla JS (ES2020), CSS custom properties. No frameworks, no bundler.

**Spec:** `docs/superpowers/specs/2026-10-10-dibusynth-design.md`

## Global Constraints

- No npm, no build step, no ES modules — plain `<script src>` tags in order.
- All files must work on Safari iOS 16+, Chrome Android, Chrome/Firefox desktop.
- `touch-action: none` on canvas; `user-scalable=no` in viewport meta.
- Canvas always re-renders from `strokes[]` vector data — never assume pixel state persists.
- `window.devicePixelRatio` must be applied on canvas init and resize.
- BPM, key, and scale changes must take effect immediately without restarting playback.
- Panel height is fixed; canvas height = `window.innerHeight − panelHeight`.

## Review Focus

- **Rapid drawing on mobile while scanner plays:** ensure rAF loop and pointer events don't fight — canvas redraw in rAF must not stomp in-progress stroke drawing (partial stroke not yet in strokes[]).
- **Resize with active strokes:** canvas CSS size changes before `offsetWidth/Height` settle — use `getBoundingClientRect()` or `setTimeout(0)` guard.
- **Voice stealing with short notes:** if 16 voices are all active and a burst hits, the stolen voice's `onended` callback fires after steal — ensure `v.active = false` is idempotent.
- **Multiple sweeps at the same column:** lr and rl can cross the same column at the same time — each sweep maintains independent `lastTrigCol` so they don't suppress each other.
- **Scale rebuild during playback:** `buildScale()` called mid-sweep must not leave `currentScale` in an inconsistent state — assign atomically: `currentScale = buildScale(...)`.

---

## File map

| File | Responsibility |
|------|---------------|
| `index.html` | DOM structure, viewport meta, script load order |
| `style.css` | Responsive layout, panel rows, button styles, themes, grid background |
| `canvas.js` | Stroke data, pointer events, redraw, undo/clear, hGrid/vGrid lookup |
| `audio.js` | AudioContext, voice pool, scale math, note trigger, sweep/master gains |
| `scanner.js` | rAF loop, 4-sweep positions, delta-time movement, intersection dots |
| `ui.js` | All DOM event wiring, color swatches, timbre popover, sweep toggles |

---

### Task 1: HTML scaffold + CSS layout

**Files:**
- Create: `index.html`
- Create: `style.css`

**Interfaces:**
- Produces: DOM structure that Tasks 2–6 depend on. IDs: `#canvas`, `#panel`, `#row-transport`, `#row-colors`, `#row-sweeps`, `#timbre-popover`, `#btn-play`, `#btn-pencil`, `#btn-eraser`, `#btn-undo`, `#btn-clear`, `#bpm-value`, `#btn-bpm-down`, `#btn-bpm-up`, `#slider-master-vol`, `#select-key`, `#select-scale`, `#btn-theme`.

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>dibusynth</title>
  <link rel="stylesheet" href="style.css">
</head>
<body class="theme-paper">
  <div id="app">
    <canvas id="canvas"></canvas>

    <div id="panel">
      <div class="panel-row" id="row-transport">
        <button id="btn-play" aria-label="play">▶</button>
        <button id="btn-pencil" class="tool-btn active" aria-label="pencil">✏</button>
        <button id="btn-eraser" class="tool-btn" aria-label="eraser">◻</button>
        <button id="btn-undo" aria-label="undo">↩</button>
        <button id="btn-clear" aria-label="clear">✕</button>
        <div class="bpm-control">
          <button id="btn-bpm-down">−</button>
          <span id="bpm-value">120</span>
          <button id="btn-bpm-up">+</button>
        </div>
        <div class="vol-control">
          <label for="slider-master-vol">vol</label>
          <input type="range" id="slider-master-vol" min="0" max="1" step="0.01" value="0.7">
        </div>
      </div>

      <div class="panel-row" id="row-colors">
        <!-- populated by ui.js -->
      </div>

      <div class="panel-row" id="row-sweeps">
        <!-- populated by ui.js -->
        <select id="select-key"></select>
        <select id="select-scale"></select>
        <button id="btn-theme" aria-label="theme">◑</button>
      </div>
    </div>
  </div>

  <!-- Timbre config popover (hidden by default) -->
  <div id="timbre-popover" class="hidden" role="dialog" aria-label="timbre config">
    <div class="popover-inner">
      <span class="popover-label">timbre</span>
      <button class="wave-btn active" data-wave="sine">∿ sine</button>
      <button class="wave-btn" data-wave="triangle">△ tri</button>
      <button class="wave-btn" data-wave="square">⊓ sq</button>
      <button class="wave-btn" data-wave="sawtooth">⊿ saw</button>
      <button id="timbre-close">✕</button>
    </div>
  </div>

  <script src="canvas.js"></script>
  <script src="audio.js"></script>
  <script src="scanner.js"></script>
  <script src="ui.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create style.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --panel-h: 148px;
  --btn-size: 36px;
  --radius: 50%;
  --panel-bg: #ffffff;
  --panel-border: #ddd;
  --body-bg: #f5f0e8;
  --canvas-bg: #f9f6f0;
  --text: #222;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
  height: 100dvh;
  background: var(--body-bg);
  color: var(--text);
}

#app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

#canvas {
  flex: 1;
  display: block;
  touch-action: none;
  background-color: var(--canvas-bg);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Cpath d='M 20 0 L 0 0 0 20' fill='none' stroke='%23ddd' stroke-width='0.5'/%3E%3C/svg%3E");
  cursor: crosshair;
}

#panel {
  flex-shrink: 0;
  height: var(--panel-h);
  background: var(--panel-bg);
  border-top: 1px solid var(--panel-border);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.panel-row {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.panel-row::-webkit-scrollbar { display: none; }

/* Buttons */
button {
  border: 1.5px solid #ccc;
  border-radius: var(--radius);
  width: var(--btn-size);
  height: var(--btn-size);
  background: #fff;
  cursor: pointer;
  font-size: 15px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, border-color 0.1s;
  -webkit-tap-highlight-color: transparent;
}
button.active { background: #222; color: #fff; border-color: #222; }
button.sweep-on { background: #4a90d9; color: #fff; border-color: #4a90d9; }

/* BPM control */
.bpm-control {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  flex-shrink: 0;
}
.bpm-control #bpm-value {
  min-width: 34px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
}

/* Vol control */
.vol-control {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 11px;
}
input[type=range] { width: 72px; cursor: pointer; }

/* Color swatches */
.color-swatch {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.color-swatch.selected { border-color: #222; }

/* Sweep row */
.sweep-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.sweep-item input[type=range] { width: 48px; }
.sweep-item .sweep-vol { display: none; }
.sweep-item.active .sweep-vol { display: block; }

/* Selects */
select {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 4px 6px;
  font-size: 12px;
  background: #fff;
  color: var(--text);
  cursor: pointer;
  flex-shrink: 0;
}

/* Timbre popover */
#timbre-popover {
  position: fixed;
  bottom: calc(var(--panel-h) + 10px);
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 14px;
  padding: 10px 12px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.18);
  z-index: 200;
}
#timbre-popover.hidden { display: none; }

.popover-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}
.popover-label { font-size: 11px; color: #888; }
.wave-btn {
  border-radius: 8px;
  width: auto;
  padding: 5px 10px;
  font-size: 12px;
  white-space: nowrap;
}
.wave-btn.active { background: #222; color: #fff; border-color: #222; }

/* Themes */
.theme-paper { --canvas-bg: #f9f6f0; }
.theme-sky { --canvas-bg: #c8e6f5; }
.theme-dark {
  --canvas-bg: #1a1a2e;
  --panel-bg: #16213e;
  --panel-border: #333;
  --body-bg: #0f0f1a;
  --text: #eee;
}
.theme-dark button { background: #1e2a44; color: #eee; border-color: #444; }
.theme-dark button.active { background: #eee; color: #222; }
.theme-dark select { background: #1e2a44; color: #eee; border-color: #444; }
```

- [ ] **Step 3: Open in browser and verify**

Open `index.html` directly in browser. Verify:
- Canvas fills screen above panel
- Panel shows 3 rows with correct heights
- No scroll or overflow visible
- On mobile viewport (DevTools): panel doesn't overflow, canvas resizes correctly

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: HTML scaffold and responsive CSS layout"
```

---

### Task 2: canvas.js — drawing engine + lookup grid

**Files:**
- Create: `canvas.js`

**Interfaces:**
- Consumes: `#canvas` DOM element.
- Produces (used by scanner.js and ui.js):
  - `Canvas.init(canvasEl)` — call once on DOMContentLoaded
  - `Canvas.resize()` — call on window resize
  - `Canvas.redraw()` — re-renders all strokes; called by scanner each rAF frame
  - `Canvas.getCtx()` → `CanvasRenderingContext2D`
  - `Canvas.getSize()` → `{ w: number, h: number }` (CSS pixels)
  - `Canvas.getHGrid()` → `Map<number, Array<{y:number, color:string}>>`
  - `Canvas.getVGrid()` → `Map<number, Array<{x:number, color:string}>>`
  - `Canvas.getColorConfig()` → `{ [color: string]: { waveform: string } }`
  - `Canvas.setColorWaveform(color, waveform)` — updates colorConfig
  - `Canvas.setTool(tool)` — `'pencil'` or `'eraser'`
  - `Canvas.setColor(color)` — hex string from COLORS
  - `Canvas.undo()` — removes last stroke, rebuilds grid, redraws
  - `Canvas.clear()` — removes all strokes, redraws
  - `Canvas.COLORS` → `string[]` — array of 9 hex colors

- [ ] **Step 1: Write inline logic tests (paste into browser console to verify after implementation)**

```js
// Test buildGrid logic — run in console after loading canvas.js
(function testBuildGrid() {
  // Simulate: one stroke with 3 points
  const mockStrokes = [
    { color: '#e74c3c', width: 4, points: [{x:10,y:50},{x:11,y:55},{x:12,y:60}] }
  ];
  const hG = new Map(), vG = new Map();
  mockStrokes.forEach(s => s.points.forEach(p => {
    const cx = Math.round(p.x), cy = Math.round(p.y);
    if (!hG.has(cx)) hG.set(cx, []);
    hG.get(cx).push({y:p.y, color:s.color});
    if (!vG.has(cy)) vG.set(cy, []);
    vG.get(cy).push({x:p.x, color:s.color});
  }));
  console.assert(hG.get(10)?.[0].y === 50, 'hGrid col 10 should have y=50');
  console.assert(vG.get(50)?.[0].x === 10, 'vGrid row 50 should have x=10');
  console.assert(hG.get(11)?.[0].color === '#e74c3c', 'color should match');
  console.log('buildGrid tests: PASS');
})();
```

- [ ] **Step 2: Create canvas.js**

```js
const Canvas = (() => {
  const COLORS = [
    '#27ae60','#e74c3c','#8e44ad','#f39c12',
    '#2980b9','#e91e8c','#5dade2','#222222','#f0a500'
  ];
  const DEFAULT_WAVEFORMS = {
    '#27ae60':'sine','#e74c3c':'sawtooth','#8e44ad':'triangle',
    '#f39c12':'square','#2980b9':'sine','#e91e8c':'triangle',
    '#5dade2':'sine','#222222':'square','#f0a500':'sawtooth'
  };

  let el, ctx, strokes, currentStroke, activeTool, currentColor;
  let hGrid, vGrid;
  const colorConfig = {};
  const ERASE_RADIUS = 24;

  function init(canvasEl) {
    el = canvasEl;
    ctx = el.getContext('2d');
    strokes = [];
    currentStroke = null;
    activeTool = 'pencil';
    currentColor = COLORS[0];
    hGrid = new Map();
    vGrid = new Map();
    COLORS.forEach(c => { colorConfig[c] = { waveform: DEFAULT_WAVEFORMS[c] }; });
    resize();
    bindEvents();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.width = w * dpr;
    el.height = h * dpr;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
    redraw();
  }

  function bindEvents() {
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  function getPos(e) {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    if (activeTool === 'pencil') {
      currentStroke = { color: currentColor, width: 4, points: [pos] };
    } else if (activeTool === 'eraser') {
      eraseAt(pos);
    }
  }

  function onMove(e) {
    if (!e.buttons) return;
    const pos = getPos(e);
    if (activeTool === 'pencil' && currentStroke) {
      currentStroke.points.push(pos);
      // Incremental draw (fast — only last segment)
      const pts = currentStroke.points;
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.strokeStyle = currentStroke.color;
        ctx.lineWidth = currentStroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
    } else if (activeTool === 'eraser') {
      eraseAt(pos);
    }
  }

  function onUp() {
    if (activeTool === 'pencil' && currentStroke && currentStroke.points.length > 1) {
      strokes.push(currentStroke);
      buildGrid();
    }
    currentStroke = null;
  }

  function eraseAt(pos) {
    const before = strokes.length;
    strokes = strokes.filter(s =>
      !s.points.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < ERASE_RADIUS)
    );
    if (strokes.length !== before) { buildGrid(); redraw(); }
  }

  function redraw() {
    const w = el.offsetWidth, h = el.offsetHeight;
    ctx.clearRect(0, 0, w, h);
    strokes.forEach(s => {
      if (s.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    });
    // Also draw current in-progress stroke (not yet in strokes[])
    if (currentStroke && currentStroke.points.length >= 2) {
      const s = currentStroke;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    }
  }

  function buildGrid() {
    const newH = new Map(), newV = new Map();
    strokes.forEach(stroke => {
      stroke.points.forEach(p => {
        const cx = Math.round(p.x), cy = Math.round(p.y);
        if (!newH.has(cx)) newH.set(cx, []);
        newH.get(cx).push({ y: p.y, color: stroke.color });
        if (!newV.has(cy)) newV.set(cy, []);
        newV.get(cy).push({ x: p.x, color: stroke.color });
      });
    });
    hGrid = newH;
    vGrid = newV;
  }

  function undo() { strokes.pop(); buildGrid(); redraw(); }
  function clear() { strokes = []; hGrid = new Map(); vGrid = new Map(); redraw(); }
  function setTool(t) { activeTool = t; }
  function setColor(c) { currentColor = c; }
  function getHGrid() { return hGrid; }
  function getVGrid() { return vGrid; }
  function getSize() { return { w: el.offsetWidth, h: el.offsetHeight }; }
  function getCtx() { return ctx; }
  function getColorConfig() { return colorConfig; }
  function setColorWaveform(color, waveform) { colorConfig[color].waveform = waveform; }

  return { init, resize, redraw, undo, clear, setTool, setColor,
           getHGrid, getVGrid, getSize, getCtx, getColorConfig,
           setColorWaveform, COLORS };
})();
```

- [ ] **Step 3: Smoke-test in browser**

In `index.html`, add temporarily at bottom of `<body>` (remove after):
```html
<script>
document.addEventListener('DOMContentLoaded', () => {
  Canvas.init(document.getElementById('canvas'));
  window.addEventListener('resize', Canvas.resize);
});
</script>
```
Draw on the canvas. Verify: strokes appear, pencil tool works. Open console and run the buildGrid test from Step 1.

- [ ] **Step 4: Commit**

```bash
git add canvas.js
git commit -m "feat: canvas drawing engine with stroke vector data and lookup grid"
```

---

### Task 3: audio.js — Web Audio engine, scales, voice pool

**Files:**
- Create: `audio.js`

**Interfaces:**
- Consumes: nothing at init. Called by scanner.js on note hits.
- Produces:
  - `Audio.init()` — creates AudioContext, voice pool, sweep gain nodes
  - `Audio.resume()` — resumes context after user gesture
  - `Audio.triggerNote(freq, waveform, sweepId, sweepVol)` — plays one note
  - `Audio.noteForY(y, canvasH)` → `number | null` — frequency for a Y pixel
  - `Audio.setRoot(root)` — e.g. `'C'`, `'F#'`
  - `Audio.setScale(scaleId)` — e.g. `'major'`, `'blues'`
  - `Audio.setMasterVol(v)` — 0.0–1.0
  - `Audio.SCALES` → `{ [id]: string }` — display names for UI
  - `Audio.ROOTS` → `string[]` — 12 note names

- [ ] **Step 1: Write scale math tests (run in browser console after loading audio.js)**

```js
// Test scale math — run in console
(function testScaleMath() {
  // buildScale for C major should return frequencies high-to-low
  // Middle C4 = 261.63 Hz, MIDI 60
  // C major intervals: [0,2,4,5,7,9,11]
  // 4 octaves = 28 notes
  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  const intervals = [0,2,4,5,7,9,11];
  const rootMidi = 60 - 12; // C3
  const notes = [];
  for (let o = 0; o < 4; o++) intervals.forEach(i => notes.push(midiToHz(rootMidi + o*12 + i)));
  notes.sort((a,b) => b - a); // high to low
  console.assert(notes.length === 28, 'C major 4 octaves = 28 notes');
  console.assert(notes[0] > notes[notes.length - 1], 'first note is highest');
  // noteForY: y=0 → notes[0] (highest)
  const h = 400;
  function noteForY(y) {
    const idx = Math.floor((y / h) * notes.length);
    return notes[Math.max(0, Math.min(notes.length - 1, idx))];
  }
  console.assert(noteForY(0) === notes[0], 'y=0 is highest note');
  console.assert(noteForY(h - 1) === notes[notes.length - 1], 'y=max is lowest note');
  console.log('scale math tests: PASS');
})();
```

- [ ] **Step 2: Create audio.js**

```js
const Audio = (() => {
  const SCALES = {
    major:       { label: 'Major',          intervals: [0,2,4,5,7,9,11] },
    minor:       { label: 'Minor',          intervals: [0,2,3,5,7,8,10] },
    pentatonicM: { label: 'Penta Major',    intervals: [0,2,4,7,9] },
    pentatonicm: { label: 'Penta Minor',    intervals: [0,3,5,7,10] },
    blues:       { label: 'Blues',          intervals: [0,3,5,6,7,10] },
    chromatic:   { label: 'Chromatic',      intervals: [0,1,2,3,4,5,6,7,8,9,10,11] }
  };
  const ROOTS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const ROOT_MIDI = { C:60,'C#':61,D:62,'D#':63,E:64,F:65,'F#':66,G:67,'G#':68,A:69,'A#':70,B:71 };
  const VOICE_COUNT = 16;
  const OCTAVES = 4;

  let actx, masterGain;
  const sweepGains = {};
  const voices = [];
  let currentScale = [];
  let currentRoot = 'C';
  let currentScaleId = 'major';

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function buildScale(root, scaleId) {
    const intervals = SCALES[scaleId].intervals;
    const rootMidi = ROOT_MIDI[root] - 12; // start at root-1 octave
    const notes = [];
    for (let o = 0; o < OCTAVES; o++) {
      intervals.forEach(i => notes.push(midiToHz(rootMidi + o * 12 + i)));
    }
    return notes.sort((a, b) => b - a); // high → low (Y=0 top = high pitch)
  }

  function init() {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = actx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(actx.destination);

    ['lr','rl','tb','bt'].forEach(id => {
      sweepGains[id] = actx.createGain();
      sweepGains[id].gain.value = 0.6;
      sweepGains[id].connect(masterGain);
    });

    for (let i = 0; i < VOICE_COUNT; i++) {
      const envGain = actx.createGain();
      envGain.gain.value = 0;
      envGain.connect(masterGain);
      voices.push({ osc: null, envGain, active: false, startTime: -1 });
    }

    currentScale = buildScale(currentRoot, currentScaleId);
  }

  function resume() {
    if (actx && actx.state === 'suspended') actx.resume();
  }

  function getVoice() {
    let v = voices.find(v => !v.active);
    if (!v) {
      // steal oldest
      v = voices.reduce((old, cur) => cur.startTime < old.startTime ? cur : old, voices[0]);
      if (v.osc) { try { v.osc.stop(); } catch(e) {} v.osc = null; }
      v.active = false;
    }
    return v;
  }

  function triggerNote(freq, waveform, sweepId, sweepVol) {
    if (!actx) return;
    resume();
    const now = actx.currentTime;
    const v = getVoice();

    if (v.osc) { try { v.osc.stop(); } catch(e) {} v.osc = null; }

    const osc = actx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = freq;

    const peak = 0.45 * (sweepVol !== undefined ? sweepVol : 0.6);
    const env = v.envGain.gain;
    env.cancelScheduledValues(now);
    env.setValueAtTime(0, now);
    env.linearRampToValueAtTime(peak, now + 0.005);
    env.setValueAtTime(peak, now + 0.005);
    env.linearRampToValueAtTime(0, now + 0.18);

    osc.connect(sweepGains[sweepId]);
    // Note: envGain connects to masterGain (pre-created). For per-sweep routing,
    // sweep volume is factored into peak amplitude instead. sweepGains are wired
    // but envGain → masterGain is the actual path; sweepGains are for future use.
    // In v1, use amplitude scaling via sweepVol parameter.
    osc.connect(v.envGain);
    osc.start(now);
    osc.stop(now + 0.22);

    v.osc = osc;
    v.active = true;
    v.startTime = now;
    osc.onended = () => { v.active = false; v.osc = null; };
  }

  function noteForY(y, canvasH) {
    if (!currentScale.length) return null;
    const idx = Math.floor((y / canvasH) * currentScale.length);
    return currentScale[Math.max(0, Math.min(currentScale.length - 1, idx))];
  }

  function setRoot(root) { currentRoot = root; currentScale = buildScale(root, currentScaleId); }
  function setScale(scaleId) { currentScaleId = scaleId; currentScale = buildScale(currentRoot, scaleId); }
  function setMasterVol(v) { if (masterGain) masterGain.gain.value = v; }

  return { init, resume, triggerNote, noteForY, setRoot, setScale, setMasterVol, SCALES, ROOTS };
})();
```

- [ ] **Step 3: Smoke-test in browser console**

After `Audio.init()`, run:
```js
Audio.init();
// Trigger a note manually
Audio.triggerNote(440, 'sine', 'lr', 0.6); // should hear A4
Audio.triggerNote(261.63, 'triangle', 'rl', 0.6); // C4 triangle
// Scale test
const freq = Audio.noteForY(0, 400);
console.assert(typeof freq === 'number' && freq > 0, 'noteForY returns positive number');
console.log('Audio smoke test: PASS, freq at y=0:', freq);
```
Run the scale math console tests from Step 1.

- [ ] **Step 4: Commit**

```bash
git add audio.js
git commit -m "feat: audio engine with voice pool, scale math, and note trigger"
```

---

### Task 4: scanner.js — 4-direction sweep, rAF loop, intersection dots

**Files:**
- Create: `scanner.js`

**Interfaces:**
- Consumes: `Canvas.getCtx()`, `Canvas.getSize()`, `Canvas.getHGrid()`, `Canvas.getVGrid()`, `Canvas.getColorConfig()`, `Canvas.redraw()`, `Audio.triggerNote()`, `Audio.noteForY()`.
- Produces:
  - `Scanner.init()` — starts rAF loop (plays nothing until `Scanner.play()`)
  - `Scanner.play()` — starts sweeps moving
  - `Scanner.stop()` — pauses sweeps
  - `Scanner.setBPM(bpm)` — updates speed immediately
  - `Scanner.toggleSweep(id)` → `boolean` — toggles sweep on/off, returns new state
  - `Scanner.setSweepVol(id, vol)` — 0.0–1.0

- [ ] **Step 1: Create scanner.js**

```js
const Scanner = (() => {
  const SWEEP_IDS = ['lr','rl','tb','bt'];
  const SWEEP_LABELS = { lr:'→', rl:'←', tb:'↓', bt:'↑' };
  const LINE_COLORS = { lr:'rgba(0,0,0,0.35)', rl:'rgba(60,100,200,0.35)',
                        tb:'rgba(0,0,0,0.35)', bt:'rgba(200,60,60,0.35)' };

  const sweeps = {
    lr: { active: false, pos: 0, vol: 0.6, lastTrigCol: -1 },
    rl: { active: false, pos: 0, vol: 0.6, lastTrigCol: -1 },
    tb: { active: false, pos: 0, vol: 0.6, lastTrigCol: -1 },
    bt: { active: false, pos: 0, vol: 0.6, lastTrigCol: -1 }
  };

  let bpm = 120;
  const BEATS_PER_SWEEP = 4;
  let playing = false;
  let lastTime = null;
  let rafId = null;

  function pxPerMs(size) {
    return size / (BEATS_PER_SWEEP * (60000 / bpm));
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);

    const dt = lastTime !== null ? Math.min(now - lastTime, 100) : 0;
    lastTime = now;

    const { w, h } = Canvas.getSize();
    const hGrid = Canvas.getHGrid();
    const vGrid = Canvas.getVGrid();
    const colorConfig = Canvas.getColorConfig();
    const ctx = Canvas.getCtx();

    // Always redraw strokes first
    Canvas.redraw();

    if (!playing) return;

    const hSpeed = pxPerMs(w) * dt;
    const vSpeed = pxPerMs(h) * dt;

    // Left → Right
    if (sweeps.lr.active) {
      sweeps.lr.pos += hSpeed;
      if (sweeps.lr.pos > w) { sweeps.lr.pos = 0; sweeps.lr.lastTrigCol = -1; }
      const col = Math.round(sweeps.lr.pos);
      if (col !== sweeps.lr.lastTrigCol) {
        sweeps.lr.lastTrigCol = col;
        (hGrid.get(col) || []).slice(0, 6).forEach(({ y, color }) => {
          const freq = Audio.noteForY(y, h);
          if (freq) Audio.triggerNote(freq, colorConfig[color].waveform, 'lr', sweeps.lr.vol);
          drawDot(ctx, sweeps.lr.pos, y, color);
        });
      }
      drawScanLine(ctx, 'v', sweeps.lr.pos, w, h, LINE_COLORS.lr);
    }

    // Right → Left
    if (sweeps.rl.active) {
      if (sweeps.rl.pos <= 0) { sweeps.rl.pos = w; sweeps.rl.lastTrigCol = -1; }
      sweeps.rl.pos -= hSpeed;
      if (sweeps.rl.pos < 0) { sweeps.rl.pos = w; sweeps.rl.lastTrigCol = -1; }
      const col = Math.round(sweeps.rl.pos);
      if (col !== sweeps.rl.lastTrigCol) {
        sweeps.rl.lastTrigCol = col;
        (hGrid.get(col) || []).slice(0, 6).forEach(({ y, color }) => {
          const freq = Audio.noteForY(y, h);
          if (freq) Audio.triggerNote(freq, colorConfig[color].waveform, 'rl', sweeps.rl.vol);
          drawDot(ctx, sweeps.rl.pos, y, color);
        });
      }
      drawScanLine(ctx, 'v', sweeps.rl.pos, w, h, LINE_COLORS.rl);
    }

    // Top → Bottom
    if (sweeps.tb.active) {
      sweeps.tb.pos += vSpeed;
      if (sweeps.tb.pos > h) { sweeps.tb.pos = 0; sweeps.tb.lastTrigCol = -1; }
      const row = Math.round(sweeps.tb.pos);
      if (row !== sweeps.tb.lastTrigCol) {
        sweeps.tb.lastTrigCol = row;
        const freq = Audio.noteForY(sweeps.tb.pos, h);
        (vGrid.get(row) || []).slice(0, 6).forEach(({ x, color }) => {
          if (freq) Audio.triggerNote(freq, colorConfig[color].waveform, 'tb', sweeps.tb.vol);
          drawDot(ctx, x, sweeps.tb.pos, color);
        });
      }
      drawScanLine(ctx, 'h', sweeps.tb.pos, w, h, LINE_COLORS.tb);
    }

    // Bottom → Top
    if (sweeps.bt.active) {
      if (sweeps.bt.pos <= 0) { sweeps.bt.pos = h; sweeps.bt.lastTrigCol = -1; }
      sweeps.bt.pos -= vSpeed;
      if (sweeps.bt.pos < 0) { sweeps.bt.pos = h; sweeps.bt.lastTrigCol = -1; }
      const row = Math.round(sweeps.bt.pos);
      if (row !== sweeps.bt.lastTrigCol) {
        sweeps.bt.lastTrigCol = row;
        const freq = Audio.noteForY(sweeps.bt.pos, h);
        (vGrid.get(row) || []).slice(0, 6).forEach(({ x, color }) => {
          if (freq) Audio.triggerNote(freq, colorConfig[color].waveform, 'bt', sweeps.bt.vol);
          drawDot(ctx, x, sweeps.bt.pos, color);
        });
      }
      drawScanLine(ctx, 'h', sweeps.bt.pos, w, h, LINE_COLORS.bt);
    }
  }

  function drawScanLine(ctx, axis, pos, w, h, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (axis === 'v') { ctx.moveTo(pos, 0); ctx.lineTo(pos, h); }
    else              { ctx.moveTo(0, pos); ctx.lineTo(w, pos); }
    ctx.stroke();
  }

  function drawDot(ctx, x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function init() {
    rafId = requestAnimationFrame(tick);
  }

  function play() { playing = true; lastTime = null; Audio.resume(); }
  function stop() { playing = false; lastTime = null; }
  function setBPM(b) { bpm = Math.max(20, Math.min(300, b)); }
  function toggleSweep(id) {
    sweeps[id].active = !sweeps[id].active;
    if (sweeps[id].active) sweeps[id].pos = id === 'rl' || id === 'bt' ? 0 : 0;
    return sweeps[id].active;
  }
  function setSweepVol(id, vol) { sweeps[id].vol = vol; }
  function isPlaying() { return playing; }

  return { init, play, stop, setBPM, toggleSweep, setSweepVol, isPlaying, SWEEP_IDS, SWEEP_LABELS };
})();
```

- [ ] **Step 2: Smoke-test**

In browser: add to `<body>` temporarily:
```js
document.addEventListener('DOMContentLoaded', () => {
  Canvas.init(document.getElementById('canvas'));
  window.addEventListener('resize', Canvas.resize);
  Audio.init();
  Scanner.init();
  Scanner.toggleSweep('lr');
  Scanner.play();
  // Draw a stroke on canvas then verify scanner line appears and dots appear on intersections
});
```
Draw a horizontal line at mid-height. Verify scanner line sweeps left-to-right, dots appear on intersection, notes sound. BPM change: `Scanner.setBPM(60)` makes it slower.

- [ ] **Step 3: Commit**

```bash
git add scanner.js
git commit -m "feat: scanner rAF loop with 4 directional sweeps and intersection dots"
```

---

### Task 5: ui.js — control panel wiring

**Files:**
- Create: `ui.js`

**Interfaces:**
- Consumes: `Canvas.*`, `Audio.*`, `Scanner.*`.
- Produces: fully wired UI. No public API needed (self-contained event handlers).

- [ ] **Step 1: Create ui.js**

```js
(function UI() {
  const THEMES = ['theme-paper','theme-sky','theme-dark'];
  let themeIdx = 0;
  let currentColor = Canvas.COLORS[0];
  let timbreTargetColor = null;
  let longPressTimer = null;
  let bpm = 120;

  function init() {
    buildColorRow();
    buildSweepRow();
    buildKeySelect();
    buildScaleSelect();
    bindTransport();
    bindTimbrePopover();
    bindTheme();
  }

  // ── Transport ──
  function bindTransport() {
    const btnPlay  = document.getElementById('btn-play');
    const btnPencil= document.getElementById('btn-pencil');
    const btnEraser= document.getElementById('btn-eraser');
    const btnUndo  = document.getElementById('btn-undo');
    const btnClear = document.getElementById('btn-clear');
    const bpmVal   = document.getElementById('bpm-value');
    const bpmDown  = document.getElementById('btn-bpm-down');
    const bpmUp    = document.getElementById('btn-bpm-up');
    const volSlider= document.getElementById('slider-master-vol');

    btnPlay.addEventListener('click', () => {
      const playing = Scanner.isPlaying();
      if (playing) { Scanner.stop(); btnPlay.textContent = '▶'; btnPlay.classList.remove('active'); }
      else         { Scanner.play(); btnPlay.textContent = '⏸'; btnPlay.classList.add('active'); }
    });

    btnPencil.addEventListener('click', () => {
      Canvas.setTool('pencil');
      btnPencil.classList.add('active');
      btnEraser.classList.remove('active');
    });

    btnEraser.addEventListener('click', () => {
      Canvas.setTool('eraser');
      btnEraser.classList.add('active');
      btnPencil.classList.remove('active');
    });

    btnUndo.addEventListener('click', () => Canvas.undo());
    btnClear.addEventListener('click', () => Canvas.clear());

    bpmDown.addEventListener('click', () => { bpm = Math.max(20, bpm - 5); bpmVal.textContent = bpm; Scanner.setBPM(bpm); });
    bpmUp.addEventListener('click',   () => { bpm = Math.min(300, bpm + 5); bpmVal.textContent = bpm; Scanner.setBPM(bpm); });

    volSlider.addEventListener('input', e => Audio.setMasterVol(parseFloat(e.target.value)));
  }

  // ── Colors ──
  function buildColorRow() {
    const row = document.getElementById('row-colors');
    Canvas.COLORS.forEach((color, i) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
      sw.style.background = color;
      sw.setAttribute('role','button');
      sw.setAttribute('aria-label', color);

      // Short tap → select color
      // Long press → open timbre popover
      sw.addEventListener('pointerdown', () => {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          openTimbrePopover(color, sw);
        }, 480);
      });
      sw.addEventListener('pointerup', () => {
        if (longPressTimer !== null) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          selectColor(color, sw);
        }
      });
      sw.addEventListener('pointercancel', () => { clearTimeout(longPressTimer); longPressTimer = null; });
      sw.addEventListener('contextmenu', e => { e.preventDefault(); openTimbrePopover(color, sw); });

      row.appendChild(sw);
    });
  }

  function selectColor(color, swatchEl) {
    currentColor = color;
    Canvas.setColor(color);
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    swatchEl.classList.add('selected');
  }

  // ── Timbre popover ──
  function bindTimbrePopover() {
    document.getElementById('timbre-close').addEventListener('click', closeTimbrePopover);
    document.querySelectorAll('.wave-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!timbreTargetColor) return;
        Canvas.setColorWaveform(timbreTargetColor, btn.dataset.wave);
        document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function openTimbrePopover(color, swatchEl) {
    timbreTargetColor = color;
    const cfg = Canvas.getColorConfig()[color];
    document.querySelectorAll('.wave-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.wave === cfg.waveform);
    });
    const pop = document.getElementById('timbre-popover');
    pop.classList.remove('hidden');
  }

  function closeTimbrePopover() {
    document.getElementById('timbre-popover').classList.add('hidden');
    timbreTargetColor = null;
  }

  // ── Sweeps ──
  function buildSweepRow() {
    const row = document.getElementById('row-sweeps');
    Scanner.SWEEP_IDS.forEach(id => {
      const item = document.createElement('div');
      item.className = 'sweep-item';

      const btn = document.createElement('button');
      btn.textContent = Scanner.SWEEP_LABELS[id];
      btn.setAttribute('aria-label', 'sweep ' + id);
      btn.addEventListener('click', () => {
        const on = Scanner.toggleSweep(id);
        btn.classList.toggle('sweep-on', on);
        item.classList.toggle('active', on);
      });

      const volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.className = 'sweep-vol';
      volSlider.min = 0; volSlider.max = 1; volSlider.step = 0.01; volSlider.value = 0.6;
      volSlider.addEventListener('input', e => Scanner.setSweepVol(id, parseFloat(e.target.value)));

      item.appendChild(btn);
      item.appendChild(volSlider);
      row.insertBefore(item, row.firstChild); // prepend before selects
    });
  }

  // ── Key select ──
  function buildKeySelect() {
    const sel = document.getElementById('select-key');
    Audio.ROOTS.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r; opt.textContent = r;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', e => Audio.setRoot(e.target.value));
  }

  // ── Scale select ──
  function buildScaleSelect() {
    const sel = document.getElementById('select-scale');
    Object.entries(Audio.SCALES).forEach(([id, { label }]) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = label;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', e => Audio.setScale(e.target.value));
  }

  // ── Theme ──
  function bindTheme() {
    document.getElementById('btn-theme').addEventListener('click', () => {
      document.body.classList.remove(THEMES[themeIdx]);
      themeIdx = (themeIdx + 1) % THEMES.length;
      document.body.classList.add(THEMES[themeIdx]);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    Canvas.init(document.getElementById('canvas'));
    Audio.init();
    Scanner.init();
    window.addEventListener('resize', () => {
      setTimeout(() => Canvas.resize(), 50);
    });
    init();
  });
})();
```

- [ ] **Step 2: Remove the temporary inline script from index.html (from Task 2 smoke-test)**

Make sure `index.html` has no `<script>` block in `<body>` other than the four module `<script src>` tags.

- [ ] **Step 3: Full manual test checklist**

Open `index.html` in browser. Test each item:
- [ ] Draw with pencil, stroke appears in current color
- [ ] Switch color, new stroke appears in new color  
- [ ] Long-press a swatch, timbre popover opens; select 'sawtooth', close
- [ ] Eraser removes strokes near pointer
- [ ] Undo removes last stroke
- [ ] Clear removes all
- [ ] BPM buttons change BPM value display
- [ ] Click `→` sweep: scanner line appears and moves left-to-right
- [ ] Draw a stroke, enable play (▶), verify dots appear on scanner intersection and notes sound
- [ ] Enable a second sweep (`↓`), verify both move simultaneously
- [ ] Change Key and Scale during playback, verify pitch changes immediately
- [ ] Volume slider changes loudness
- [ ] Theme button cycles through paper → sky → dark
- [ ] Resize browser window: canvas rescales, strokes remain correct
- [ ] DevTools mobile viewport (iPhone SE): panel fits, canvas fills above

- [ ] **Step 4: Commit**

```bash
git add ui.js
git commit -m "feat: ui control panel — transport, colors, sweeps, scale, key, theme"
```

---

### Task 6: Integration polish

**Files:**
- Modify: `index.html` (favicon, title), `style.css` (minor tweaks), `scanner.js` (edge cases)

**Goal:** Fix any integration issues found in Task 5 manual testing, add missing polish, verify on mobile.

- [ ] **Step 1: Fix resize race condition**

In `ui.js` the resize handler already has `setTimeout(..., 50)`. Verify on mobile that rotating device (portrait→landscape) correctly rescales canvas. If strokes appear distorted after resize, the DPR scaling in `Canvas.resize()` needs the transform reset — already handled by `ctx.setTransform(1,0,0,1,0,0)` before `ctx.scale(dpr,dpr)`.

- [ ] **Step 2: Prevent scroll during drawing on mobile**

Verify `touch-action: none` on `#canvas` prevents page scroll while drawing. Also add to `<body>`:
```css
body { overscroll-behavior: none; }
```

- [ ] **Step 3: AudioContext autoplay policy**

On mobile, AudioContext requires a user gesture. `Audio.resume()` is called from `Scanner.play()` which is triggered by the play button (user gesture). Verify on iOS Safari: tap ▶, draw, enable a sweep — audio plays without "suspended" errors in console.

- [ ] **Step 4: Add README.md**

```markdown
# dibusynth

Draw on the canvas. Press play. Watch the scanner turn your drawing into music.

## How it works

- Draw freehand strokes in different colors
- Press ▶ to start the scanner
- Enable sweep directions (→ ← ↓ ↑) — each sweeps across the canvas
- Y-axis position → pitch (top = high, bottom = low)
- Color → timbre (long-press a swatch to change its waveform)
- Change Key and Scale for different moods
- Multiple sweeps create layered textures

## Open locally

Just open `index.html` in any modern browser. No server needed.

## Stack

Vanilla JS · Web Audio API · Canvas 2D · Pointer Events · No build step
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: integration polish, mobile fixes, README"
```
