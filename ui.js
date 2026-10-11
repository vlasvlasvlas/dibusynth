(function UI() {
  let timbreTargetColor = null;
  let selectedColor = null;
  let activePopover = null;
  let popoverAnchor = null;
  let returnFocus = null;
  let longPressTimer    = null;
  const mutedColors     = new Set();
  let bpm = 90;
  let gradDir = 'to bottom';
  let bg1 = '#f0ebe0', bg2 = '#ffffff';
  let templates = {};
  let settings;

  function init() {
    buildColorRow();
    buildSweepRow();
    buildTemplateSelect();
    buildKeySelect();
    buildScaleSelect();
    bindTransport();
    bindTimbrePopover();
    bindBackground();
    bindQuantize();
    bindMeasures();
    bindPopovers();
    selectedColor = settings.drawing.selectedColor;
    applyInitialControls();
    $('btn-edit-color').addEventListener('click', () => openTimbrePopover(selectedColor));
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
        btnPlay.setAttribute('aria-label', 'Reproducir');
        btnPlay.classList.remove('active');
      } else {
        // Si no hay ningún barrido activo, activar el lr (izq→der) automáticamente
        if (!Scanner.SWEEP_IDS.some(id => Scanner.isSweepActive(id))) {
          const lrBtn = document.querySelector('#row-sweeps .sweep-item button');
          if (lrBtn) lrBtn.click();
        }
        Scanner.play();
        btnPlay.textContent = '⏸';
        btnPlay.setAttribute('aria-label', 'Pausar');
        btnPlay.classList.add('active');
      }
    });

    const allToolBtns = document.querySelectorAll('.tool-btn');
    const lineKind = $('line-kind'), createKind = $('create-kind');
    if (settings.drawing.tool.startsWith('line-')) lineKind.value = settings.drawing.tool;
    if (['circle','square','triangle','star','text'].includes(settings.drawing.tool)) createKind.value = settings.drawing.tool;
    function selectTool(tool, btn) {
      Canvas.setTool(tool);
      allToolBtns.forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
      hidePopover();
    }
    const bindings = [
      [btnPencil, () => 'pencil'], [btnEraser, () => 'eraser'],
      [$('btn-line-solid'), () => lineKind.value], [$('btn-circle'), () => createKind.value],
      [$('btn-move'), () => 'move'], [$('btn-paint'), () => 'paint']
    ];
    bindings.forEach(([btn, tool]) => {
      let held = false, timer, origin;
      btn.addEventListener('click', e => { if (held) { held = false; e.preventDefault(); return; } selectTool(tool(), btn); });
      const cancel = () => clearTimeout(timer);
      btn.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') return;
        held = false; origin = {x:e.clientX,y:e.clientY};
        timer = setTimeout(() => { held = true; selectTool(tool(), btn); openDashPopover(); }, 480);
      });
      btn.addEventListener('pointermove', e => { if (origin && Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>8) cancel(); });
      btn.addEventListener('pointerup', cancel);
      btn.addEventListener('pointercancel', cancel);
      btn.addEventListener('contextmenu', e => { e.preventDefault(); selectTool(tool(), btn); openDashPopover(); });
    });
    $('btn-dash-settings').addEventListener('click', openDashPopover);
    $('dash-close').addEventListener('click', () => hidePopover(true));
    lineKind.addEventListener('change', () => { Canvas.setTool(lineKind.value); refreshToolOptions(); });
    createKind.addEventListener('change', () => { Canvas.setTool(createKind.value); refreshToolOptions(); });
    $('tool-width').addEventListener('input', e => { Canvas.setWidth(Number(e.target.value)); $('tool-width-val').value = e.target.value; });
    $('eraser-size').addEventListener('input', e => Canvas.setEraserRadius(Number(e.target.value)));
    $('annotation-text').addEventListener('input', e => Canvas.setAnnotation(e.target.value));
    $('text-size').addEventListener('input', e => Canvas.setTextSize(Number(e.target.value)));

    $('btn-undo').addEventListener('click', () => Canvas.undo());
    $('btn-clear').addEventListener('click', () => Canvas.clear());

    $('btn-bpm-down').addEventListener('click', () => {
      bpm = Math.max(20, bpm - settings.music.bpmStep);
      bpmVal.textContent = bpm;
      Scanner.setBPM(bpm);
    });
    $('btn-bpm-up').addEventListener('click', () => {
      bpm = Math.min(300, bpm + settings.music.bpmStep);
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
      const instrument = settings.palette.find(p => p.color === color);
      sw.className = 'color-swatch' + (color === settings.drawing.selectedColor ? ' selected' : '');
      sw.style.background = color;
      sw.setAttribute('role', 'button');
      sw.setAttribute('aria-label', instrument.label);
      sw.title = instrument.label;
      sw.setAttribute('aria-pressed', String(color === settings.drawing.selectedColor));
      sw.tabIndex = 0;

      const muteBtn = document.createElement('button');
      muteBtn.className = 'swatch-mute';
      muteBtn.textContent = 'M';
      muteBtn.title = 'Silenciar este instrumento';
      muteBtn.setAttribute('aria-pressed', 'false');
      muteBtn.setAttribute('aria-label', 'Silenciar ' + instrument.label);
      muteBtn.classList.toggle('muted', mutedColors.has(color));
      muteBtn.setAttribute('aria-pressed', String(mutedColors.has(color)));
      muteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (mutedColors.has(color)) {
          mutedColors.delete(color);
          muteBtn.classList.remove('muted');
        } else {
          mutedColors.add(color);
          muteBtn.classList.add('muted');
        }
        muteBtn.setAttribute('aria-pressed', String(mutedColors.has(color)));
        Scanner.setMutedColors(new Set(mutedColors));
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
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectColor(color, sw); }
      });

      wrap.append(sw, muteBtn);
      row.appendChild(wrap);
    });
  }

  function selectColor(color, swEl) {
    selectedColor = color;
    Canvas.setColor(color);
    document.querySelectorAll('.color-swatch').forEach(s => { s.classList.remove('selected'); s.setAttribute('aria-pressed', 'false'); });
    swEl.classList.add('selected');
    swEl.setAttribute('aria-pressed', 'true');
  }

  // ── Templates (templates.yaml) ─────────────────────────────────────────────
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

  }

  function setActiveInGroup(groupId, activeBtn) {
    document.querySelectorAll(`#${groupId} button`).forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  function openTimbrePopover(color) {
    showPopover($('timbre-popover'), $('btn-edit-color'));
    timbreTargetColor = color;
    $('tp-swatch').style.background = color;
    $('tp-template').value = '';
    syncPopoverControls(color);
    positionPopover();
    $('tp-template').focus({ preventScroll: true });
  }

  function closeTimbrePopover() {
    hidePopover(true);
  }

  function previewTimbre() {
    if (!timbreTargetColor) return;
    Audio.resume();
    const cfg = Canvas.getColorConfig()[timbreTargetColor];
    Audio.triggerNote(440, cfg, 0.7, timbreTargetColor);
  }

  // ── Dash gap popover ───────────────────────────────────────────────────────
  function openDashPopover(e) {
    refreshToolOptions();
    const pop = $('dash-popover');
    const slider = $('slider-dash-gap');
    slider.value = Canvas.getDashGap();
    updateDashPreview(Canvas.getDashGap());

    showPopover(pop, $('btn-dash-settings'));
    pop.querySelector('button').focus({ preventScroll: true });

    slider.oninput = ev => {
      const val = parseInt(ev.target.value, 10);
      Canvas.setDashGap(val);
      updateDashPreview(val);
    };

  }

  function refreshToolOptions() {
    const tool = Canvas.getTool();
    const line = tool.startsWith('line-');
    const create = ['circle','square','triangle','star','text'].includes(tool);
    const visible = { 'line-options': line, 'create-options': create, 'width-options': tool === 'pencil' || line || (create && tool !== 'text'), 'erase-options': tool === 'eraser', 'text-options': tool === 'text', 'paint-options': tool === 'paint', 'dash-options': tool === 'line-dashed', 'visual-options-note': tool === 'pencil' || line || (create && tool !== 'text') };
    Object.entries(visible).forEach(([id, show]) => { $(id).hidden = !show; });
    $('tool-options-title').textContent = 'Opciones de ' + (line ? 'línea' : create ? 'crear' : tool === 'pencil' ? 'dibujo libre' : tool === 'paint' ? 'color / sonido' : 'borrado');
    const w = Canvas.getWidth(); $('tool-width').value = w; $('tool-width-val').value = w;
    $('eraser-size').value = Canvas.getEraserRadius();
    $('annotation-text').value = Canvas.getAnnotation();
    $('text-size').value = Canvas.getTextSize();
    positionPopover();
  }

  function updateDashPreview(gap) {
    const dash = Math.max(4, gap * 1.4);
    const line = document.querySelector('#dash-preview-svg line');
    if (line) line.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${gap}`);
  }

  function hidePopover(restoreFocus = false) {
    if (!activePopover) return;
    activePopover.classList.add('hidden');
    popoverAnchor?.setAttribute('aria-expanded', 'false');
    if (activePopover.id === 'timbre-popover') timbreTargetColor = null;
    activePopover = null;
    popoverAnchor = null;
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function showPopover(pop, anchor) {
    hidePopover();
    returnFocus = document.activeElement === document.body ? anchor : document.activeElement;
    activePopover = pop;
    popoverAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    pop.classList.remove('hidden');
    positionPopover();
  }

  function positionPopover() {
    if (!activePopover) return;
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    activePopover.style.maxWidth = Math.max(0, width - 16) + 'px';
    activePopover.style.maxHeight = Math.max(0, height - 16) + 'px';
    const box = activePopover.getBoundingClientRect();
    const anchor = popoverAnchor.getBoundingClientRect();
    const left = Math.max(x + 8, Math.min(anchor.left, x + width - box.width - 8));
    let top = anchor.top - box.height - 8;
    if (top < y + 8) top = anchor.bottom + 8;
    top = Math.max(y + 8, Math.min(top, y + height - box.height - 8));
    activePopover.style.left = left + 'px';
    activePopover.style.top = top + 'px';
  }

  function bindPopovers() {
    const about = $('about-popover');
    $('btn-about').addEventListener('click', () => {
      hidePopover();
      about.showModal();
      $('btn-about').setAttribute('aria-expanded', 'true');
      $('about-close').focus();
    });
    $('about-close').addEventListener('click', () => about.close());
    about.addEventListener('close', () => { $('btn-about').setAttribute('aria-expanded', 'false'); $('btn-about').focus({ preventScroll: true }); });
    about.addEventListener('click', e => {
      const r = about.getBoundingClientRect();
      if (e.target === about && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) about.close();
    });
    document.addEventListener('pointerdown', e => {
      if (activePopover && !activePopover.contains(e.target) && !popoverAnchor.contains(e.target)) hidePopover();
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && activePopover) { e.preventDefault(); hidePopover(true); }
    });
    window.addEventListener('resize', positionPopover);
    document.addEventListener('scroll', positionPopover, true);
    window.visualViewport?.addEventListener('resize', positionPopover);
    window.visualViewport?.addEventListener('scroll', positionPopover);
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
      btn.setAttribute('aria-label', 'Barrido ' + Scanner.SWEEP_LABELS[id]);
      btn.title = 'Barrido ' + Scanner.SWEEP_LABELS[id];
      const initial = settings.sweeps[id];
      btn.setAttribute('aria-pressed', String(initial.active));
      btn.classList.toggle('sweep-on', initial.active);
      item.classList.toggle('on', initial.active);
      btn.style.borderRadius = '8px';
      btn.style.width  = '32px';
      btn.style.height = '32px';
      btn.style.fontSize = '16px';

      const vol = document.createElement('input');
      vol.type      = 'range';
      vol.className = 'sweep-vol';
      vol.setAttribute('aria-label', 'Volumen del barrido ' + Scanner.SWEEP_LABELS[id]);
      vol.disabled = !initial.active;
      vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = initial.volume;

      btn.addEventListener('click', () => {
        const on = Scanner.toggleSweep(id);
        btn.classList.toggle('sweep-on', on);
        item.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
        vol.disabled = !on;
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
    const beats = $('sel-beats');
    function update() {
      Canvas.setMeasures(chk.checked, 1, parseInt(beats.value, 10));
    }
    chk.addEventListener('change', update);
    beats.addEventListener('change', update);
  }

  function applyInitialControls() {
    $('bpm-value').textContent = settings.music.bpm;
    $('slider-master-vol').value = settings.music.masterVolume;
    $('select-key').value = settings.music.root;
    $('select-scale').value = settings.music.scale;
    $('chk-quantize').checked = settings.drawing.quantize;
    $('slider-cell-size').value = settings.drawing.cellSize;
    $('chk-measures').checked = settings.drawing.guides;
    $('sel-beats').value = settings.drawing.divisions;
    $('slider-dash-gap').value = settings.drawing.dashGap;
    $('color-bg1').value = settings.background.first;
    $('color-bg2').value = settings.background.second;
    $('btn-grad-dir').textContent = gradDir === 'to bottom' ? '↕' : '↔';
    const tools = { pencil: 'btn-pencil', 'line-solid': 'btn-line-solid', 'line-dashed': 'btn-line-solid', square: 'btn-circle', triangle: 'btn-circle', star: 'btn-circle', text: 'btn-circle', paint: 'btn-paint', move: 'btn-move', circle: 'btn-circle', eraser: 'btn-eraser' };
    document.querySelectorAll('.tool-btn').forEach(button => {
      const active = button.id === tools[settings.drawing.tool];
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  // ── Helper ─────────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  // ── Boot ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    window.dibusynthReady = boot();
  }, { once: true });

  async function boot() {
    const loaded = await AppConfig.load();
    settings = loaded.settings;
    if (settings.background.randomize) {
      const colors = settings.palette.map(item => item.color);
      const first = colors.splice(Math.floor(Math.random() * colors.length), 1)[0];
      const second = colors.length ? colors[Math.floor(Math.random() * colors.length)] : first;
      const soften = color => '#' + [1, 3, 5].map(offset => {
        const channel = parseInt(color.slice(offset, offset + 2), 16);
        return Math.round(255 + (channel - 255) * settings.background.tint).toString(16).padStart(2, '0');
      }).join('');
      settings.background.first = soften(first);
      settings.background.second = soften(second);
    }
    templates = loaded.templates;
    bpm = settings.music.bpm;
    bg1 = settings.background.first;
    bg2 = settings.background.second;
    gradDir = settings.background.direction;
    settings.palette.filter(p => p.muted).forEach(p => mutedColors.add(p.color));
    Audio.init(settings.music);
    Canvas.init(document.getElementById('canvas'), settings);
    Scanner.init(settings);
    if (loaded.warnings.length) {
      const status = $('config-status');
      status.hidden = false;
      status.textContent = 'Hay ajustes YAML que no se pudieron cargar. Se usaron valores de respaldo; revisá los archivos y la consola del navegador.';
      console.warn('Configuración de dibusynth:', loaded.warnings);
    }
    window.addEventListener('resize', () => setTimeout(() => Canvas.resize(), 50));
    init();
    // Set panel height CSS var so timbre popover positions above it
    const panel = document.getElementById('panel');
    document.documentElement.style.setProperty('--panel-h', panel.offsetHeight + 'px');
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--panel-h', panel.offsetHeight + 'px');
    }).observe(panel);
  }
})();
