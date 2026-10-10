const Canvas = (() => {
  const COLORS = [
    '#27ae60','#e74c3c','#8e44ad','#f39c12',
    '#2980b9','#e91e8c','#5dade2','#222222','#f0a500'
  ];
  const DEFAULT_WAVEFORMS = {
    '#27ae60':'sine',  '#e74c3c':'sawtooth', '#8e44ad':'triangle',
    '#f39c12':'square','#2980b9':'sine',     '#e91e8c':'triangle',
    '#5dade2':'sine',  '#222222':'square',   '#f0a500':'sawtooth'
  };
  const ERASE_RADIUS = 24;

  let el, ctx;
  let strokes = [];
  let currentStroke = null;
  let activeTool = 'pencil';
  let currentColor = COLORS[0];
  let quantize = false;
  let cellSize = 30;
  let hGrid = new Map();
  let vGrid = new Map();
  const colorConfig = {};

  function init(canvasEl) {
    el = canvasEl;
    ctx = el.getContext('2d');
    COLORS.forEach(c => { colorConfig[c] = { waveform: DEFAULT_WAVEFORMS[c] }; });
    resize();
    bindEvents();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.width  = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    redraw();
  }

  function snapPos(pos) {
    if (!quantize) return pos;
    return {
      x: Math.round(pos.x / cellSize) * cellSize,
      y: Math.round(pos.y / cellSize) * cellSize
    };
  }

  function bindEvents() {
    el.addEventListener('pointerdown',  onDown);
    el.addEventListener('pointermove',  onMove);
    el.addEventListener('pointerup',    onUp);
    el.addEventListener('pointercancel',onUp);
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
      currentStroke = { color: currentColor, width: quantize ? cellSize * 0.7 : 4, points: [snapPos(raw)] };
    } else if (activeTool === 'eraser') {
      eraseAt(raw);
    }
  }

  function onMove(e) {
    if (!e.buttons) return;
    const raw = getPos(e);
    if (activeTool === 'pencil' && currentStroke) {
      const snapped = snapPos(raw);
      const pts = currentStroke.points;
      // Deduplicate snapped points (important for quantize mode)
      const last = pts[pts.length - 1];
      if (snapped.x === last.x && snapped.y === last.y) return;
      pts.push(snapped);
      // Incremental draw — only last segment
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.strokeStyle = currentStroke.color;
        ctx.lineWidth   = currentStroke.width;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
    } else if (activeTool === 'eraser') {
      eraseAt(raw);
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

    // Draw quantize grid overlay
    if (quantize && cellSize > 0) {
      ctx.strokeStyle = 'rgba(100,100,100,0.18)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= w; x += cellSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += cellSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }

    // Draw committed strokes
    strokes.forEach(drawFullStroke);

    // Draw in-progress stroke
    if (currentStroke && currentStroke.points.length >= 2) drawFullStroke(currentStroke);
  }

  function drawFullStroke(s) {
    if (s.points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth   = s.width;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
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

  function undo()  { strokes.pop(); buildGrid(); redraw(); }
  function clear() { strokes = []; hGrid = new Map(); vGrid = new Map(); redraw(); }

  function setTool(t)  { activeTool = t; }
  function setColor(c) { currentColor = c; }
  function setQuantize(on, size) {
    quantize = on;
    if (size !== undefined) cellSize = size;
    // Rebuild grid with snapped coordinates when toggling
    if (on) {
      strokes = strokes.map(s => ({
        ...s,
        width: cellSize * 0.7,
        points: s.points.map(p => snapPos(p))
      }));
    }
    buildGrid();
    redraw();
  }
  function setCellSize(size) {
    cellSize = size;
    if (quantize) setQuantize(true, size);
  }

  function getHGrid()      { return hGrid; }
  function getVGrid()      { return vGrid; }
  function getSize()       { return { w: el.offsetWidth, h: el.offsetHeight }; }
  function getCtx()        { return ctx; }
  function getColorConfig(){ return colorConfig; }
  function setColorWaveform(color, waveform) { colorConfig[color].waveform = waveform; }

  return {
    init, resize, redraw, undo, clear,
    setTool, setColor, setQuantize, setCellSize,
    getHGrid, getVGrid, getSize, getCtx, getColorConfig, setColorWaveform,
    COLORS
  };
})();
