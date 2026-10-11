const Scanner = (() => {
  const SWEEP_IDS    = ['lr','rl','tb','bt'];
  const SWEEP_LABELS = { lr:'→', rl:'←', tb:'↓', bt:'↑' };
  const LINE_COLORS  = {
    lr:'rgba(0,0,0,0.30)',   rl:'rgba(60,100,200,0.30)',
    tb:'rgba(0,150,80,0.30)', bt:'rgba(180,60,60,0.30)'
  };

  const sweeps = Object.fromEntries(SWEEP_IDS.map(id => [id, {
    active: false, phase: 0, pos: 0, vol: 0.6, lastDot: -Infinity
  }]));
  let BEATS_PER_SWEEP = 4;
  const LOOKAHEAD = 0.050;
  let bpm = 90;
  let playing = false;
  let mutedColors = new Set();
  let scheduledTime = 0;
  let timerId = null;
  let rafId = null;

  function period() { return BEATS_PER_SWEEP * 60 / bpm; }
  function reverse(id) { return id === 'rl' || id === 'bt'; }
  function horizontal(id) { return id === 'lr' || id === 'rl'; }
  function wrap(phase) { return ((phase % 1) + 1) % 1; }

  function sample(id, coordinate, time, grid, height, configs) {
    const hits = grid.get(coordinate) || [];
    const notes = hits.map(hit => ({
      color: hit.color,
      freq: Audio.noteForY(horizontal(id) ? hit.y : (hit.y ?? coordinate), height)
    })).filter(note => note.freq && !mutedColors.has(note.color));
    Audio.syncSweep(id, notes, configs, sweeps[id].vol, time);
  }

  // Audio is scheduled independently of drawing frames. Visit EVERY crossed
  // column/row, including loop boundaries, so sparse grid notes cannot be skipped.
  function schedule() {
    if (!playing) return;
    const now = Audio.currentTime();
    const { w, h } = Canvas.getSize();
    if (w <= 0 || h <= 0) return;
    const configs = Canvas.getColorConfig();
    if (scheduledTime < now) {
      // A background-tab stall must not replay a burst of overdue notes.
      const missed = now + LOOKAHEAD - scheduledTime;
      for (const s of Object.values(sweeps)) if (s.active) s.phase = wrap(s.phase + missed / period());
      Audio.stopAll();
      scheduledTime = now + LOOKAHEAD;
    }
    const end = now + LOOKAHEAD;
    const elapsed = Math.max(0, end - scheduledTime);
    for (const id of SWEEP_IDS) {
      const s = sweeps[id];
      if (!s.active) continue;
      const size = Math.max(1, Math.round(horizontal(id) ? w : h));
      const grid = horizontal(id) ? Canvas.getHGrid() : Canvas.getVGrid();
      const start = s.phase * size;
      const finish = start + elapsed * size / period();
      const coord = travel => reverse(id) ? size - travel : travel;
      sample(id, coord(Math.floor(start + 1e-7)), scheduledTime, grid, h, configs);
      for (let boundary = Math.floor(start + 1e-7) + 1; boundary <= finish + 1e-7; boundary++) {
        const time = scheduledTime + (boundary - start) * period() / size;
        const cell = boundary % size;
        if (cell === 0) sample(id, coord(size), time, grid, h, configs);
        sample(id, coord(cell), time, grid, h, configs);
      }
      s.phase = wrap(finish / size);
    }
    scheduledTime = end;
  }

  function visiblePhase(s) {
    return playing ? wrap(s.phase - Math.max(0, scheduledTime - Audio.currentTime()) / period()) : s.phase;
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    const { w, h } = Canvas.getSize();
    const ctx = Canvas.getCtx();
    Canvas.redraw();
    if (!playing) return;
    for (const id of SWEEP_IDS) {
      const s = sweeps[id];
      if (!s.active) continue;
      const isH = horizontal(id);
      const size = isH ? w : h;
      s.pos = (reverse(id) ? 1 - visiblePhase(s) : visiblePhase(s)) * size;
      const grid = isH ? Canvas.getHGrid() : Canvas.getVGrid();
      if (Math.abs(s.pos - s.lastDot) >= 20) {
        s.lastDot = s.pos;
        for (const hit of (grid.get(Math.round(s.pos)) || []).slice(0, 4)) {
          dot(ctx, isH ? s.pos : hit.x, isH ? hit.y : s.pos, hit.color);
        }
      }
      scanLine(ctx, isH ? 'v' : 'h', s.pos, w, h, LINE_COLORS[id]);
    }
  }

  function scanLine(ctx, axis, pos, w, h, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    if (axis === 'v') { ctx.moveTo(pos, 0); ctx.lineTo(pos, h); }
    else              { ctx.moveTo(0, pos); ctx.lineTo(w, pos); }
    ctx.stroke();
    ctx.restore();
  }

  function dot(ctx, x, y, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function init(settings = {}) {
    bpm = settings.music?.bpm ?? 90;
    BEATS_PER_SWEEP = settings.music?.beatsPerSweep ?? 4;
    for (const id of SWEEP_IDS) {
      sweeps[id].active = settings.sweeps?.[id]?.active ?? false;
      sweeps[id].vol = settings.sweeps?.[id]?.volume ?? 0.6;
    }
    mutedColors = new Set((settings.palette || []).filter(p => p.muted).map(p => p.color));
    rafId = requestAnimationFrame(tick);
  }
  function play() {
    if (playing) return;
    Audio.resume();
    playing = true;
    scheduledTime = Audio.currentTime() + LOOKAHEAD;
    schedule();
    timerId = setInterval(schedule, 10);
  }
  function stop() {
    for (const s of Object.values(sweeps)) s.phase = visiblePhase(s);
    playing = false;
    clearInterval(timerId);
    timerId = null;
    Audio.stopAll();
  }
  function isPlaying() { return playing; }
  function setBPM(b) {
    const wasPlaying = playing;
    if (wasPlaying) stop();
    bpm = Math.max(20, Math.min(300, b));
    if (wasPlaying) play();
  }

  function toggleSweep(id) {
    const s = sweeps[id];
    if (s.active) {
      s.phase = visiblePhase(s);
      Audio.releaseSweep(id);
    }
    s.active = !s.active;
    return s.active;
  }

  function setSweepVol(id, vol) { sweeps[id].vol = vol; }
  function setMutedColors(set) { mutedColors = set; }

  function isSweepActive(id) { return sweeps[id]?.active ?? false; }

  return { init, play, stop, isPlaying, setBPM, toggleSweep, setSweepVol, setMutedColors, isSweepActive, SWEEP_IDS, SWEEP_LABELS };
})();
