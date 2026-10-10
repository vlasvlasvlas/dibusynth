(function UI() {
  let timbreTargetColor = null;
  let longPressTimer    = null;
  let bpm = 120;
  let gradDir = 'to bottom';
  let bg1 = '#f0ebe0', bg2 = '#ffffff';

  function init() {
    buildColorRow();
    buildSweepRow();
    buildKeySelect();
    buildScaleSelect();
    bindTransport();
    bindTimbrePopover();
    bindBackground();
    bindQuantize();
  }

  // ── Transport ──────────────────────────────────────────────────────────────
  function bindTransport() {
    const btnPlay   = $('btn-play');
    const btnPencil = $('btn-pencil');
    const btnEraser = $('btn-eraser');
    const bpmVal    = $('bpm-value');

    btnPlay.addEventListener('click', () => {
      if (Scanner.isPlaying()) {
        Scanner.stop();
        btnPlay.textContent = '▶';
        btnPlay.classList.remove('active');
      } else {
        Scanner.play();
        btnPlay.textContent = '⏸';
        btnPlay.classList.add('active');
      }
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

    $('btn-undo').addEventListener('click', () => Canvas.undo());
    $('btn-clear').addEventListener('click', () => Canvas.clear());

    $('btn-bpm-down').addEventListener('click', () => {
      bpm = Math.max(20, bpm - 5);
      bpmVal.textContent = bpm;
      Scanner.setBPM(bpm);
    });
    $('btn-bpm-up').addEventListener('click', () => {
      bpm = Math.min(300, bpm + 5);
      bpmVal.textContent = bpm;
      Scanner.setBPM(bpm);
    });

    $('slider-master-vol').addEventListener('input', e => {
      Audio.setMasterVol(parseFloat(e.target.value));
    });
  }

  // ── Color row ──────────────────────────────────────────────────────────────
  function buildColorRow() {
    const row = $('row-colors');
    Canvas.COLORS.forEach((color, i) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
      sw.style.background = color;
      sw.setAttribute('role', 'button');
      sw.setAttribute('aria-label', 'color ' + color);
      sw.tabIndex = 0;

      sw.addEventListener('pointerdown', () => {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          openTimbrePopover(color);
        }, 480);
      });
      sw.addEventListener('pointerup', () => {
        if (longPressTimer !== null) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          selectColor(color, sw);
        }
      });
      sw.addEventListener('pointercancel', () => {
        clearTimeout(longPressTimer); longPressTimer = null;
      });
      sw.addEventListener('contextmenu', e => {
        e.preventDefault(); openTimbrePopover(color);
      });
      sw.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') selectColor(color, sw);
      });

      row.appendChild(sw);
    });
  }

  function selectColor(color, swEl) {
    Canvas.setColor(color);
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    swEl.classList.add('selected');
  }

  // ── Timbre popover ─────────────────────────────────────────────────────────
  function bindTimbrePopover() {
    $('timbre-close').addEventListener('click', closeTimbrePopover);
    document.querySelectorAll('.wave-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!timbreTargetColor) return;
        Canvas.setColorWaveform(timbreTargetColor, btn.dataset.wave);
        document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    // Close on outside tap
    document.addEventListener('pointerdown', e => {
      const pop = $('timbre-popover');
      if (!pop.classList.contains('hidden') && !pop.contains(e.target)) closeTimbrePopover();
    }, true);
  }

  function openTimbrePopover(color) {
    timbreTargetColor = color;
    const cfg = Canvas.getColorConfig()[color];
    document.querySelectorAll('.wave-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.wave === cfg.waveform);
    });
    $('timbre-popover').classList.remove('hidden');
  }

  function closeTimbrePopover() {
    $('timbre-popover').classList.add('hidden');
    timbreTargetColor = null;
  }

  // ── Sweep row ──────────────────────────────────────────────────────────────
  function buildSweepRow() {
    const row = $('row-sweeps');
    const firstChild = row.firstElementChild;

    Scanner.SWEEP_IDS.forEach(id => {
      const item = document.createElement('div');
      item.className = 'sweep-item';

      const btn = document.createElement('button');
      btn.textContent = Scanner.SWEEP_LABELS[id];
      btn.setAttribute('aria-label', 'sweep ' + id);
      btn.style.borderRadius = '8px';
      btn.style.width  = '32px';
      btn.style.height = '32px';
      btn.style.fontSize = '16px';

      const vol = document.createElement('input');
      vol.type      = 'range';
      vol.className = 'sweep-vol';
      vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = 0.6;

      btn.addEventListener('click', () => {
        const on = Scanner.toggleSweep(id);
        btn.classList.toggle('sweep-on', on);
        item.classList.toggle('on', on);
      });
      vol.addEventListener('input', e => {
        Scanner.setSweepVol(id, parseFloat(e.target.value));
      });

      item.append(btn, vol);
      row.insertBefore(item, firstChild);
    });
  }

  // ── Key / Scale ────────────────────────────────────────────────────────────
  function buildKeySelect() {
    const sel = $('select-key');
    Audio.ROOTS.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r; opt.textContent = r;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', e => Audio.setRoot(e.target.value));
  }

  function buildScaleSelect() {
    const sel = $('select-scale');
    Object.entries(Audio.SCALES).forEach(([id, { label }]) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = label;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', e => Audio.setScale(e.target.value));
  }

  // ── Background gradient ────────────────────────────────────────────────────
  function bindBackground() {
    const c1  = $('color-bg1');
    const c2  = $('color-bg2');
    const dir = $('btn-grad-dir');

    function applyGrad() {
      document.documentElement.style.setProperty('--bg1', bg1);
      document.documentElement.style.setProperty('--bg2', bg2);
      document.documentElement.style.setProperty('--grad-dir', gradDir);
      // Re-apply compound background so gradient shows under canvas drawings
      const canvas = document.getElementById('canvas');
      canvas.style.background = `linear-gradient(${gradDir}, ${bg1}, ${bg2})`;
    }

    c1.addEventListener('input', e => { bg1 = e.target.value; applyGrad(); });
    c2.addEventListener('input', e => { bg2 = e.target.value; applyGrad(); });
    dir.addEventListener('click', () => {
      gradDir = gradDir === 'to bottom' ? 'to right' : 'to bottom';
      dir.textContent = gradDir === 'to bottom' ? '↕' : '↔';
      applyGrad();
    });

    applyGrad(); // apply defaults on load
  }

  // ── Quantize ───────────────────────────────────────────────────────────────
  function bindQuantize() {
    const chk  = $('chk-quantize');
    const size = $('slider-cell-size');

    function update() {
      const on   = chk.checked;
      const cell = parseInt(size.value, 10);
      Canvas.setQuantize(on, cell);
      // Update CSS grid size for visual reference
      document.documentElement.style.setProperty('--cell-size', cell + 'px');
    }

    chk.addEventListener('change', update);
    size.addEventListener('input',  update);
  }

  // ── Helper ─────────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  // ── Boot ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    Canvas.init(document.getElementById('canvas'));
    Audio.init();
    Scanner.init();
    window.addEventListener('resize', () => setTimeout(() => Canvas.resize(), 50));
    init();
  });
})();
