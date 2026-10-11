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

  const OCTAVES = 4;
  const ATTACK = 0.015;
  const FADE = 0.015;
  const MAX_VOICES = 128;
  let actx, masterGain;
  const voices = new Set();
  const sweepNotes = new Map();
  const previews = new Map();
  let currentScale = [];
  let currentRoot = 'C';
  let currentScaleId = 'major';

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function buildScale(root, scaleId) {
    const rootMidi = ROOT_MIDI[root] - 12;
    const notes = [];
    for (let o = 0; o < OCTAVES; o++) {
      SCALES[scaleId].intervals.forEach(i => notes.push(midiToHz(rootMidi + o * 12 + i)));
    }
    return notes.sort((a, b) => b - a);
  }

  function init() {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 16;
    comp.ratio.value = 4;
    comp.attack.value = 0.010;
    comp.release.value = 0.4;
    masterGain = actx.createGain();
    masterGain.gain.value = 0.65;
    masterGain.connect(comp);
    comp.connect(actx.destination);
    currentScale = buildScale(currentRoot, currentScaleId);
  }

  function resume() {
    if (actx && actx.state === 'suspended') actx.resume();
  }

  // Track the linear envelope ourselves as well, for browsers without
  // cancelAndHoldAtTime and for notes scheduled ahead of the audio clock.
  function levelAt(v, time) {
    const e = [...v.envelopes].reverse().find(segment => segment.start <= time);
    if (!e) return 0;
    if (time <= e.start) return e.from;
    if (time >= e.end) return e.to;
    return e.from + (e.to - e.from) * (time - e.start) / (e.end - e.start);
  }

  function ramp(v, target, time, duration) {
    const level = levelAt(v, time);
    const param = v.env.gain;
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(time);
    } else {
      // Preserve the part of an in-flight ramp before the cancellation time.
      param.cancelScheduledValues(time);
      const segment = [...v.envelopes].reverse().find(e => e.start <= time);
      if (segment && time > segment.start && time < segment.end) {
        param.linearRampToValueAtTime(level, time);
      }
    }
    param.setValueAtTime(level, time);
    param.linearRampToValueAtTime(target, time + duration);
    v.envelopes = v.envelopes.filter(e => e.start < time);
    v.envelopes.push({ start: time, end: time + duration, from: level, to: target });
  }

  function releaseVoice(v, time, duration = v.release) {
    if (v.ended) return;
    // Stop/pause can also cancel an attack that has not started yet.
    time = Math.max(actx.currentTime, time);
    ramp(v, 0, time, duration);
    v.releasing = true;
    v.stopTime = time + duration + 0.002;
    v.osc.stop(v.stopTime);
  }

  function makeVoice(freq, cfg, vol, time) {
    const {
      waveform = 'sine', octave = 0, detune = 0,
      filterType = 'none', filterFreq = 2000, filterQ = 1,
      release = 400, gain = 0.75
    } = cfg || {};
    // Prefer retiring a release tail under extreme density. Each retiring
    // voice keeps its own gain node; a new attack cannot cancel its fade.
    if (voices.size >= MAX_VOICES) {
      const old = Array.from(voices).find(v => v.releasing) || voices.values().next().value;
      releaseVoice(old, time, FADE);
      old.retired = true;
      voices.delete(old);
    }
    const osc = actx.createOscillator();
    const env = actx.createGain();
    const peak = 0.38 * gain * vol;
    osc.type = waveform;
    osc.frequency.value = freq * Math.pow(2, octave);
    osc.detune.value = detune;
    env.gain.value = 0;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + ATTACK);
    env.connect(masterGain);
    let filter = null;
    if (filterType !== 'none') {
      filter = actx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFreq;
      filter.Q.value = filterQ;
      osc.connect(filter);
      filter.connect(env);
    } else {
      osc.connect(env);
    }
    const v = {
      osc, env, filter, peak, startTime: time, release: Math.max(0.02, release / 1000),
      envelopes: [{ start: time, end: time + ATTACK, from: 0, to: peak }],
      releasing: false, ended: false, retired: false
    };
    osc.onended = () => {
      v.ended = true;
      voices.delete(v);
      osc.disconnect();
      if (filter) filter.disconnect();
      env.disconnect();
    };
    voices.add(v);
    osc.start(time);
    return v;
  }

  // One gate per sweep/color/pitch: continuous intersections sustain instead
  // of repeatedly decaying to silence. Different sweeps cannot suppress each other.
  function syncSweep(id, notes, configs, vol, time = currentTime()) {
    if (!actx) return;
    time = Math.max(time, actx.currentTime);
    const previous = sweepNotes.get(id) || new Map();
    const next = new Map();
    for (const { freq, color } of notes) {
      const cfg = configs[color] || {};
      const key = `${color}:${freq}:${JSON.stringify(cfg)}`;
      if (next.has(key)) continue;
      let voice = previous.get(key);
      if (!voice || voice.ended || voice.retired) voice = makeVoice(freq, cfg, vol, time);
      const peak = 0.38 * (cfg.gain ?? 0.75) * vol;
      if (voice.peak !== peak) {
        ramp(voice, peak, time, FADE);
        voice.peak = peak;
      }
      next.set(key, voice);
    }
    for (const [key, voice] of previous) {
      if (!next.has(key) && !voice.retired) {
        // Even a one-pixel crossing gets its full attack before the release.
        releaseVoice(voice, Math.max(time, voice.startTime + ATTACK));
      }
    }
    sweepNotes.set(id, next);
  }

  function releaseSweep(id, time = currentTime()) {
    const notes = sweepNotes.get(id);
    if (notes) for (const v of notes.values()) releaseVoice(v, time, FADE);
    sweepNotes.delete(id);
  }

  function stopAll() {
    if (!actx) return;
    for (const v of voices) releaseVoice(v, actx.currentTime, FADE);
    sweepNotes.clear();
    previews.clear();
  }

  // UI previews remain one-shots, isolated from the scanner's sustained voices.
  function triggerNote(freq, cfg, sweepVol = 0.6, color = '_default') {
    if (!actx) return;
    resume();
    const time = actx.currentTime;
    const old = previews.get(color);
    if (old && !old.ended) releaseVoice(old, time, FADE);
    const v = makeVoice(freq, cfg, sweepVol, time);
    previews.set(color, v);
    releaseVoice(v, time + ATTACK, v.release);
  }

  function currentTime() { return actx ? actx.currentTime : 0; }

  function noteForY(y, canvasH) {
    if (!currentScale.length) return null;
    const idx = Math.floor((y / canvasH) * currentScale.length);
    return currentScale[Math.max(0, Math.min(currentScale.length - 1, idx))];
  }

  // Returns Y positions (px) where octaves repeat, for a given canvas height.
  // These mark where the same note class starts again one octave lower.
  function getOctaveBoundaryYs(canvasH) {
    if (!currentScale.length) return [];
    const perOctave = SCALES[currentScaleId].intervals.length;
    const total = currentScale.length;
    const ys = [];
    for (let i = perOctave; i < total; i += perOctave) {
      ys.push((i / total) * canvasH);
    }
    return ys;
  }

  function setRoot(root)     { currentRoot    = root;    currentScale = buildScale(root, currentScaleId); }
  function setScale(scaleId) { currentScaleId = scaleId; currentScale = buildScale(currentRoot, scaleId); }
  function setMasterVol(v) {
    if (!masterGain) return;
    const now = actx.currentTime;
    masterGain.gain.setTargetAtTime(v, now, 0.015);
  }

  return { init, resume, triggerNote, syncSweep, releaseSweep, stopAll, currentTime, noteForY, getOctaveBoundaryYs, setRoot, setScale, setMasterVol, SCALES, ROOTS };
})();
