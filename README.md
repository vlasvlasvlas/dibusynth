# dibusynth

Draw on the canvas. Press play. Watch the scanner turn your drawing into music.

## How it works

- Draw freehand strokes with different colors
- Press ▶ to start the scanner
- Enable sweep directions (→ ← ↓ ↑) — each sweeps across the canvas independently
- **Y-axis position → pitch** (top = high, bottom = low)
- **Color → timbre** (long-press a color swatch to change its waveform: sine / triangle / square / sawtooth)
- Change Key and Scale for different moods — takes effect immediately
- Multiple sweeps active at once create layered textures
- **Grid quantize**: toggle "grid" to snap drawing to cells — each cell is one note, clean discrete jumps. Off = smooth glissando following every pixel.

## Controls

| Control | Action |
|---------|--------|
| ▶ / ⏸ | Play / pause scanner |
| ✏ / ◻ | Pencil / eraser tool |
| ↩ | Undo last stroke |
| ✕ | Clear canvas |
| − 120 + | BPM |
| vol slider | Master volume |
| Color swatches | Select draw color (long-press = configure timbre) |
| → ← ↓ ↑ | Toggle sweep directions (each has its own volume slider) |
| Key / Scale | Root note and musical scale |
| grid checkbox | Quantize on/off |
| grid size slider | Cell size (smaller = smoother pitch, larger = more quantized) |
| Color pickers | Background gradient colors |
| ↕ / ↔ | Gradient direction |

## Open locally

Just open `index.html` in any modern browser. No server needed, no build step.

## Stack

Vanilla JS · Web Audio API · Canvas 2D · Pointer Events · No dependencies
