(function UI() {
  let timbreTargetColor = null;
  let longPressTimer    = null;
  let bpm = 90;
  let gradDir = 'to bottom';
  let bg1 = '#f0ebe0', bg2 = '#ffffff';
  let templates = {};

  function init() {
    buildColorRow();
    buildSweepRow();
    loadTemplates();
    buildKeySelect();
    buildScaleSelect();
    bindTransport();
    bindTimbrePopover();
    bindBackground();
    bindQuantize();
    bindMeasures();
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

    const allToolBtns = document.querySelectorAll('.tool-btn');
    function selectTool(tool, btn) {
      Canvas.setTool(tool);
      allToolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    btnPencil.addEventListener('click', () => selectTool('pencil', btnPencil));
    btnEraser.addEventListener('click', () => selectTool('eraser', btnEraser));
    $('btn-line-solid').addEventListener('click',  e => selectTool('line-solid',  e.currentTarget));
    $('btn-line-dashed').addEventListener('click', e => selectTool('line-dashed', e.currentTarget));
    $('btn-circle').addEventListener('click',      e => selectTool('circle',      e.currentTarget));

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
      const wrap = document.createElement('div');
      wrap.className = 'swatch-wrap';

      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
      sw.style.background = color;
      sw.setAttribute('role', 'button');
      sw.setAttribute('aria-label', 'color ' + color);
      sw.tabIndex = 0;

      const editBtn = document.createElement('button');
      editBtn.className  = 'swatch-edit';
      editBtn.textContent = '⚙';
      editBtn.setAttribute('aria-label', 'editar timbre ' + color);
      editBtn.addEventListener('click', e => {
        e.stopPropagation();
        openTimbrePopover(color);
      });

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

      wrap.append(sw, editBtn);
      row.appendChild(wrap);
    });
  }

  function selectColor(color, swEl) {
    Canvas.setColor(color);
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    swEl.classList.add('selected');
  }

  // ── Templates (templates.yaml) ─────────────────────────────────────────────
  async function loadTemplates() {
    try {
      const text = await fetch('templates.yaml').then(r => r.text());
      const parsed = jsyaml.load(text);
      templates = parsed.templates || {};
      buildTemplateSelect();
    } catch (e) {
      console.warn('templates.yaml no disponible', e);
    }
  }

  function buildTemplateSelect() {
    const sel = $('tp-template');
    const ORIG_PREFIX = 'orig_';
    const origKeys = Object.keys(templates).filter(k => k.startsWith(ORIG_PREFIX));
    const artistKeys = Object.keys(templates).filter(k => !k.startsWith(ORIG_PREFIX));

    const grpOrig = document.createElement('optgroup');
    grpOrig.label = 'originales';
    origKeys.forEach(k => {
      const o = document.createElement('option');
      o.value = k; o.textContent = templates[k].label || k;
      grpOrig.appendChild(o);
    });

    const grpArtist = document.createElement('optgroup');
    grpArtist.label = 'inspiraciones';
    artistKeys.forEach(k => {
      const o = document.createElement('option');
      o.value = k; o.textContent = templates[k].label || k;
      grpArtist.appendChild(o);
    });

    sel.appendChild(grpOrig);
    sel.appendChild(grpArtist);

    sel.addEventListener('change', e => {
      const key = e.target.value;
      if (!key || !timbreTargetColor || !templates[key]) return;
      const t = templates[key];
      ['waveform','octave','detune','filterType','filterFreq','filterQ','release','gain']
        .forEach(p => { if (t[p] !== undefined) Canvas.setColorParam(timbreTargetColor, p, t[p]); });
      syncPopoverControls(timbreTargetColor);
      previewTimbre();
    });
  }

  function syncPopoverControls(color) {
    const cfg = Canvas.getColorConfig()[color];
    document.querySelectorAll('.wave-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.wave === cfg.waveform));
    document.querySelectorAll('.oct-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.oct, 10) === cfg.octave));
    document.querySelectorAll('.filt-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.filt === cfg.filterType));
    $('t-cutoff').value  = cfg.filterFreq ?? 2000;
    $('t-q').value       = cfg.filterQ    ?? 1;
    $('t-release').value = cfg.release    ?? 400;
    $('t-detune').value  = cfg.detune     ?? 0;
    $('t-gain').value    = cfg.gain       ?? 0.75;
  }

  // ── Timbre popover ─────────────────────────────────────────────────────────
  function bindTimbrePopover() {
    $('timbre-close').addEventListener('click', closeTimbrePopover);

    // Waveform buttons
    document.querySelectorAll('.wave-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!timbreTargetColor) return;
        Canvas.setColorParam(timbreTargetColor, 'waveform', btn.dataset.wave);
        setActiveInGroup('wave-group', btn);
        previewTimbre();
      });
    });

    // Octave buttons
    document.querySelectorAll('.oct-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!timbreTargetColor) return;
        Canvas.setColorParam(timbreTargetColor, 'octave', parseInt(btn.dataset.oct, 10));
        setActiveInGroup('oct-group', btn);
        previewTimbre();
      });
    });

    // Filter type buttons
    document.querySelectorAll('.filt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!timbreTargetColor) return;
        Canvas.setColorParam(timbreTargetColor, 'filterType', btn.dataset.filt);
        setActiveInGroup('filt-group', btn);
        previewTimbre();
      });
    });

    // Sliders — update in real time + preview note
    const sliderMap = {
      't-cutoff':  { param: 'filterFreq', parse: parseFloat },
      't-q':       { param: 'filterQ',    parse: parseFloat },
      't-release': { param: 'release',    parse: parseFloat },
      't-detune':  { param: 'detune',     parse: parseFloat },
      't-gain':    { param: 'gain',       parse: parseFloat },
    };
    Object.entries(sliderMap).forEach(([id, { param, parse }]) => {
      $(id).addEventListener('input', e => {
        if (!timbreTargetColor) return;
        Canvas.setColorParam(timbreTargetColor, param, parse(e.target.value));
        previewTimbre();
      });
    });

    // Close on outside tap
    document.addEventListener('pointerdown', e => {
      const pop = $('timbre-popover');
      if (!pop.classList.contains('hidden') && !pop.contains(e.target)) closeTimbrePopover();
    }, true);
  }

  function setActiveInGroup(groupId, activeBtn) {
    document.querySelectorAll(`#${groupId} button`).forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  function openTimbrePopover(color) {
    timbreTargetColor = color;
    $('tp-swatch').style.background = color;
    $('tp-template').value = '';
    syncPopoverControls(color);
    $('timbre-popover').classList.remove('hidden');
  }

  function closeTimbrePopover() {
    $('timbre-popover').classList.add('hidden');
    timbreTargetColor = null;
  }

  function previewTimbre() {
    if (!timbreTargetColor) return;
    Audio.resume();
    const cfg = Canvas.getColorConfig()[timbreTargetColor];
    Audio.triggerNote(440, cfg, 0.7, timbreTargetColor);
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
      document.documentElement.style.setProperty('--cell-size', cell + 'px');
    }

    chk.addEventListener('change', update);
    size.addEventListener('input',  update);
  }

  // ── Measures grid ──────────────────────────────────────────────────────────
  function bindMeasures() {
    const chk   = $('chk-measures');
    const count = $('inp-measures');
    const beats = $('sel-beats');

    function update() {
      Canvas.setMeasures(chk.checked, parseInt(count.value, 10), parseInt(beats.value, 10));
    }

    chk.addEventListener('change', update);
    count.addEventListener('input',  update);
    beats.addEventListener('change', update);
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
    // Set panel height CSS var so timbre popover positions above it
    const panel = document.getElementById('panel');
    document.documentElement.style.setProperty('--panel-h', panel.offsetHeight + 'px');
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--panel-h', panel.offsetHeight + 'px');
    }).observe(panel);
  });
})();
