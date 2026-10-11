const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = path.join(__dirname, '..');

test('responsive controls, stable canvas and keyboard-accessible popovers', {
  skip: !fs.existsSync(chrome), timeout: 30000
}, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dibusynth-ui-test-'));
  const browser = spawn(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  try {
    const base = await new Promise((resolve, reject) => {
      browser.on('error', reject);
      browser.stderr.on('data', data => {
        const match = data.toString().match(/ws:\/\/127\.0\.0\.1:(\d+)/);
        if (match) resolve('http://127.0.0.1:' + match[1]);
      });
    });
    const tabs = await (await fetch(base + '/json/list')).json();
    ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => ws.onopen = resolve);
    let id = 0;
    const pending = new Map();
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    };
    const call = (method, params) => new Promise(resolve => {
      const next = ++id; pending.set(next, resolve);
      ws.send(JSON.stringify({ id: next, method, params }));
    });
    async function evaluate(expression) {
      const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(response.result.exceptionDetails, undefined, JSON.stringify(response.result.exceptionDetails));
      return response.result.result.value;
    }
    // Use actual app markup/styles/scripts; external preset loading is outside
    // this layout test. No edits or style overrides are applied to the page.
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      .replace(/<script[^>]*src=[^>]*><\/script>/g, '')
      .replace('<link rel="stylesheet" href="style.css">', '<style>' + fs.readFileSync(path.join(root, 'style.css'), 'utf8') + '</style>');
    const tree = await call('Page.getFrameTree', {});
    await call('Page.setDocumentContent', { frameId: tree.result.frameTree.frame.id, html });
    await evaluate(['config', 'canvas', 'audio', 'scanner', 'ui'].map(n => fs.readFileSync(path.join(root, n + '.js'), 'utf8')).join('\n') + '\nAppConfig.load = async () => AppConfig.normalize(); document.dispatchEvent(new Event("DOMContentLoaded")); window.dibusynthReady;' );
    for (const [width, height] of [[1280, 800], [800, 800], [700, 800], [390, 800], [320, 640], [390, 360]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const result = await evaluate(`(async () => {
        const wait = () => new Promise(r => setTimeout(r, 80)); await wait();
        const panel = document.getElementById('panel'); panel.scrollTop = 0;
        const canvas = document.getElementById('canvas');
        const before = canvas.getBoundingClientRect().height;
        const frequency = Audio.noteForY(before * .7, before);
        const sweeps = [...document.querySelectorAll('.sweep-item button')];
        for (const button of sweeps) button.click(); await wait();
        const after = canvas.getBoundingClientRect().height;
        const frequencyAfter = Audio.noteForY(before * .7, after);
        for (const button of sweeps) button.click();
        const overflows = [...document.querySelectorAll('.panel-row, .panel-band, .control-group')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.className);
        const trigger = document.getElementById('btn-dash-settings');
        trigger.focus(); trigger.click(); await wait();
        const pop = document.getElementById('dash-popover'), box = pop.getBoundingClientRect();
        const contentFits = [...pop.querySelectorAll('input, span, svg, button')].filter(e => e.getClientRects().length).every(e => { const r = e.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right; });
        const fitsViewport = box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        const escape = pop.classList.contains('hidden') && document.activeElement === trigger;
        document.getElementById('btn-edit-color').click(); await wait();
        const timbre = document.getElementById('timbre-popover'), tb = timbre.getBoundingClientRect();
        const timbreFits = tb.left >= 0 && tb.right <= innerWidth && tb.top >= 0 && tb.bottom <= innerHeight && timbre.scrollWidth <= timbre.clientWidth + 1;
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        panel.scrollTop = 0;
        return {before, after, frequency, frequencyAfter, overflows, contentFits, fitsViewport, escape, timbreFits};
      })()`);
      assert.equal(result.before, result.after, 'canvas height changed at ' + width);
      assert.equal(result.frequency, result.frequencyAfter, 'pitch changed at ' + width);
      assert.deepEqual(result.overflows, [], 'horizontal overflow at ' + width);
      for (const key of ['contentFits', 'fitsViewport', 'escape', 'timbreFits']) assert.equal(result[key], true, key + ' at ' + width);
      const toolsFit = await evaluate(`(async()=>{
        for (const [button,select,values] of [['btn-line-solid','line-kind',['line-solid','line-dashed']],['btn-circle','create-kind',['circle','square','triangle','star','text']]]) {
          document.getElementById(button).click(); document.getElementById('btn-dash-settings').click();
          for (const value of values) {
            const control=document.getElementById(select); control.value=value; control.dispatchEvent(new Event('change'));
            await new Promise(r=>setTimeout(r,20));
            const p=document.getElementById('dash-popover'),r=p.getBoundingClientRect();
            if(r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight||p.scrollWidth>p.clientWidth+1) return false;
          }
          document.getElementById('dash-close').click();
        }
        const before=Canvas.getSize().h;
        document.getElementById('btn-about').click();
        const dialog=document.getElementById('about-popover'),r=dialog.getBoundingClientRect();
        const fits=dialog.open&&dialog.matches(':modal')&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&Canvas.getSize().h===before;
        document.getElementById('about-close').click(); await new Promise(r=>setTimeout(r,20));
        document.getElementById('btn-pencil').click();
        return fits&&!dialog.open;
      })()`);
      assert.equal(toolsFit,true,'tool options and modal at '+width);
      if (process.env.DIBUSYNTH_SCREENSHOTS && [1280, 390].includes(width) && height === 800) {
        const shot = await call('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.DIBUSYNTH_SCREENSHOTS, 'ui-' + width + '.png'), Buffer.from(shot.result.data, 'base64'));
      }
    }
    // Reposition an open popup when the viewport changes and the panel scrolls.
    await evaluate("document.getElementById('btn-dash-settings').click()");
    await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 480, deviceScaleFactor: 1, mobile: false });
    const fits = await evaluate(`(async()=>{document.getElementById('panel').scrollTop=100;await new Promise(r=>setTimeout(r,100));const p=document.getElementById('dash-popover').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.top>=0&&p.bottom<=innerHeight;})()`);
    assert.equal(fits, true);
  } finally {
    ws?.close();
    browser.kill();
  }
});
