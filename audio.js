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
  const VOICE_COUNT = 16;
  const OCTAVES = 4;

  let actx, masterGain;
  const voices = [];
  let currentScale = [];
  let currentRoot  = 'C';
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

  function init() {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = actx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(actx.destination);

    for (let i = 0; i < VOICE_COUNT; i++) {
      const envGain = actx.createGain();
      envGain.gain.value = 0;
      envGain.connect(masterGain);
      voices.push({ osc: null, filter: null, envGain, active: false, startTime: -1 });
    }
    currentScale = buildScale(currentRoot, currentScaleId);
  }

  function resume() {
    if (actx && actx.state === 'suspended') actx.resume();
  }

  function getVoice() {
    let v = voices.find(v => !v.active);
    if (!v) {
      v = voices.reduce((old, cur) => cur.startTime < old.startTime ? cur : old, voices[0]);
      if (v.osc)    { try { v.osc.stop(); }        catch (_) {} v.osc    = null; }
      if (v.filter) { try { v.filter.disconnect(); } catch (_) {} v.filter = null; }
      v.active = false;
    }
    return v;
  }

  // cfg = full colorConfig object { waveform, octave, detune, filterType, filterFreq, filterQ, release, gain }
  function triggerNote(freq, cfg, sweepVol) {
    if (!actx) return;
    resume();

    const {
      waveform   = 'sine',
      octave     = 0,
      detune     = 0,
      filterType = 'none',
      filterFreq = 2000,
      filterQ    = 1,
      release    = 300,
      gain       = 0.8
    } = cfg || {};

    const now = actx.currentTime;
    const v   = getVoice();

    if (v.osc)    { try { v.osc.stop(); }        catch (_) {} v.osc    = null; }
    if (v.filter) { try { v.filter.disconnect(); } catch (_) {} v.filter = null; }

    const osc = actx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = freq * Math.pow(2, octave);
    osc.detune.value    = detune;

    const peak      = 0.45 * gain * (sweepVol !== undefined ? sweepVol : 0.6);
    const attackSec = 0.005;
    const relSec    = Math.max(0.02, release / 1000);
    const duration  = attackSec + relSec + 0.05;

    const env = v.envGain.gain;
    env.cancelScheduledValues(now);
    env.setValueAtTime(0, now);
    env.linearRampToValueAtTime(peak, now + attackSec);
    env.setValueAtTime(peak, now + attackSec);
    env.linearRampToValueAtTime(0, now + attackSec + relSec);

    let endNode = v.envGain;
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

  function setRoot(root)    { currentRoot    = root;    currentScale = buildScale(root, currentScaleId); }
  function setScale(scaleId){ currentScaleId = scaleId; currentScale = buildScale(currentRoot, scaleId); }
  function setMasterVol(v)  { if (masterGain) masterGain.gain.value = v; }

  return { init, resume, triggerNote, noteForY, setRoot, setScale, setMasterVol, SCALES, ROOTS };
})();
