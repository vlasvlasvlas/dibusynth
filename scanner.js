const Scanner = (() => {
  const SWEEP_IDS    = ['lr','rl','tb','bt'];
  const SWEEP_LABELS = { lr:'→', rl:'←', tb:'↓', bt:'↑' };
  const LINE_COLORS  = {
    lr:'rgba(0,0,0,0.35)',   rl:'rgba(60,100,200,0.35)',
    tb:'rgba(0,0,0,0.35)',   bt:'rgba(180,60,60,0.35)'
  };

  const sweeps = {
    lr: { active:false, pos:0, vol:0.6, lastCol:-1 },
    rl: { active:false, pos:0, vol:0.6, lastCol:-1 },
    tb: { active:false, pos:0, vol:0.6, lastCol:-1 },
    bt: { active:false, pos:0, vol:0.6, lastCol:-1 }
  };

  let bpm = 120;
  const BEATS_PER_SWEEP = 4;
  let playing  = false;
  let lastTime = null;
  let rafId    = null;

  function pxPerMs(size) {
    return size / (BEATS_PER_SWEEP * (60000 / bpm));
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);

    const dt = lastTime !== null ? Math.min(now - lastTime, 100) : 0;
    lastTime = now;

    const { w, h }  = Canvas.getSize();
    const hGrid      = Canvas.getHGrid();
    const vGrid      = Canvas.getVGrid();
    const colorCfg   = Canvas.getColorConfig();
    const ctx        = Canvas.getCtx();

    Canvas.redraw();
    if (!playing) return;

    const hs = pxPerMs(w) * dt;
    const vs = pxPerMs(h) * dt;

    // Left → Right
    if (sweeps.lr.active) {
      sweeps.lr.pos += hs;
      if (sweeps.lr.pos > w) { sweeps.lr.pos = 0; sweeps.lr.lastCol = -1; }
      const col = Math.round(sweeps.lr.pos);
      if (col !== sweeps.lr.lastCol) {
        sweeps.lr.lastCol = col;
        (hGrid.get(col) || []).slice(0, 8).forEach(({ y, color }) => {
          const freq = Audio.noteForY(y, h);
          if (freq) Audio.triggerNote(freq, colorCfg[color].waveform, sweeps.lr.vol);
          dot(ctx, sweeps.lr.pos, y, color);
        });
      }
      scanLine(ctx, 'v', sweeps.lr.pos, w, h, LINE_COLORS.lr);
    }

    // Right → Left
    if (sweeps.rl.active) {
      if (sweeps.rl.pos <= 0) { sweeps.rl.pos = w; sweeps.rl.lastCol = -1; }
      sweeps.rl.pos -= hs;
      if (sweeps.rl.pos < 0) { sweeps.rl.pos = w; sweeps.rl.lastCol = -1; }
      const col = Math.round(sweeps.rl.pos);
      if (col !== sweeps.rl.lastCol) {
        sweeps.rl.lastCol = col;
        (hGrid.get(col) || []).slice(0, 8).forEach(({ y, color }) => {
          const freq = Audio.noteForY(y, h);
          if (freq) Audio.triggerNote(freq, colorCfg[color].waveform, sweeps.rl.vol);
          dot(ctx, sweeps.rl.pos, y, color);
        });
      }
      scanLine(ctx, 'v', sweeps.rl.pos, w, h, LINE_COLORS.rl);
    }

    // Top → Bottom
    if (sweeps.tb.active) {
      sweeps.tb.pos += vs;
      if (sweeps.tb.pos > h) { sweeps.tb.pos = 0; sweeps.tb.lastCol = -1; }
      const row = Math.round(sweeps.tb.pos);
      if (row !== sweeps.tb.lastCol) {
        sweeps.tb.lastCol = row;
        const freq = Audio.noteForY(sweeps.tb.pos, h);
        (vGrid.get(row) || []).slice(0, 8).forEach(({ x, color }) => {
          if (freq) Audio.triggerNote(freq, colorCfg[color].waveform, sweeps.tb.vol);
          dot(ctx, x, sweeps.tb.pos, color);
        });
      }
      scanLine(ctx, 'h', sweeps.tb.pos, w, h, LINE_COLORS.tb);
    }

    // Bottom → Top
    if (sweeps.bt.active) {
      if (sweeps.bt.pos <= 0) { sweeps.bt.pos = h; sweeps.bt.lastCol = -1; }
      sweeps.bt.pos -= vs;
      if (sweeps.bt.pos < 0) { sweeps.bt.pos = h; sweeps.bt.lastCol = -1; }
      const row = Math.round(sweeps.bt.pos);
      if (row !== sweeps.bt.lastCol) {
        sweeps.bt.lastCol = row;
        const freq = Audio.noteForY(sweeps.bt.pos, h);
        (vGrid.get(row) || []).slice(0, 8).forEach(({ x, color }) => {
          if (freq) Audio.triggerNote(freq, colorCfg[color].waveform, sweeps.bt.vol);
          dot(ctx, x, sweeps.bt.pos, color);
        });
      }
      scanLine(ctx, 'h', sweeps.bt.pos, w, h, LINE_COLORS.bt);
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

  function init()  { rafId = requestAnimationFrame(tick); }
  function play()  { playing = true;  lastTime = null; Audio.resume(); }
  function stop()  { playing = false; lastTime = null; }
  function isPlaying() { return playing; }
  function setBPM(b) { bpm = Math.max(20, Math.min(300, b)); }

  function toggleSweep(id) {
    sweeps[id].active = !sweeps[id].active;
    if (sweeps[id].active) sweeps[id].lastCol = -1;
    return sweeps[id].active;
  }

  function setSweepVol(id, vol) { sweeps[id].vol = vol; }

  return { init, play, stop, isPlaying, setBPM, toggleSweep, setSweepVol, SWEEP_IDS, SWEEP_LABELS };
})();
