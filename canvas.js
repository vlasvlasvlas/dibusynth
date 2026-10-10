const Canvas = (() => {
  const COLORS = [
    '#27ae60','#e74c3c','#8e44ad','#f39c12',
    '#2980b9','#e91e8c','#5dade2','#222222','#f0a500'
  ];
  // Full synthesis preset per color
  const COLOR_PRESETS = {
    '#27ae60': { waveform:'sine',     octave:0,  detune:0,  filterType:'lowpass',  filterFreq:3500, filterQ:1,   release:600, gain:0.75 }, // bell pad
    '#e74c3c': { waveform:'triangle', octave:-1, detune:5,  filterType:'lowpass',  filterFreq:1800, filterQ:1.5, release:500, gain:0.80 }, // warm bass
    '#8e44ad': { waveform:'triangle', octave:1,  detune:0,  filterType:'lowpass',  filterFreq:5000, filterQ:1,   release:350, gain:0.70 }, // flute
    '#f39c12': { waveform:'sine',     octave:0,  detune:7,  filterType:'lowpass',  filterFreq:4000, filterQ:1,   release:400, gain:0.72 }, // warm tone
    '#2980b9': { waveform:'sine',     octave:0,  detune:0,  filterType:'lowpass',  filterFreq:6000, filterQ:1,   release:900, gain:0.60 }, // pad
    '#e91e8c': { waveform:'triangle', octave:0,  detune:3,  filterType:'bandpass', filterFreq:2200, filterQ:2,   release:300, gain:0.75 }, // pluck
    '#5dade2': { waveform:'sine',     octave:1,  detune:0,  filterType:'none',     filterFreq:8000, filterQ:1,   release:700, gain:0.60 }, // airy
    '#222222': { waveform:'sine',     octave:-1, detune:0,  filterType:'lowpass',  filterFreq:800,  filterQ:1,   release:600, gain:0.85 }, // sub
    '#f0a500': { waveform:'triangle', octave:0,  detune:4,  filterType:'lowpass',  filterFreq:3000, filterQ:1.2, release:450, gain:0.72 }, // mellow saw
  };
  const ERASE_RADIUS = 24;
  const FREE_WIDTH   = 4;
  const SHAPE_WIDTH  = 3;

  let el, ctx;
  let strokes = [];
  let currentStroke = null;   // in-progress freehand stroke
  let shapeStart    = null;   // start point for line/circle tools
  let shapePreview  = null;   // { type, color, p1, p2 } drawn each frame
  let activeTool    = 'pencil';
  let currentColor  = COLORS[0];
  let quantize      = false;
  let cellSize      = 25;
  let hGrid         = new Map();
  let vGrid         = new Map();
  const colorConfig = {};

  function init(canvasEl) {
    el  = canvasEl;
    ctx = el.getContext('2d');
    COLORS.forEach(c => { colorConfig[c] = { ...COLOR_PRESETS[c] }; });
    resize();
    bindEvents();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w   = el.offsetWidth, h = el.offsetHeight;
    el.width  = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    redraw();
  }

  // ── Quantize helpers ─────────────────────────────────────────────────────

  function snapPos(pos) {
    if (!quantize || cellSize <= 0) return pos;
    return {
      x: Math.round(pos.x / cellSize) * cellSize,
      y: Math.round(pos.y / cellSize) * cellSize
    };
  }

  function dedupe(pts) {
    return pts.filter((p, i) =>
      i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y
    );
  }

  // ── Shape point generators (for lookup grid) ─────────────────────────────

  function linePoints(p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(Math.ceil(len), 2);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(snapPos({ x: p1.x + dx * t, y: p1.y + dy * t }));
    }
    return dedupe(pts);
  }

  function circlePoints(cx, cy, r) {
    if (r < 1) return [{ x: cx, y: cy }];
    const steps = Math.max(Math.ceil(2 * Math.PI * r), 8);
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      pts.push(snapPos({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }));
    }
    return dedupe(pts);
  }

  // ── Pointer events ───────────────────────────────────────────────────────

  function bindEvents() {
    el.addEventListener('pointerdown',   onDown);
    el.addEventListener('pointermove',   onMove);
    el.addEventListener('pointerup',     onUp);
    el.addEventListener('pointercancel', onUp);
  }

  function getPos(e) {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const raw = getPos(e);
    if (activeTool === 'pencil') {
      const p = snapPos(raw);
      currentStroke = {
        type: 'free', color: currentColor,
        rawWidth: FREE_WIDTH, width: quantize ? cellSize * 0.7 : FREE_WIDTH,
        rawPoints: [p], points: [p]
      };
    } else if (activeTool === 'eraser') {
      eraseAt(raw);
    } else {
      // line-solid, line-dashed, circle
      shapeStart = snapPos(raw);
      shapePreview = { type: activeTool, color: currentColor, p1: shapeStart, p2: shapeStart };
    }
  }

  function onMove(e) {
    if (!e.buttons) return;
    const raw = getPos(e);
    if (activeTool === 'pencil' && currentStroke) {
      const p = snapPos(raw);
      const pts = currentStroke.rawPoints;
      const last = pts[pts.length - 1];
      if (p.x === last.x && p.y === last.y) return;
      pts.push(p);
      currentStroke.points = pts;
      // Incremental draw (just the last segment — rAF loop redraws full)
      ctx.beginPath();
      ctx.strokeStyle = currentStroke.color;
      ctx.lineWidth   = currentStroke.width;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (activeTool === 'eraser') {
      eraseAt(raw);
    } else if (shapePreview) {
      shapePreview.p2 = snapPos(raw);
      redraw();
    }
  }

  function onUp() {
    if (activeTool === 'pencil' && currentStroke && currentStroke.rawPoints.length > 1) {
      strokes.push(currentStroke);
      buildGrid();
      currentStroke = null;
    } else if (shapePreview && shapeStart) {
      const { type, color, p1, p2 } = shapePreview;
      let pts, extraData;
      if (type === 'circle') {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const r  = Math.sqrt(dx * dx + dy * dy);
        pts = circlePoints(p1.x, p1.y, r);
        extraData = { cx: p1.x, cy: p1.y, r };
      } else {
        pts = linePoints(p1, p2);
        extraData = { p1, p2 };
      }
      if (pts.length > 1) {
        strokes.push({
          type, color, rawWidth: SHAPE_WIDTH, width: SHAPE_WIDTH,
          rawPoints: pts, points: pts, ...extraData
        });
        buildGrid();
      }
      shapePreview = null;
      shapeStart   = null;
      redraw();
    }
    currentStroke = null;
  }

  // ── Erase ────────────────────────────────────────────────────────────────

  function eraseAt(pos) {
    const before = strokes.length;
    strokes = strokes.filter(s =>
      !s.points.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < ERASE_RADIUS)
    );
    if (strokes.length !== before) { buildGrid(); redraw(); }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function redraw() {
    const w = el.offsetWidth, h = el.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    // Grid overlay
    if (quantize && cellSize > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(100,100,100,0.15)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= w; x += cellSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += cellSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.restore();
    }

    strokes.forEach(drawStroke);

    // In-progress freehand
    if (currentStroke && currentStroke.rawPoints.length >= 2) drawStroke(currentStroke);

    // Shape preview
    if (shapePreview) drawShapePreview(shapePreview);
  }

  function drawStroke(s) {
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth   = s.width;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.setLineDash([]);

    if (s.type === 'free') {
      if (s.rawPoints.length < 2) { ctx.restore(); return; }
      ctx.beginPath();
      ctx.moveTo(s.rawPoints[0].x, s.rawPoints[0].y);
      for (let i = 1; i < s.rawPoints.length; i++) ctx.lineTo(s.rawPoints[i].x, s.rawPoints[i].y);
      ctx.stroke();
    } else if (s.type === 'line-solid') {
      ctx.beginPath();
      ctx.moveTo(s.p1.x, s.p1.y);
      ctx.lineTo(s.p2.x, s.p2.y);
      ctx.stroke();
    } else if (s.type === 'line-dashed') {
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.moveTo(s.p1.x, s.p1.y);
      ctx.lineTo(s.p2.x, s.p2.y);
      ctx.stroke();
    } else if (s.type === 'circle') {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShapePreview(sp) {
    ctx.save();
    ctx.strokeStyle = sp.color;
    ctx.lineWidth   = SHAPE_WIDTH;
    ctx.lineCap     = 'round';
    ctx.globalAlpha = 0.65;
    ctx.setLineDash([]);

    if (sp.type === 'circle') {
      const dx = sp.p2.x - sp.p1.x, dy = sp.p2.y - sp.p1.y;
      const r  = Math.sqrt(dx * dx + dy * dy);
      ctx.beginPath();
      ctx.arc(sp.p1.x, sp.p1.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (sp.type === 'line-solid') {
      ctx.beginPath();
      ctx.moveTo(sp.p1.x, sp.p1.y);
      ctx.lineTo(sp.p2.x, sp.p2.y);
      ctx.stroke();
    } else if (sp.type === 'line-dashed') {
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.moveTo(sp.p1.x, sp.p1.y);
      ctx.lineTo(sp.p2.x, sp.p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Lookup grid ──────────────────────────────────────────────────────────

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

  // ── Quantize toggle (reversible) ─────────────────────────────────────────

  function setQuantize(on, size) {
    quantize = on;
    if (size !== undefined) cellSize = size;

    strokes = strokes.map(s => {
      if (on) {
        const snapped = dedupe(s.rawPoints.map(p => snapPos(p)));
        // For shape strokes, re-derive points from geometry with snapping
        let pts = snapped;
        if (s.type === 'line-solid' || s.type === 'line-dashed') {
          pts = linePoints(snapPos(s.p1), snapPos(s.p2));
        } else if (s.type === 'circle') {
          const snappedC = snapPos({ x: s.cx, y: s.cy });
          pts = circlePoints(snappedC.x, snappedC.y, s.r);
        }
        return { ...s, points: pts, width: s.type === 'free' ? cellSize * 0.7 : s.rawWidth };
      } else {
        // Restore original raw points and width
        return { ...s, points: s.rawPoints, width: s.rawWidth };
      }
    });

    buildGrid();
    redraw();
  }

  function setCellSize(size) {
    cellSize = size;
    if (quantize) setQuantize(true, size);
    else redraw(); // re-draw grid lines at new size even when off (for reference when about to enable)
  }

  // ── Public API ───────────────────────────────────────────────────────────

  function undo()  { strokes.pop(); buildGrid(); redraw(); }
  function clear() { strokes = []; currentStroke = null; shapePreview = null; hGrid = new Map(); vGrid = new Map(); redraw(); }
  function setTool(t)  { activeTool = t; shapePreview = null; shapeStart = null; }
  function setColor(c) { currentColor = c; }
  function getHGrid()       { return hGrid; }
  function getVGrid()       { return vGrid; }
  function getSize()        { return { w: el.offsetWidth, h: el.offsetHeight }; }
  function getCtx()         { return ctx; }
  function getColorConfig() { return colorConfig; }
  function setColorWaveform(color, waveform) { colorConfig[color].waveform = waveform; }
  function setColorParam(color, param, value) { colorConfig[color][param] = value; }

  return {
    init, resize, redraw, undo, clear,
    setTool, setColor, setQuantize, setCellSize,
    getHGrid, getVGrid, getSize, getCtx, getColorConfig, setColorWaveform, setColorParam,
    COLORS
  };
})();
