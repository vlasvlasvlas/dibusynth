const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = path.join(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('phone touch gestures on the actual served app', { skip: !fs.existsSync(chrome), timeout: 60000 }, async t => {
  const allowed = new Set(['index.html', 'style.css', 'canvas.js', 'audio.js', 'scanner.js', 'ui.js', 'templates.yaml', 'config.yaml', 'config.js']);
  let configOverride = null;
  const server = http.createServer((req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!allowed.has(name)) { res.writeHead(404).end(); return; }
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'text/plain';
    res.setHeader('Content-Type', type + '; charset=utf-8');
    res.end(name === 'config.yaml' && configOverride !== null ? configOverride : fs.readFileSync(path.join(root, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dibusynth-touch-test-'));
  const browser = spawn(chrome, ['--headless', '--disable-gpu', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  const results = [];
  try {
    const base = await new Promise((resolve, reject) => {
      browser.on('error', reject);
      browser.stderr.on('data', data => { const m = data.toString().match(/ws:\/\/127\.0\.0\.1:(\d+)/); if (m) resolve('http://127.0.0.1:' + m[1]); });
    });
    const tabs = await (await fetch(base + '/json/list')).json();
    ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => ws.onopen = resolve);
    let id = 0; const pending = new Map(), errors = [];
    ws.onmessage = event => {
      const m = JSON.parse(event.data);
      if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    };
    const call = (method, params = {}) => new Promise(resolve => { const next = ++id; pending.set(next, resolve); ws.send(JSON.stringify({ id: next, method, params })); });
    async function evaluate(expression) {
      const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(r.error, undefined, JSON.stringify(r.error));
      assert.equal(r.result.exceptionDetails, undefined, JSON.stringify(r.result.exceptionDetails));
      return r.result.result.value;
    }
    async function touch(type, x, y) {
      const r = await call('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 5, radiusY: 5, force: 1, id: 1 }] });
      assert.equal(r.error, undefined, JSON.stringify(r.error));
    }
    async function target(selector) {
      const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await pause(80); return point;
    }
    async function tap(selector, hold = 40) {
      const { x, y } = await target(selector); await touch('touchStart', x, y); await pause(hold); await touch('touchEnd'); await pause(100);
    }
    async function drag(x, y, endX, endY, steps = 12) {
      await touch('touchStart', x, y);
      for (let i = 1; i <= steps; i++) { await pause(20); await touch('touchMove', x + (endX - x) * i / steps, y + (endY - y) * i / steps); }
      await touch('touchEnd'); await pause(120);
    }
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    for (const device of [{ name: '390×844', width: 390, height: 844, dpr: 3 }, { name: '360×800', width: 360, height: 800, dpr: 3 }, { name: '320×568', width: 320, height: 568, dpr: 2 }]) {
      await t.test(device.name, async () => {
        const { width, height, dpr } = device;
        const metrics = (w, h) => ({ width: w, height: h, deviceScaleFactor: dpr, mobile: true, screenWidth: w, screenHeight: h });
        await call('Emulation.setDeviceMetricsOverride', metrics(width, height));
        await call('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
        await pause(300);
        const ready = await evaluate(`(async()=>{for(let i=0;i<100;i++){if(document.querySelectorAll('.color-swatch').length===9&&document.querySelectorAll('#select-scale option').length===6)return true;await new Promise(r=>setTimeout(r,100));}return false;})()`);
        assert.equal(ready, true, 'app failed to boot');
        const report = { device: device.name };
        report.touch = await evaluate('navigator.maxTouchPoints');
        assert.ok(report.touch > 0);
        report.presetsLoaded = await evaluate("document.querySelectorAll('#tp-template optgroup option').length");
        await drag(35, 110, width - 35, 150);
        report.drawingPoints = await evaluate('Canvas.getHGrid().size');
        assert.ok(report.drawingPoints > 100, 'finger drawing did not enter acoustic map');
        assert.equal(await evaluate('window.scrollY'), 0, 'canvas gesture scrolled page');
        const original = await evaluate('JSON.stringify([...Canvas.getHGrid()])');
        const initialHeight = await evaluate('Canvas.getSize().h');
        await tap('.sweep-item button'); await tap('#btn-play');
        assert.equal(await evaluate('Scanner.isPlaying()'), true);
        const clock = await evaluate('Audio.currentTime()'); await pause(150);
        assert.ok(await evaluate('Audio.currentTime()') > clock, 'audio clock did not resume after touch');
        await tap('#btn-play');
        assert.equal(await evaluate('Scanner.isPlaying()'), false);
        assert.equal(await evaluate('Canvas.getSize().h'), initialHeight);
        await drag(width - 15, height - 30, width - 15, height - 180);
        report.panelScroll = await evaluate("document.getElementById('panel').scrollTop");
        assert.ok(report.panelScroll > 20, 'finger swipe did not scroll controls');
        assert.equal(await evaluate('JSON.stringify([...Canvas.getHGrid()])'), original, 'scroll accidentally drew on canvas');
        await tap('#btn-line-solid');
        await tap('#btn-dash-settings');
        await evaluate("document.getElementById('line-kind').value='line-dashed';document.getElementById('line-kind').dispatchEvent(new Event('change'))");
        assert.equal(await evaluate("document.getElementById('dash-popover').classList.contains('hidden')"), false);
        const slider = await evaluate("(()=>{const e=document.getElementById('slider-dash-gap'),r=e.getBoundingClientRect();return {x:r.x+8,y:r.y+r.height/2,end:r.right-8,before:e.value};})()");
        await drag(slider.x, slider.y, slider.end, slider.y);
        report.dashGap = await evaluate('Canvas.getDashGap()');
        assert.ok(report.dashGap > Number(slider.before), 'finger slider drag failed');
        report.popoverFits = await evaluate("(()=>{const p=document.getElementById('dash-popover'),r=p.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&p.scrollWidth<=p.clientWidth;})()");
        assert.equal(report.popoverFits, true);
        await tap('#dash-close');
        await tap('#btn-line-solid', 600);
        report.longPress = await evaluate("!document.getElementById('dash-popover').classList.contains('hidden')");
        assert.equal(report.longPress, true, 'long press failed');
        await tap('#dash-close');
        await tap('.swatch-wrap:nth-child(2) .color-swatch');
        assert.equal(await evaluate("document.querySelector('.swatch-wrap:nth-child(2) .color-swatch').getAttribute('aria-pressed')"), 'true');
        await tap('#btn-edit-color');
        assert.equal(await evaluate("document.getElementById('timbre-popover').classList.contains('hidden')"), false);
        await tap('#timbre-close');
        await tap('.swatch-mute');
        assert.equal(await evaluate("document.querySelector('.swatch-mute').getAttribute('aria-pressed')"), 'true');
        await tap('#chk-quantize'); await tap('#chk-quantize');
        assert.equal(await evaluate('JSON.stringify([...Canvas.getHGrid()])'), original);
        await tap('#btn-dash-settings');
        await call('Emulation.setDeviceMetricsOverride', metrics(height, width)); await pause(200);
        report.landscapeFits = await evaluate("(()=>{const r=document.getElementById('dash-popover').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()");
        assert.equal(report.landscapeFits, true);
        await tap('#dash-close');
        await call('Emulation.setDeviceMetricsOverride', metrics(width, height)); await pause(200);
        assert.equal(await evaluate('JSON.stringify([...Canvas.getHGrid()])'), original, 'drawing lost after rotation round trip');
        report.smallTargets = await evaluate("[...document.querySelectorAll('#panel button,#panel .color-swatch')].map(e=>({label:e.getAttribute('aria-label')||e.textContent,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).filter(r=>r.w<44||r.h<44).length");
        if (process.env.DIBUSYNTH_SCREENSHOTS) {
          await evaluate("document.getElementById('panel').scrollTop=0"); await pause(80);
          const shot = await call('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(process.env.DIBUSYNTH_SCREENSHOTS, 'touch-' + width + '.png'), Buffer.from(shot.result.data, 'base64'));
        }
        results.push(report);
      });
    }
    await t.test('YAML defaults reach the controls and engines; invalid YAML falls back', async () => {
      configOverride = `music:
  bpm: 125
  bpmStep: 7
  masterVolume: 0.3
  root: D
  scale: minor
  octaves: 2
  baseOctave: 2
  beatsPerSweep: 8
sweeps:
  lr: {active: true, volume: 0.25}
drawing:
  tool: circle
  selectedColor: "#123456"
  dashGap: 19
  quantize: true
  cellSize: 40
  guides: true
  divisions: 8
  octaveGuides: false
background:
  randomize: false
  first: "#112233"
  second: "#ddeeff"
  direction: to right
palette:
  - color: "#123456"
    label: Mi pad
    preset: brian_eno
    muted: true
    sound: {gain: 0.42}
  - color: "#abcdef"
    label: Otro
    sound: {waveform: triangle}
`;
      async function reload() {
        await call('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
        await pause(300);
        return evaluate(`(async()=>{for(let i=0;i<100;i++){if(window.dibusynthReady){await window.dibusynthReady;return true;}await new Promise(r=>setTimeout(r,100));}return false;})()`);
      }
      assert.equal(await reload(), true);
      const config = await evaluate(`(()=>({
        bpm: document.getElementById('bpm-value').textContent,
        volume: document.getElementById('slider-master-vol').value,
        root: document.getElementById('select-key').value,
        scale: document.getElementById('select-scale').value,
        quantize: document.getElementById('chk-quantize').checked,
        cellSize: document.getElementById('slider-cell-size').value,
        guides: document.getElementById('chk-measures').checked,
        divisions: document.getElementById('sel-beats').value,
        tool: document.querySelector('.tool-btn.active').id,
        colors: Canvas.COLORS,
        sound: Canvas.getColorConfig()['#123456'],
        muted: document.querySelector('.swatch-mute').getAttribute('aria-pressed'),
        sweep: document.querySelector('.sweep-item button').getAttribute('aria-pressed'),
        sweepVolume: document.querySelector('.sweep-vol').value,
        background: document.getElementById('color-bg1').value,
        direction: document.getElementById('btn-grad-dir').textContent,
        gap: Canvas.getDashGap(), playing: Scanner.isPlaying(),
        lowest: Audio.noteForY(100,100),
        statusHidden: document.getElementById('config-status').hidden
      }))()`);
      assert.equal(config.bpm, '125'); assert.equal(config.volume, '0.3');
      assert.equal(config.root, 'D'); assert.equal(config.scale, 'minor');
      assert.equal(config.quantize, true); assert.equal(config.cellSize, '40');
      assert.equal(config.guides, true); assert.equal(config.divisions, '8');
      assert.equal(config.tool, 'btn-circle'); assert.deepEqual(config.colors, ['#123456', '#abcdef']);
      assert.equal(config.sound.release, 2800); assert.equal(config.sound.gain, 0.42);
      assert.equal(config.muted, 'true'); assert.equal(config.sweep, 'true'); assert.equal(config.sweepVolume, '0.25');
      assert.equal(config.background, '#112233'); assert.equal(config.direction, '↔'); assert.equal(config.gap, 19);
      assert.equal(config.playing, false); assert.equal(config.statusHidden, true);
      assert.ok(Math.abs(config.lowest - 73.41619) < 0.001);
      await tap('#btn-bpm-up');
      assert.equal(await evaluate("document.getElementById('bpm-value').textContent"), '132');
      configOverride = 'music: [invalid yaml';
      assert.equal(await reload(), true);
      assert.equal(await evaluate("document.getElementById('config-status').hidden"), false);
      assert.equal(await evaluate("document.getElementById('bpm-value').textContent"), '90');
      assert.equal(await evaluate('Canvas.COLORS.length'), 9);
    });
    assert.deepEqual(errors, [], 'uncaught page exceptions');
    t.diagnostic(JSON.stringify(results));
  } finally {
    ws?.close(); browser.kill();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
