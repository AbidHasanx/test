/* ============================================================
   speech.js — কান (SpeechRecognition) ও গলা (SpeechSynthesis)
   ============================================================ */
window.SPEECH = (function () {

  /* ================= TTS ================= */
  const synth = window.speechSynthesis;
  let voices = [];
  let speaking = false;
  let stopped = false;

  function loadVoices() {
    if (!synth) return [];
    voices = synth.getVoices() || [];
    return voices;
  }
  if (synth) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = loadVoices;
    }
  }

  function listVoices(langPrefix) {
    if (!voices.length) loadVoices();
    return voices.filter(v => !langPrefix || v.lang.toLowerCase().startsWith(langPrefix.toLowerCase().slice(0, 2)));
  }

  function pickVoice() {
    const s = window.STORE.settings;
    if (!voices.length) loadVoices();
    let v = voices.find(x => x.voiceURI === s.voiceURI);
    if (v) return v;
    const want = (s.lang || 'bn-BD').toLowerCase();
    const byExact = voices.find(x => x.lang.toLowerCase() === want);
    if (byExact) return byExact;
    const byPrefix = voices.find(x => x.lang.toLowerCase().startsWith(want.slice(0, 2)));
    return byPrefix || null;
  }

  function splitChunks(text) {
    const parts = String(text)
      .replace(/\s+/g, ' ')
      .split(/(?<=[।.!?;:])\s+/)
      .filter(Boolean);
    const out = [];
    let buf = '';
    for (const p of parts) {
      if ((buf + ' ' + p).length > 190 && buf) { out.push(buf.trim()); buf = p; }
      else buf = (buf + ' ' + p).trim();
    }
    if (buf) out.push(buf);
    return out.length ? out : [String(text)];
  }

  function speak(text, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!synth || !text) { resolve(false); return; }
      stop();
      stopped = false;
      const s = window.STORE.settings;
      const chunks = splitChunks(text);
      speaking = true;
      document.body.classList.add('speaking');
      if (opts.onStart) opts.onStart();
      let i = 0;

      function next() {
        if (stopped || i >= chunks.length) {
          speaking = false;
          document.body.classList.remove('speaking');
          if (opts.onEnd) opts.onEnd();
          resolve(!stopped);
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        const v = pickVoice();
        if (v) u.voice = v;
        u.lang = (v && v.lang) || s.lang || 'bn-BD';
        u.rate = s.rate || 1;
        u.pitch = s.pitch || 1;
        u.volume = 1;
        u.onend = () => setTimeout(next, 60);
        u.onerror = () => setTimeout(next, 60);
        synth.speak(u);
      }
      next();
    });
  }

  function stop() {
    stopped = true;
    speaking = false;
    document.body.classList.remove('speaking');
    if (synth) { try { synth.cancel(); } catch (e) {} }
  }

  const isSpeaking = () => speaking;

  /* ================= STT ================= */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;

  class Listener {
    constructor() {
      this.rec = null;
      this.wantRunning = false;
      this.mode = 'command';   // 'command' | 'wake'
      this.restartDelay = 300;
      this.finalText = '';
      this.hooks = {};
      this.stoppedBySilence = false;
      this.silenceTimer = null;
    }

    build() {
      const r = new SR();
      const s = window.STORE.settings;
      r.lang = s.lang || 'bn-BD';
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 3;

      r.onresult = (ev) => {
        let interim = '', final = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          const tx = res[0] && res[0].transcript ? res[0].transcript : '';
          if (res.isFinal) final += tx + ' ';
          else interim += tx;
        }
        if (final.trim()) {
          this.finalText += ' ' + final.trim();
          if (this.hooks.onFinal) this.hooks.onFinal(final.trim());
        }
        if (this.hooks.onInterim) this.hooks.onInterim(interim.trim() || this.finalText.trim());
        this.armSilence();
      };

      r.onerror = (ev) => {
        const err = ev.error;
        if (this.hooks.onError) this.hooks.onError(err);
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') {
          this.wantRunning = false;
          return;
        }
        this.scheduleRestart(err === 'no-speech' ? 500 : 900);
      };

      r.onend = () => {
        if (this.hooks.onEnd) this.hooks.onEnd();
        if (this.wantRunning) this.scheduleRestart(250);
      };

      return r;
    }

    armSilence() {
      if (this.mode !== 'command') return;
      clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => {
        if (this.finalText.trim()) this.finish();
      }, 2200);
    }

    finish() {
      const txt = this.finalText.trim();
      this.finalText = '';
      clearTimeout(this.silenceTimer);
      if (txt && this.hooks.onDone) this.hooks.onDone(txt);
    }

    scheduleRestart(ms) {
      if (!this.wantRunning) return;
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        if (!this.wantRunning) return;
        try { this.rec.start(); }
        catch (e) { /* ইতিমধ্যে চলছে */ }
      }, ms || this.restartDelay);
    }

    start(mode, hooks) {
      if (!SR) { if (hooks && hooks.onError) hooks.onError('unsupported'); return false; }
      this.stop(true);
      this.mode = mode || 'command';
      this.hooks = hooks || {};
      this.finalText = '';
      this.wantRunning = true;
      this.rec = this.build();
      try { this.rec.start(); }
      catch (e) { /* ignore */ }
      if (this.mode === 'command') {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          if (this.wantRunning) this.finish();
        }, 8000);
      }
      return true;
    }

    stop(hard) {
      this.wantRunning = false;
      clearTimeout(this._t);
      clearTimeout(this.silenceTimer);
      if (this.rec) {
        try { this.rec.onend = null; this.rec.stop(); } catch (e) {}
        this.rec = null;
      }
      if (!hard) this.finalText = '';
    }

    abort() {
      const txt = this.finalText.trim();
      this.stop();
      return txt;
    }
  }

  /* ---------- মাইক স্ট্রিম (ভিজ্যুয়ালাইজারের জন্য) ---------- */
  let micStream = null;
  async function getMicStream() {
    if (micStream) return micStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return micStream;
    } catch (e) { return null; }
  }
  function releaseMic() {
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  }

  /* ---------- ছোট সাউন্ড ইফেক্ট ---------- */
  let actx = null;
  function beep(freq, dur, type) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq || 660;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (dur || 0.12));
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + (dur || 0.12) + 0.02);
    } catch (e) { /* চুপচাপ */ }
  }
  const wakeSound = () => { beep(880, 0.09); setTimeout(() => beep(1320, 0.12), 90); };
  const errSound = () => beep(240, 0.18, 'triangle');

  return {
    supported, speak, stop, isSpeaking, loadVoices, listVoices, pickVoice,
    Listener, getMicStream, releaseMic, beep, wakeSound, errSound,
    get voices() { return voices; }
  };
})();
