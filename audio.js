const Audio = (() => {
  const SCALES = {
    major:       { label: 'Major',     intervals: [0,2,4,5,7,9,11] },
    minor:       { label: 'Minor',     intervals: [0,2,3,5,7,8,10] },
    pentatonicM: { label: 'Penta Maj', intervals: [0,2,4,7,9] },
    pentatonicm: { label: 'Penta Min', intervals: [0,3,5,7,10] },
    blues:       { label: 'Blues',     intervals: [0,3,5,6,7,10] },
    chromatic:   { label: 'Chromatic', intervals: [0,1,2,3,4,5,6,7,8,9,10,11] }
  };
  const ROOTS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const ROOT_MIDI = {
    C:60,'C#':61,D:62,'D#':63,E:64,F:65,'F#':66,G:67,'G#':68,A:69,'A#':70,B:71
  };

  const VOICES_PER_COLOR = 4; // dedicated pool per color — no cross-color stealing
  const OCTAVES = 4;
  const STEAL_RAMP = 0.010;

  let actx, masterGain;
  // Map: color hex → voice pool array
  const colorPools = {};
  let currentScale  = [];
  let currentRoot   = 'C';
  let currentScaleId = 'major';

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function buildScale(root, scaleId) {
    const intervals = SCALES[scaleId].intervals;
    const rootMidi  = ROOT_MIDI[root] - 12;
    const notes = [];
    for (let o = 0; o < OCTAVES; o++) {
      intervals.forEach(i => notes.push(midiToHz(rootMidi + o * 12 + i)));
    }
    return notes.sort((a, b) => b - a);
  }

  function makeVoice() {
    const envGain = actx.createGain();
    envGain.gain.value = 0;
    envGain.connect(masterGain);
    return { osc: null, filter: null, envGain, active: false, startTime: -1 };
  }

  function init() {
    actx = new (window.AudioContext || window.webkitAudioContext)();

    // Gentle compressor — prevents clipping, minimal pumping
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value      = 16;
    comp.ratio.value     = 4;
    comp.attack.value    = 0.010;
    comp.release.value   = 0.4;

    masterGain = actx.createGain();
    masterGain.gain.value = 0.65;
    masterGain.connect(comp);
    comp.connect(actx.destination);

    currentScale = buildScale(currentRoot, currentScaleId);
  }

  function ensurePool(color) {
    if (!colorPools[color]) {
      colorPools[color] = Array.from({ length: VOICES_PER_COLOR }, makeVoice);
    }
    return colorPools[color];
  }

  function resume() {
    if (actx && actx.state === 'suspended') actx.resume();
  }

  function releaseVoice(v) {
    if (!v.osc) return;
    const now = actx.currentTime;
    v.envGain.gain.cancelScheduledValues(now);
    v.envGain.gain.setValueAtTime(v.envGain.gain.value, now);
    v.envGain.gain.linearRampToValueAtTime(0, now + STEAL_RAMP);
    const oscRef  = v.osc;
    const filtRef = v.filter;
    v.osc    = null;
    v.filter = null;
    v.active = false;
    try { oscRef.stop(now + STEAL_RAMP + 0.002); } catch (_) {}
    if (filtRef) {
      setTimeout(() => { try { filtRef.disconnect(); } catch (_) {} }, (STEAL_RAMP + 0.01) * 1000);
    }
  }

  function getFreeVoice(pool) {
    return pool.find(v => !v.active) ||
      pool.reduce((a, b) => b.startTime < a.startTime ? b : a, pool[0]);
  }

  // color param routes to the dedicated pool for that color
  function triggerNote(freq, cfg, sweepVol, color) {
    if (!actx) return;
    resume();

    const {
      waveform   = 'sine',
      octave     = 0,
      detune     = 0,
      filterType = 'none',
      filterFreq = 2000,
      filterQ    = 1,
      release    = 400,
      gain       = 0.75
    } = cfg || {};

    const pool = ensurePool(color || '_default');
    const now  = actx.currentTime;
    const v    = getFreeVoice(pool);

    // Steal gracefully if needed
    if (v.active) releaseVoice(v);
    if (v.osc)    { try { v.osc.stop(); } catch (_) {} v.osc = null; }
    if (v.filter) { try { v.filter.disconnect(); } catch (_) {} v.filter = null; }

    const osc = actx.createOscillator();
    osc.type            = waveform;
    osc.frequency.value = freq * Math.pow(2, octave);
    osc.detune.value    = detune;

    const peak      = 0.40 * gain * (sweepVol !== undefined ? sweepVol : 0.6);
    const attackSec = 0.018;
    const relSec    = Math.max(0.08, release / 1000);
    const duration  = attackSec + relSec + 0.05;

    const env = v.envGain.gain;
    env.cancelScheduledValues(now);
    env.setValueAtTime(0, now);
    env.linearRampToValueAtTime(peak, now + attackSec);
    // Exponential decay from peak to near-zero
    env.exponentialRampToValueAtTime(0.0001, now + attackSec + relSec);
    env.setValueAtTime(0, now + attackSec + relSec);

    if (filterType !== 'none') {
      const filt = actx.createBiquadFilter();
      filt.type            = filterType;
      filt.frequency.value = filterFreq;
      filt.Q.value         = filterQ;
      osc.connect(filt);
      filt.connect(v.envGain);
      v.filter = filt;
    } else {
      osc.connect(v.envGain);
      v.filter = null;
    }

    osc.start(now);
    osc.stop(now + duration);

    v.osc       = osc;
    v.active    = true;
    v.startTime = now;

    osc.onended = () => {
      if (v.osc === osc) {
        v.active = false;
        v.osc    = null;
        if (v.filter) { try { v.filter.disconnect(); } catch (_) {} v.filter = null; }
      }
    };
  }

  function noteForY(y, canvasH) {
    if (!currentScale.length) return null;
    const idx = Math.floor((y / canvasH) * currentScale.length);
    return currentScale[Math.max(0, Math.min(currentScale.length - 1, idx))];
  }

  function setRoot(root)     { currentRoot    = root;    currentScale = buildScale(root, currentScaleId); }
  function setScale(scaleId) { currentScaleId = scaleId; currentScale = buildScale(currentRoot, scaleId); }
  function setMasterVol(v)   { if (masterGain) masterGain.gain.value = v; }

  return { init, resume, triggerNote, noteForY, setRoot, setScale, setMasterVol, SCALES, ROOTS };
})();
