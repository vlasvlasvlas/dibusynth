const AppConfig = (() => {
  const colors = ['#27ae60', '#e74c3c', '#8e44ad', '#f39c12', '#2980b9', '#e91e8c', '#5dade2', '#222222', '#f0a500'];
  const names = ['Verde', 'Rojo', 'Violeta', 'Naranja', 'Azul', 'Rosa', 'Celeste', 'Negro', 'Dorado'];
  const defaults = {
    music: { bpm: 90, bpmStep: 5, masterVolume: 0.65, root: 'C', scale: 'major', octaves: 4, baseOctave: 3, beatsPerSweep: 4 },
    sweeps: Object.fromEntries(['lr', 'rl', 'tb', 'bt'].map(id => [id, { active: false, volume: 0.6 }])),
    drawing: { tool: 'pencil', selectedColor: colors[0], pencilWidth: 4, shapeWidth: 3, eraserRadius: 24, dashGap: 7, quantize: false, cellSize: 25, guides: false, divisions: 4, octaveGuides: true, text: '', textSize: 24 },
    background: { randomize: true, tint: 0.05, first: '#f0ebe0', second: '#ffffff', direction: 'to bottom' },
    palette: colors.map((color, i) => ({ color, label: names[i], preset: 'orig_' + names[i].toLowerCase(), muted: false, sound: {} }))
  };
  const soundDefaults = { waveform: 'sine', octave: 0, detune: 0, filterType: 'none', filterFreq: 2000, filterQ: 1, release: 400, gain: 0.75 };
  const soundRules = {
    waveform: ['sine', 'triangle', 'square', 'sawtooth'], octave: [-2, 2, 1], detune: [-50, 50],
    filterType: ['none', 'lowpass', 'highpass', 'bandpass'], filterFreq: [50, 18000], filterQ: [0.1, 20], release: [20, 3000], gain: [0, 1]
  };
  const rules = {
    music: { bpm: [20, 300, 1], bpmStep: [1, 50, 1], masterVolume: [0, 1], root: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], scale: ['major', 'minor', 'pentatonicM', 'pentatonicm', 'blues', 'chromatic'], octaves: [1, 4, 1], baseOctave: [0, 3, 1], beatsPerSweep: [1, 32, 1] },
    drawing: { tool: ['pencil', 'line-solid', 'line-dashed', 'circle', 'square', 'triangle', 'star', 'text', 'paint', 'eraser'], selectedColor: 'color', pencilWidth: [1, 24], shapeWidth: [1, 24], eraserRadius: [4, 100], dashGap: [2, 50, 1], quantize: 'boolean', cellSize: [10, 80, 5], guides: 'boolean', divisions: [2, 3, 4, 6, 8, 12, 16].map(String), octaveGuides: 'boolean', text: 'text', textSize: [12, 72, 1] },
    background: { randomize: 'boolean', tint: [0, 1], first: 'color', second: 'color', direction: ['to bottom', 'to right'] }
  };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  function normalize(raw = {}, rawTemplates = {}) {
    const settings = JSON.parse(JSON.stringify(defaults));
    const warnings = [];
    function validate(value, rule) {
      if (rule === 'text') return typeof value === 'string' && value.length <= 200;
      if (rule === 'boolean') return typeof value === 'boolean';
      if (rule === 'color') return hex(value);
      if (typeof rule[0] === 'string') return rule.includes(value);
      return typeof value === 'number' && Number.isFinite(value) && value >= rule[0] && value <= rule[1] && (!rule[2] || value % rule[2] === 0);
    }
    function fields(input, target, schema, prefix) {
      if (!object(input)) { warnings.push(prefix + ': se esperaba un mapa'); return; }
      for (const [key, value] of Object.entries(input)) {
        const rule = schema[key];
        if (!Object.hasOwn(schema, key)) { warnings.push(prefix + '.' + key + ': campo desconocido'); continue; }
        const candidate = key === 'divisions' ? String(value) : value;
        if (!validate(candidate, rule)) { warnings.push(prefix + '.' + key + ': valor inválido'); continue; }
        target[key] = key === 'divisions' ? Number(value) : rule === 'color' ? value.toLowerCase() : value;
      }
    }
    const templates = {};
    if (!object(rawTemplates)) warnings.push('templates: se esperaba un mapa');
    else for (const [id, input] of Object.entries(rawTemplates)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || !object(input)) { warnings.push('templates.' + id + ': entrada inválida'); continue; }
      const sound = { ...soundDefaults };
      const { label, ...parameters } = input;
      fields(parameters, sound, soundRules, 'templates.' + id);
      templates[id] = { label: typeof label === 'string' ? label : id, ...sound };
    }
    if (!object(raw)) { warnings.push('config: se esperaba un mapa'); raw = {}; }
    for (const key of Object.keys(raw)) if (!['music', 'drawing', 'background', 'sweeps', 'palette'].includes(key)) warnings.push('config.' + key + ': sección desconocida');
    for (const key of Object.keys(rules)) if (raw[key] !== undefined) fields(raw[key], settings[key], rules[key], key);
    if (raw.sweeps !== undefined) {
      if (!object(raw.sweeps)) warnings.push('sweeps: se esperaba un mapa');
      else for (const [id, value] of Object.entries(raw.sweeps)) {
        if (!Object.hasOwn(settings.sweeps, id)) { warnings.push('sweeps.' + id + ': dirección desconocida'); continue; }
        fields(value, settings.sweeps[id], { active: 'boolean', volume: [0, 1] }, 'sweeps.' + id);
      }
    }
    if (raw.palette !== undefined) {
      if (!Array.isArray(raw.palette) || !raw.palette.length || raw.palette.length > 24) warnings.push('palette: se requieren entre 1 y 24 colores');
      else {
        const palette = [], seen = new Set();
        raw.palette.forEach((entry, index) => {
          const prefix = 'palette[' + index + ']';
          if (!object(entry) || !hex(entry.color) || seen.has(entry.color.toLowerCase())) { warnings.push(prefix + ': color inválido o repetido'); return; }
          const color = entry.color.toLowerCase(); seen.add(color);
          const item = { color, label: color, muted: false, sound: {} };
          for (const key of Object.keys(entry)) if (!['color', 'label', 'preset', 'muted', 'sound'].includes(key)) warnings.push(prefix + '.' + key + ': campo desconocido');
          if (entry.label !== undefined) {
            if (typeof entry.label === 'string') item.label = entry.label;
            else warnings.push(prefix + '.label: se esperaba texto');
          }
          if (entry.muted !== undefined) fields({ muted: entry.muted }, item, { muted: 'boolean' }, prefix);
          if (entry.preset !== undefined) {
            if (typeof entry.preset === 'string' && Object.hasOwn(templates, entry.preset)) item.preset = entry.preset;
            else warnings.push(prefix + '.preset: preset no encontrado');
          }
          if (entry.sound !== undefined) fields(entry.sound, item.sound, soundRules, prefix + '.sound');
          palette.push(item);
        });
        if (palette.length) settings.palette = palette;
      }
    }
    for (const item of settings.palette) {
      const preset = templates[item.preset];
      if (preset) { const { label, ...sound } = preset; item.sound = { ...sound, ...item.sound }; }
    }
    if (!settings.palette.some(p => p.color === settings.drawing.selectedColor)) {
      if (raw.drawing?.selectedColor !== undefined) warnings.push('drawing.selectedColor: no pertenece a la paleta');
      settings.drawing.selectedColor = settings.palette[0].color;
    }
    return { settings, templates, warnings };
  }
  async function load() {
    const warnings = [];
    async function read(file) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(file, { signal: controller.signal, cache: 'no-cache' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (typeof jsyaml === 'undefined') throw new Error('lector YAML no disponible');
        return jsyaml.load(await response.text());
      } catch (error) { warnings.push(file + ': ' + error.message); return {}; }
      finally { clearTimeout(timeout); }
    }
    const [config, catalog] = await Promise.all([read('config.yaml'), read('templates.yaml')]);
    const result = normalize(config, catalog?.templates || {});
    result.warnings.unshift(...warnings);
    return result;
  }
  return { load, normalize };
})();
