const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '..', name + '.js'), 'utf8');
const drawingContext = () => new Proxy({}, { get: (target, key) => target[key] || (() => {}) });
function canvasFixture() {
  const handlers = {};
  const context = drawingContext();
  const element = { offsetWidth: 400, offsetHeight: 300, getContext: () => context,
    addEventListener: (name, cb) => handlers[name] = cb, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const box = { window: { devicePixelRatio: 1 }, Audio: { getOctaveBoundaryYs: () => [] }, ResizeObserver: class { observe() {} } };
  vm.runInNewContext(source('canvas') + ';globalThis.api = Canvas;', box);
  const api = box.api; api.init(element);
  function line(points, tool = 'pencil', color = api.COLORS[0]) {
    api.setTool(tool); api.setColor(color);
    const event = ([x, y]) => ({ clientX: x, clientY: y, preventDefault() {}, pointerId: 1, buttons: 1 });
    handlers.pointerdown(event(points[0]));
    for (const point of points.slice(1)) handlers.pointermove(event(point));
    handlers.pointerup();
  }
  const snapshot = () => JSON.stringify([...api.getHGrid()]);
  return { api, line, snapshot, element };
}

test('freehand audio fills segments and grid toggle restores every original note', () => {
  const { api, line, snapshot } = canvasFixture();
  line([[101, 103], [203, 157]]);
  const before = snapshot();
  assert.ok(api.getHGrid().get(150));
  api.setQuantize(true, 25);
  for (let x = 100; x <= 200; x++) assert.ok(api.getHGrid().get(x), `missing snapped column ${x}`);
  api.setQuantize(true, 40); api.setQuantize(false);
  assert.equal(snapshot(), before);
  api.setQuantize(true, 25); api.setQuantize(false);
  assert.equal(snapshot(), before);
});

test('same-color chords, circle branches and all nine colors survive the map', () => {
  const { api, line } = canvasFixture();
  line([[50, 100], [250, 100]], 'line-solid');
  line([[50, 200], [250, 200]], 'line-solid');
  assert.equal(api.getHGrid().get(150).length, 2);
  api.clear(); line([[150, 150], [200, 150]], 'circle');
  const ys = api.getHGrid().get(150).map(p => p.y);
  assert.ok(ys.includes(100) && ys.includes(200));
  api.clear();
  for (const [i, color] of api.COLORS.entries()) line([[20, 20 + i * 25], [300, 20 + i * 25]], 'line-solid', color);
  assert.equal(api.getHGrid().get(150).length, 9);
});

test('undo, clear and resize rebuild only the acoustic lookup', () => {
  const { api, line, element } = canvasFixture();
  line([[20, 100], [350, 100]]);
  element.offsetWidth = 200; api.resize();
  assert.equal(api.getHGrid().has(300), false);
  element.offsetWidth = 400; api.resize();
  assert.ok(api.getHGrid().has(300));
  api.undo(); assert.equal(api.getHGrid().size, 0);
  line([[20, 100], [350, 100]]); api.clear();
  assert.equal(api.getVGrid().size, 0);
});

function audioFixture(hold = true) {
  const oscillators = [], gains = []; let context;
  class Param {
    constructor() { this.value = 0; this.events = []; if (!hold) this.cancelAndHoldAtTime = undefined; }
    setValueAtTime(value, time) { this.events.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.events.push(['ramp', value, time]); }
    cancelScheduledValues(time) { this.events.push(['cancel', time]); }
    cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
    setTargetAtTime(value, time, duration) { this.events.push(['target', value, time, duration]); }
  }
  const node = () => ({ disconnected: false, connect(n) { this.output = n; }, disconnect() { this.disconnected = true; } });
  class Context {
    constructor() { context = this; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createGain() { const n = { ...node(), gain: new Param() }; gains.push(n); return n; }
    createDynamicsCompressor() { return { ...node(), threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }; }
    createBiquadFilter() { return { ...node(), frequency: {}, Q: {} }; }
    createOscillator() {
      const n = { ...node(), frequency: {}, detune: {}, start(t) { this.startTime = t; }, stop(t) { this.stopTime = t; } };
      oscillators.push(n); return n;
    }
  }
  const box = { window: { AudioContext: Context } };
  vm.runInNewContext(source('audio') + ';globalThis.api = Audio;', box);
  box.api.init();
  return { api: box.api, context, oscillators, gains };
}

test('continuous gate sustains beyond release and sweeps remain independent', () => {
  const { api, context, oscillators } = audioFixture();
  const notes = [{ freq: 440, color: 'green' }], configs = { green: { release: 600 } };
  api.syncSweep('lr', notes, configs, 0.6, 0);
  context.currentTime = 2;
  api.syncSweep('lr', notes, configs, 0.6, 2);
  assert.equal(oscillators.length, 1);
  assert.equal(oscillators[0].stopTime, undefined);
  api.syncSweep('rl', notes, configs, 0.6, 2);
  assert.equal(oscillators.length, 2);
  api.syncSweep('lr', [], configs, 0.6, 2);
  assert.ok(oscillators[0].stopTime > 2.6);
  assert.equal(oscillators[1].stopTime, undefined);
});

test('replacing notes keeps independent envelopes and permits more than four pitches', () => {
  const { api, context, oscillators } = audioFixture();
  const notes = [220, 330, 440, 550, 660].map(freq => ({ freq, color: 'green' }));
  api.syncSweep('lr', notes, {}, 0.6, 0);
  assert.equal(oscillators.length, 5);
  const originalEnvelopes = oscillators.map(o => o.output);
  context.currentTime = 0.1;
  api.syncSweep('lr', [{ freq: 880, color: 'green' }], {}, 0.6, 0.1);
  assert.ok(originalEnvelopes.every(env => env !== oscillators[5].output));
  assert.ok(oscillators.slice(0, 5).every(o => o.stopTime > 0.1));
  for (const o of oscillators.slice(0, 5)) o.onended();
  assert.ok(originalEnvelopes.every(env => env.disconnected));
  assert.equal(oscillators[5].output.disconnected, false);
});

test('preview responds at same pitch; stopping cancels future notes; fallback preserves attack', () => {
  const { api, context, oscillators } = audioFixture(false);
  api.triggerNote(440, {}, 0.6, 'green');
  context.currentTime = 0.005;
  api.triggerNote(440, { waveform: 'triangle' }, 0.6, 'green');
  assert.equal(oscillators.length, 2);
  const sets = oscillators[0].output.gain.events.filter(e => e[0] === 'set' && e[2] === 0.005);
  assert.ok(Math.abs(sets.at(-1)[1] - 0.171 / 3) < 1e-8);
  api.syncSweep('lr', [{ freq: 220, color: 'green' }], {}, 0.6, 0.055);
  api.stopAll();
  assert.ok(oscillators.every(o => o.stopTime <= 0.022 + 1e-9));
});

function scannerFixture(width = 400, direction = 'lr') {
  let clock = 0, timer, frame; const events = [];
  const hGrid = new Map(), vGrid = new Map();
  for (let x = 0; x <= width; x += 25) hGrid.set(x, [{ y: 100, color: 'green' }]);
  for (let y = 0; y <= 300; y += 25) vGrid.set(y, [{ x: 100, color: 'green' }]);
  const box = {
    requestAnimationFrame: f => (frame = f, 1), setInterval: f => (timer = f, 1), clearInterval: () => timer = null,
    Canvas: { getSize: () => ({ w: width, h: 300 }), getCtx: drawingContext,
      getHGrid: () => hGrid, getVGrid: () => vGrid, getColorConfig: () => ({}), redraw() {} },
    Audio: { currentTime: () => clock, resume() {}, stopAll() {}, releaseSweep() {}, noteForY: y => y + 1,
      syncSweep: (id, notes, cfg, vol, time) => events.push({ id, notes, time }) }
  };
  vm.runInNewContext(source('scanner') + ';globalThis.api = Scanner;', box);
  box.api.init(); box.api.toggleSweep(direction); box.api.play();
  return { api: box.api, events, hGrid, run(seconds, fps = 60) {
    let nextFrame = 0;
    for (let i = 1; i <= seconds * 100; i++) {
      clock = i / 100; if (timer) timer();
      if (clock >= nextFrame) { frame(); nextFrame += 1 / fps; }
    }
  } };
}

test('all four sweeps visit sparse grid cells identically at 30, 60 and 120fps', () => {
  for (const direction of ['lr', 'rl', 'tb', 'bt']) {
    const results = [30, 60, 120].map(fps => {
      const f = scannerFixture(400, direction); f.run(2.5, fps);
      return JSON.stringify(f.events.filter(e => e.notes.length).map(e => [e.time, e.notes]));
    });
    assert.equal(results[0], results[1]); assert.equal(results[1], results[2]);
    assert.ok(JSON.parse(results[0]).length >= (direction === 'lr' || direction === 'rl' ? 15 : 11));
  }
});

test('scanner passes all colors and same-color pitches instead of slicing four hits', () => {
  const f = scannerFixture();
  f.hGrid.set(25, Array.from({ length: 9 }, (_, i) => ({ y: 20 + i * 20, color: 'c' + i })));
  f.run(0.3);
  assert.ok(f.events.some(e => e.notes.length === 9));
  f.api.stop(); const count = f.events.length; f.run(0.5);
  assert.equal(f.events.length, count);
});

test('grid cells keep snapped pitches, including vertical sweeps', () => {
  const { api, line } = canvasFixture();
  line([[50, 50], [250, 250]], 'line-solid');
  api.setQuantize(true, 25);
  for (const hits of api.getHGrid().values()) for (const hit of hits) assert.equal(hit.y % 25, 0);
  for (const hits of api.getVGrid().values()) for (const hit of hits) assert.equal(hit.y % 25, 0);
  // Neighbor cells are half-open: no accidental two-note chord at their edge.
  assert.equal(api.getHGrid().get(62).length, 1);
  assert.equal(api.getHGrid().get(63).length, 1);
});

test('a narrow crossing completes its attack rather than becoming inaudible', () => {
  const { api, oscillators } = audioFixture();
  api.syncSweep('lr', [{ freq: 440, color: 'green' }], {}, 0.6, 0.05);
  api.syncSweep('lr', [], {}, 0.6, 0.052);
  const events = oscillators[0].output.gain.events;
  assert.ok(events.some(e => e[0] === 'hold' && Math.abs(e[1] - 0.065) < 1e-9));
});

test('paint changes an existing sound and undo restores its notes even after quantizing', () => {
  const {api,line,snapshot}=canvasFixture();
  line([[30,80],[230,80]],'line-solid'); const before=snapshot();
  line([[120,80]],'paint',api.COLORS[1]);
  assert.equal(api.getHGrid().get(120)[0].color,api.COLORS[1]);
  api.setQuantize(true,25); api.undo(); api.setQuantize(false);
  assert.equal(snapshot(),before);
  line([[120,80]],'eraser'); assert.equal(api.getHGrid().size,0);
  api.undo(); assert.equal(snapshot(),before);
  api.clear(); api.undo(); assert.equal(snapshot(),before);
});

test('new figures are audible, reversible through grid, and annotations stay silent', () => {
  const {api,line,snapshot}=canvasFixture();
  for(const tool of ['square','triangle','star']) {
    api.clear(); line([[130,130],[180,180]],tool);
    assert.ok(api.getHGrid().size>20,tool); const before=snapshot();
    api.setQuantize(true,25); api.setQuantize(false); assert.equal(snapshot(),before);
  }
  const before=snapshot(); api.setAnnotation('Hola'); line([[20,20]],'text');
  assert.equal(snapshot(),before); api.setQuantize(true); api.setQuantize(false);
  assert.equal(snapshot(),before); api.undo(); assert.equal(snapshot(),before);
});

test('a single pencil tap creates an audible point, survives grid, and supports undo', () => {
  const {api,line,snapshot}=canvasFixture();
  line([[101,103]]);
  assert.equal(api.getHGrid().get(101)[0].y,103);
  assert.equal(api.getVGrid().get(103)[0].x,101);
  const before=snapshot(); api.setQuantize(true,25); api.setQuantize(false);
  assert.equal(snapshot(),before); api.undo(); assert.equal(api.getHGrid().size,0);
});
