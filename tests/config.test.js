const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const box = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8') + ';globalThis.api=AppConfig;', box);
const normalize = (...args) => JSON.parse(JSON.stringify(box.api.normalize(...args)));

test('invalid preferences fall back without throwing or replacing valid settings', () => {
  const { settings, warnings } = normalize({ music: { bpm: 'fast', masterVolume: 9, root: 'H', scale: 'minor' }, drawing: { quantize: 'false', divisions: 7 }, background: { first: 'red' }, sweeps: { lr: { volume: -1 }, unknown: {} } });
  assert.equal(settings.music.bpm, 90); assert.equal(settings.music.masterVolume, 0.65);
  assert.equal(settings.music.root, 'C'); assert.equal(settings.music.scale, 'minor');
  assert.equal(settings.drawing.quantize, false); assert.equal(settings.drawing.divisions, 4);
  assert.equal(settings.background.first, '#f0ebe0'); assert.equal(settings.sweeps.lr.volume, 0.6);
  assert.equal(warnings.length, 8);
});

test('preset then per-color overrides, labels, mute, and selection are resolved', () => {
  const { settings, templates, warnings } = normalize({ palette: [{ color: '#ABCDEF', label: 'Pad', preset: 'pad', muted: true, sound: { gain: 0.2 } }], drawing: { selectedColor: '#ABCDEF' } }, { pad: { waveform: 'triangle', release: 2800, gain: 0.6 } });
  assert.equal(settings.palette[0].sound.waveform, 'triangle');
  assert.equal(settings.palette[0].sound.release, 2800); assert.equal(settings.palette[0].sound.gain, 0.2);
  assert.equal(templates.pad.gain, 0.6); assert.equal(settings.palette[0].muted, true);
  assert.equal(settings.drawing.selectedColor, '#abcdef'); assert.equal(warnings.length, 0);
});

test('unknown presets, duplicate colors and malformed sections cannot break boot', () => {
  for (const raw of [null, [], 'bad', { music: null, palette: [] }, { palette: [{ color: null }] }]) assert.equal(normalize(raw).settings.palette.length, 9);
  const { settings, warnings } = normalize({ palette: [{ color: '#112233', preset: 'missing' }, { color: '#112233' }] });
  assert.equal(settings.palette.length, 1); assert.equal(settings.drawing.selectedColor, '#112233');
  assert.equal(warnings.length, 2);
});

test('unknown keys and unsafe template fields are rejected', () => {
  const input = JSON.parse('{"music":{"__proto__":{},"bpm":100},"surprise":{}}');
  const catalog = JSON.parse('{"__proto__":{"gain":1},"safe":{"waveform":"not-an-oscillator","filterQ":-10,"gain":0.4}}');
  const { settings, templates, warnings } = normalize(input, catalog);
  assert.equal(settings.music.bpm, 100); assert.equal(templates.safe.waveform, 'sine');
  assert.equal(templates.safe.filterQ, 1); assert.equal(templates.safe.gain, 0.4);
  assert.equal(Object.hasOwn(templates, '__proto__'), false); assert.ok(warnings.length >= 4);
});
