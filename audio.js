const Audio = (() => {
  const SCALES = {
    major:       { label: 'Major',       intervals: [0,2,4,5,7,9,11] },
    minor:       { label: 'Minor',       intervals: [0,2,3,5,7,8,10] },
    pentatonicM: { label: 'Penta Maj',   intervals: [0,2,4,7,9] },
    pentatonicm: { label: 'Penta Min',   intervals: [0,3,5,7,10] },
    blues:       { label: 'Blues',       intervals: [0,3,5,6,7,10] },
    chromatic:   { label: 'Chromatic',   intervals: [0,1,2,3,4,5,6,7,8,9,10,11] }
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
  let currentRoot = 'C';
  let currentScaleId = 'major';

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function buildScale(root, scaleId) {
    const intervals = SCALES[scaleId].intervals;
    const rootMidi  = ROOT_MIDI[root] - 12; // one octave below middle C
    const notes = [];
    for (let o = 0; o < OCTAVES; o++) {
      intervals.forEach(i => notes.push(midiToHz(rootMidi + o * 12 + i)));
    }
    return notes.sort((a, b) => b - a); // high → low (Y=0 top = highest pitch)
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
      voices.push({ osc: null, envGain, active: false, startTime: -1 });
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
      if (v.osc) { try { v.osc.stop(); } catch (_) {} v.osc = null; }
      v.active = false;
    }
    return v;
  }

  function triggerNote(freq, waveform, sweepVol) {
    if (!actx) return;
    resume();
    const now = actx.currentTime;
    const v   = getVoice();

    if (v.osc) { try { v.osc.stop(); } catch (_) {} v.osc = null; }

    const osc = actx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = freq;

    const peak = 0.45 * (sweepVol !== undefined ? sweepVol : 0.6);
    const env  = v.envGain.gain;
    env.cancelScheduledValues(now);
    env.setValueAtTime(0, now);
    env.linearRampToValueAtTime(peak, now + 0.005);
    env.setValueAtTime(peak, now + 0.005);
    env.linearRampToValueAtTime(0, now + 0.18);

    osc.connect(v.envGain);
    osc.start(now);
    osc.stop(now + 0.22);

    v.osc       = osc;
    v.active    = true;
    v.startTime = now;
    // Guard by identity: stale onended from a stolen voice must not clear the new osc
    osc.onended = () => { if (v.osc === osc) { v.active = false; v.osc = null; } };
  }

  function noteForY(y, canvasH) {
    if (!currentScale.length) return null;
    const idx = Math.floor((y / canvasH) * currentScale.length);
    return currentScale[Math.max(0, Math.min(currentScale.length - 1, idx))];
  }

  function setRoot(root) {
    currentRoot = root;
    currentScale = buildScale(root, currentScaleId);
  }
  function setScale(scaleId) {
    currentScaleId = scaleId;
    currentScale = buildScale(currentRoot, scaleId);
  }
  function setMasterVol(v) { if (masterGain) masterGain.gain.value = v; }

  return { init, resume, triggerNote, noteForY, setRoot, setScale, setMasterVol, SCALES, ROOTS };
})();
