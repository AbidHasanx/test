/* ============================================================
   app.js — JARVIS-এর মূল নিয়ন্ত্রক
   ============================================================ */
(function () {
  const S = () => window.STORE.settings;
  const $ = (id) => document.getElementById(id);

  const el = {
    hudStatus: $('hudStatus'), statusLine: $('statusLine'), subLine: $('subLine'),
    clockTime: $('clockTime'), clockDate: $('clockDate'),
    chat: $('chat'), textInput: $('textInput'),
    btnMic: $('btnMic'), btnSend: $('btnSend'), btnStop: $('btnStop'),
    orb: $('orb'), viz: $('viz'), toast: $('toast'),
    btnSettings: $('btnSettings'), btnNotes: $('btnNotes'), btnInstall: $('btnInstall'),
    drawer: $('drawer'), drawerBackdrop: $('drawerBackdrop'), btnCloseDrawer: $('btnCloseDrawer'),
    notesDrawer: $('notesDrawer'), notesBackdrop: $('notesBackdrop'), btnCloseNotes: $('btnCloseNotes'),
    dataList: $('dataList'), dataInput: $('dataInput'), btnAddData: $('btnAddData'),
    selProvider: $('selProvider'), inpApiKey: $('inpApiKey'), selModel: $('selModel'),
    btnRefreshModels: $('btnRefreshModels'), btnSaveKey: $('btnSaveKey'), keyStatus: $('keyStatus'),
    providerHelp: $('providerHelp'), chkOnlyFree: $('chkOnlyFree'), chkOnline: $('chkOnline'),
    selLang: $('selLang'), selVoice: $('selVoice'), rngRate: $('rngRate'), rngPitch: $('rngPitch'),
    rateVal: $('rateVal'), pitchVal: $('pitchVal'), chkAutoSpeak: $('chkAutoSpeak'),
    chkWake: $('chkWake'), chkListenAfter: $('chkListenAfter'), btnTestVoice: $('btnTestVoice'),
    btnStopVoice: $('btnStopVoice'), voiceHint: $('voiceHint'),
    inpUserName: $('inpUserName'), selPersona: $('selPersona'), chkShortReply: $('chkShortReply'),
    btnClearChat: $('btnClearChat'), btnResetAll: $('btnResetAll'),
    btnToggleKey: $('btnToggleKey')
  };

  let listener = null;
  let busy = false;
  let deferredPrompt = null;

  /* ================= Toast & Status ================= */
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
  }
  function setStatus(main, sub) {
    if (main != null) el.statusLine.textContent = main;
    if (sub != null) el.subLine.textContent = sub;
  }
  function setHud(t) { el.hudStatus.textContent = t; }

  /* ================= ঘড়ি ================= */
  function tick() {
    const now = new Date();
    el.clockTime.textContent = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dhaka'
    }).format(now);
    el.clockDate.textContent = new Intl.DateTimeFormat('bn-BD', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka'
    }).format(now);
  }
  setInterval(tick, 15000); tick();

  /* ================= ভিজ্যুয়ালাইজার ================= */
  const vctx = el.viz.getContext('2d');
  let analyser = null, freqData = null;
  (function loop() {
    requestAnimationFrame(loop);
    const W = 520, C = 260, R = 148;
    vctx.clearRect(0, 0, W, W);
    const t = performance.now() / 1000;
    const state = document.body.classList.contains('listening') ? 'listen'
      : document.body.classList.contains('speaking') ? 'speak' : 'idle';

    let vals = [];
    if (state === 'listen' && analyser) {
      analyser.getByteFrequencyData(freqData);
      for (let i = 0; i < 72; i++) vals.push(freqData[i * 2] / 255);
    } else {
      const speed = state === 'speak' ? 5 : 1.3, amp = state === 'speak' ? 0.42 : 0.16;
      for (let i = 0; i < 72; i++) {
        vals.push(amp * (0.55 + 0.45 * Math.sin(t * speed + i * 0.22) * Math.sin(t * 0.7 + i * 0.06)));
      }
    }
    vctx.lineWidth = 2.4;
    for (let i = 0; i < vals.length; i++) {
      const a = (i / vals.length) * Math.PI * 2 - Math.PI / 2;
      const len = 10 + vals[i] * 78;
      const x1 = C + Math.cos(a) * (R + 6), y1 = C + Math.sin(a) * (R + 6);
      const x2 = C + Math.cos(a) * (R + 6 + len), y2 = C + Math.sin(a) * (R + 6 + len);
      const g = state === 'listen' ? '79,216,255' : state === 'speak' ? '94,242,160' : '79,216,255';
      vctx.strokeStyle = `rgba(${g},${0.25 + vals[i] * 0.7})`;
      vctx.beginPath(); vctx.moveTo(x1, y1); vctx.lineTo(x2, y2); vctx.stroke();
    }
  })();

  async function attachMicViz() {
    const stream = await window.SPEECH.getMicStream();
    if (!stream) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) { /* নীরব */ }
  }

  /* ================= চ্যাট UI ================= */
  function addMsg(role, text, meta) {
    const d = document.createElement('div');
    d.className = 'msg ' + role;
    d.textContent = text;
    if (meta) {
      const s = document.createElement('span');
      s.className = 'tool-tag';
      s.textContent = '⚙ ' + meta;
      d.appendChild(s);
    }
    el.chat.appendChild(d);
    el.chat.scrollTop = el.chat.scrollHeight;
    return d;
  }
  function renderHistory() {
    el.chat.innerHTML = '';
    window.STORE.chat.forEach(m => addMsg(m.role, m.text, m.meta));
  }

  /* ================= স্ক্রিন লাইট (টর্চ বিকল্প) ================= */
  function screenLight(sec) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999;';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), (sec || 10) * 1000);
    d.addEventListener('click', () => d.remove());
  }
  window.JARVIS = { screenLight, toast, setStatus, setHud, armReminder, speakOut: speakOut, addMsg };

  /* ================= রিমাইন্ডার ================= */
  function armReminder(r) {
    const delay = r.at - Date.now();
    if (delay <= 0) return;
    setTimeout(() => fireReminder(r), Math.min(delay, 2140000000));
  }
  function fireReminder(r) {
    window.STORE.markFired(r.id);
    const msg = `স্যার, মনে করিয়ে দিচ্ছি: ${r.text}`;
    notify('⏰ রিমাইন্ডার', r.text);
    addMsg('sys', '🔔 ' + r.text);
    if (S().autoSpeak) speakOut(msg);
    renderData();
  }
  function notify(title, body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      new Notification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    } catch (e) { /* iOS-এ Notification নাও থাকতে পারে */ }
  }
  function askNotify() {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
    catch (e) {}
  }

  /* ================= কথা বলা ================= */
  function speakOut(text) {
    if (!S().autoSpeak || !text) return Promise.resolve();
    window.SPEECH.stop();
    return window.SPEECH.speak(text, {
      onStart: () => { el.btnStop.hidden = false; setStatus('বলছি…', 'থামাতে ■ চাপো'); },
      onEnd: () => { el.btnStop.hidden = true; setStatus('প্রস্তুত', '“জার্ভিস” বলে ডাকো'); maybeResumeWake(); }
    });
  }

  /* ================= লোকাল ব্রেইন (key না থাকলে) ================= */
  function localBrain(text) {
    const t = (text || '').trim();
    const low = t.toLowerCase();
    const run = (n, a) => window.TOOLS.run(n, a || {});

    if (/(কয়টা|কতটা|কটা|সময়|টাইম|time|তারিখ|date|আজ কোন বার|আজকে কী বার)/i.test(low))
      return run('get_time');

    if (/(আবহাওয়া|weather|বৃষ্টি|তাপমাত্রা|গরম কত)/i.test(low)) {
      let place = 'Bogra';
      const m = t.match(/(?:এ|তে|র)\s*([\u0980-\u09FFa-zA-Z]+)(?:\s|-)?(?:এর)?\s*(?:আবহাওয়া|weather)/);
      if (m) place = m[1];
      return run('get_weather', { place });
    }

    if (/(নোট|লিখে রাখ|লিখে রাখো|note)/i.test(low) && !/(দেখাও|লিস্ট|কী আছে)/i.test(low))
      return run('add_note', { text: t.replace(/(নোট করো|নোট|লিখে রাখো|লিখে রাখ)/i, '').trim() || t });
    if (/(নোট.*(দেখাও|লিস্ট)|আমার নোট)/i.test(low)) return run('list_notes');

    if (/(মনে করিয়ো|মনে করিয়ে|রিমাইন্ড|remind|reminder)/i.test(low)) {
      const wm = t.match(/(পর|বাদে|পরে|at|এ)\s*([\u0980-\u09FF0-9:\-\s]+)$/);
      const when = wm ? wm[2] : t;
      return run('set_reminder', { text: t.replace(/(মনে করিয়ো|মনে করিয়ে|রিমাইন্ডার|রিমাইন্ড|remind me to|remind)/ig, '').trim(), when });
    }
    if (/(টাস্ক|কাজ.*(যোগ|যুক্ত)|add task|কাজের লিস্ট|টাস্ক দেখাও|আমার কাজ)/i.test(low)) {
      if (/(দেখাও|লিস্ট|কী আছে)/i.test(low)) return run('list_tasks');
      return run('add_task', { text: t.replace(/(টাস্ক যোগ করো|টাস্ক|কাজ যোগ করো|add task)/i, '').trim() || t });
    }
    if (/(ব্যাটারি|চার্জ)/i.test(low)) return run('device_status');

    // হিসাব
    if (/[0-9০-৯]/.test(t)) {
      let e = t.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d))
        .replace(/(যোগ|প্লাস|plus)/gi, '+')
        .replace(/(বিয়োগ|বিয়োগ|মাইনাস|minus)/gi, '-')
        .replace(/(গুণ|গুন|times)/gi, '*')
        .replace(/(ভাগ|divide)/gi, '/')
        .replace(/(শতাংশ|শতভাগ|percent)/gi, '/100')
        .replace(/[^\d+\-*/(). ]/g, ' ');
      if (/[+\-*/]/.test(e) && (e.match(/\d/g) || []).length >= 2) {
        try {
          const v = window.TOOLS.calc(e);
          return Promise.resolve({ ok: true, name: 'calculate', out: `${e.trim()} = ${v}` });
        } catch (err) { /* নিচে যাক */ }
      }
    }
    return null;
  }

  /* ================= মূল প্রসেস ================= */
  async function process(text, opts) {
    opts = opts || {};
    if (!text || !text.trim()) return;
    if (busy) { toast('একটু অপেক্ষা করো স্যার…'); return; }
    busy = true;
    window.SPEECH.stop();
    stopListening();

    addMsg('user', text);
    window.STORE.pushChat('user', text);
    setStatus('চিন্তা করছি…', '');
    document.body.classList.add('thinking');

    let reply = '', tools = [];
    try {
      if (!S().apiKey.trim()) {
        const local = await localBrain(text);
        if (local) {
          tools = [local.name];
          const sys = window.CFG.buildSystemPrompt() +
            '\n\nটুলের ফলাফল ব্যবহার করে ১-২ লাইনে বাংলায় উত্তর দাও। কোনো JSON দিও না।';
          const wrapped = await (async () => {
            try { return window.AI.cleanReply(await window.AI.chat(
              '[সিস্টেম] "' + local.name + '" টুলের ফলাফল:\n' + local.out + '\n\nপ্রশ্ন ছিল: ' + text,
              { onStatus: () => {} })); }
            catch (e) { return local.out; }
          })();
          reply = wrapped || local.out;
        } else {
          reply = 'স্যার, আমার AI ব্রেইন এখনো কানেক্ট করা হয়নি। ⚙ সেটিংসে গিয়ে একটা ফ্রি Gemini বা OpenRouter key বসাও — তারপর আমি সবকিছু করতে পারব। এর মধ্যে সময়, হিসাব ও আবহাওয়া আমি নিজেই বলতে পারি।';
        }
      } else {
        setStatus('চিন্তা করছি…', (S().provider === 'gemini' ? 'Gemini' : S().provider === 'openrouter' ? 'OpenRouter' : 'AI') + ' ভাবছে…');
        const r = await window.AI.chat(text, {
          onStatus: (s) => { setStatus(s, ''); }
        });
        reply = r.text; tools = r.tools;
      }
    } catch (e) {
      let msg = e.message || String(e);
      if (/Failed to fetch|NetworkError|TypeError/i.test(msg)) msg = 'ইন্টারনেট সংযোগ পাচ্ছি না স্যার।';
      if (/quota|429|rate/i.test(msg)) msg = 'ফ্রি লিমিট শেষ স্যার — কিছুক্ষণ পর বা অন্য মডেল দিয়ে চেষ্টা করো।';
      if (/401|403|key/i.test(msg)) msg = 'API key-এ সমস্যা — সেটিংসে key চেক করো স্যার।';
      reply = msg;
      addMsg('err', reply);
      window.SPEECH.errSound();
    } finally {
      document.body.classList.remove('thinking');
      busy = false;
    }

    if (reply && !el.chat.lastElementChild?.classList.contains('err')) {
      addMsg('bot', reply, tools.length ? tools.join(' · ') : null);
      window.STORE.pushChat('assistant', reply, tools.length ? tools.join(' · ') : null);
    }
    await speakOut(reply);
    maybeResumeWake();
    renderData();
  }

  /* ================= শোনা (STT) ================= */
  function startListening() {
    if (!window.SPEECH.supported) {
      toast('এই ব্রাউজারে ভয়েস ইনপুট নেই — Chrome/Edge ব্যবহার করো');
      return;
    }
    if (busy) return;
    window.SPEECH.stop();
    document.body.classList.add('listening');
    attachMicViz();
    setStatus('শুনছি…', 'কথা বলো…');

    listener = new window.SPEECH.Listener();
    listener.start('command', {
      onInterim: (tx) => { if (tx) setStatus('শুনছি…', '“' + tx + '”'); },
      onFinal: (tx) => { setStatus('শুনছি…', '“' + tx + '”'); },
      onDone: (tx) => {
        stopListening();
        const cleaned = stripWake(tx);
        if (cleaned && cleaned.length > 1) {
          process(cleaned);
        } else {
          setStatus('প্রস্তুত', 'কিছু শুনতে পাইনি');
          maybeResumeWake();
        }
      },
      onError: (err) => {
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          stopListening();
          toast('মাইক পারমিশন দরকার — ব্রাউজার সেটিংস থেকে Allow দাও');
        }
      },
      onEnd: () => {}
    });
  }

  function stopListening() {
    if (listener) { listener.stop(); listener = null; }
    document.body.classList.remove('listening');
    window.SPEECH.releaseMic();
    analyser = null;
    el.btnStop.hidden = true;
  }

  /* ================= Wake word ================= */
  const WAKE = /(জার্ভিস|জারভিস|জারবিস|জারভিশ|জার্ভিশ|jarvis|jarves|jarbis|হেই জার্ভিস|ওকে জার্ভিস)/i;
  function stripWake(t) {
    return String(t || '')
      .replace(/(?:ও|হেই|হে|ওকে|hey|hi|ok|okay)?\s*(?:জার্ভিস|জারভিস|জারবিস|জারভিশ|জার্ভিশ|jarvis|jarves)[,\s]*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  let wakeListener = null, wakeRunning = false;

  function startWakeLoop() {
    if (!S().wake || !window.SPEECH.supported || wakeRunning) return;
    wakeRunning = true;
    wakeListener = new window.SPEECH.Listener();
    wakeListener.start('wake', {
      onFinal: (tx) => {
        if (WAKE.test(tx)) {
          window.SPEECH.wakeSound();
          const rest = stripWake(tx);
          stopWakeLoop();
          setStatus('হাজির স্যার', 'কী করতে পারি?');
          if (rest && rest.length > 2 && !/^(জার্ভিস|jarvis|জারভিস)/i.test(rest)) process(rest);
          else startListening();
        }
      },
      onInterim: (tx) => { if (WAKE.test(tx)) { /* অপেক্ষা */ } },
      onError: (err) => {
        if (err === 'not-allowed' || err === 'service-not-allowed') { stopWakeLoop(); }
      }
    });
  }
  function stopWakeLoop() {
    if (wakeListener) { wakeListener.stop(); wakeListener = null; }
    wakeRunning = false;
  }
  function maybeResumeWake() {
    if (S().wake && S().listenAfter && !busy && !window.SPEECH.isSpeaking()) {
      setTimeout(() => { if (!busy) startWakeLoop(); }, 400);
    } else if (S().wake && !wakeRunning && !busy) {
      setTimeout(() => { if (!busy) startWakeLoop(); }, 1200);
    }
  }

  /* ================= ডেটা ড্রয়ার ================= */
  let curTab = 'tasks';
  function renderData() {
    const box = el.dataList;
    box.innerHTML = '';
    const empty = (t) => { box.innerHTML = `<div class="data-empty">${t}</div>`; };
    const item = (txt, meta, onX, done) => {
      const d = document.createElement('div');
      d.className = 'data-item' + (done ? ' done' : '');
      const s = document.createElement('div'); s.className = 'txt';
      s.textContent = txt;
      if (meta) { const m = document.createElement('span'); m.className = 'meta'; m.textContent = meta; s.appendChild(m); }
      d.appendChild(s);
      const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕';
      x.onclick = onX;
      d.appendChild(x);
      box.appendChild(d);
    };
    if (curTab === 'tasks') {
      const ts = window.STORE.tasks;
      if (!ts.length) return empty('কোনো টাস্ক নেই। বলো — “টাস্ক যোগ করো দুধ কিনতে হবে”');
      ts.forEach(t => item(t.text, t.done ? 'সম্পন্ন' : new Date(t.at).toLocaleString('bn-BD'),
        () => { window.STORE.removeTask(t.id); renderData(); }, t.done));
      box.querySelectorAll('.data-item .txt').forEach((n, i) => {
        n.onclick = () => { window.STORE.toggleTask(ts[i].id); renderData(); };
      });
    } else if (curTab === 'notes') {
      const ns = window.STORE.notes;
      if (!ns.length) return empty('কোনো নোট নেই।');
      ns.forEach(n => item(n.text, new Date(n.at).toLocaleString('bn-BD'), () => { window.STORE.removeNote(n.id); renderData(); }));
    } else if (curTab === 'reminders') {
      const rs = window.STORE.reminders.filter(r => !r.fired);
      if (!rs.length) return empty('কোনো রিমাইন্ডার নেই।');
      rs.forEach(r => item(r.text, window.TOOLS.fmtDate(r.at) + ' ' + window.TOOLS.fmtTime(r.at), () => { window.STORE.removeReminder(r.id); renderData(); }));
    } else {
      const ms = window.STORE.memory;
      if (!ms.length) return empty('আমি এখনো তোমার সম্পর্কে কিছু মনে রাখিনি।');
      ms.forEach(m => item(m.text, 'মনে রাখা হয়েছে', () => { window.STORE.forget(m.id); renderData(); }));
    }
  }
  $('dataSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...$('dataSeg').children].forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    curTab = b.dataset.tab;
    el.dataInput.placeholder = curTab === 'tasks' ? 'নতুন কাজ…' : curTab === 'notes' ? 'নতুন নোট…'
      : curTab === 'reminders' ? 'কী মনে করাবো? (যেমন: ১০ মিনিট পর চা)' : 'কী মনে রাখবো?';
    renderData();
  });
  el.btnAddData.addEventListener('click', () => {
    const v = el.dataInput.value.trim(); if (!v) return;
    if (curTab === 'tasks') window.STORE.addTask(v);
    else if (curTab === 'notes') window.STORE.addNote(v);
    else if (curTab === 'memory') window.STORE.remember(v);
    else {
      const ts = window.TOOLS.parseWhen(v);
      const r = window.STORE.addReminder(ts ? v.replace(/(পর|বাদে|পরে)$/, '').trim() : v, ts || Date.now() + 600000);
      armReminder(r);
    }
    el.dataInput.value = '';
    renderData();
    toast('যোগ করা হয়েছে');
  });

  /* ================= ড্রয়ার ওপেন/বন্দ ================= */
  function openDrawer(d, b) { d.classList.add('show'); b.classList.add('show'); }
  function closeDrawer(d, b) { d.classList.remove('show'); b.classList.remove('show'); }
  el.btnSettings.onclick = () => { openDrawer(el.drawer, el.drawerBackdrop); refreshVoiceList(); };
  el.btnCloseDrawer.onclick = () => closeDrawer(el.drawer, el.drawerBackdrop);
  el.drawerBackdrop.onclick = () => closeDrawer(el.drawer, el.drawerBackdrop);
  el.btnNotes.onclick = () => { renderData(); openDrawer(el.notesDrawer, el.notesBackdrop); };
  el.btnCloseNotes.onclick = () => closeDrawer(el.notesDrawer, el.notesBackdrop);
  el.notesBackdrop.onclick = () => closeDrawer(el.notesDrawer, el.notesBackdrop);

  /* ================= সেটিংস লজিক ================= */
  function fillProvider() {
    const p = window.CFG.PROVIDERS[S().provider];
    el.providerHelp.innerHTML = p.help;
    $('customEndpointRow').hidden = (S().provider !== 'custom');
    el.chkOnline.parentElement.hidden = (S().provider !== 'openrouter');
    el.btnRefreshModels.hidden = (S().provider === 'custom');
    loadModels(true);
  }
  async function loadModels(silent) {
    const models = await window.AI.fetchModels();
    const cur = S().model;
    el.selModel.innerHTML = '';
    models.forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      el.selModel.appendChild(o);
    });
    if (models.includes(cur)) el.selModel.value = cur;
    else if (models.length) { el.selModel.value = models[0]; S().model = models[0]; }
    if (!models.length) {
      const o = document.createElement('option');
      o.textContent = 'key দাও, তারপর ⟳ চাপো'; el.selModel.appendChild(o);
    }
    if (!silent) toast(models.length + 'টি মডেল পাওয়া গেছে');
  }

  el.selProvider.onchange = () => {
    S().provider = el.selProvider.value;
    const p = window.CFG.PROVIDERS[S().provider];
    S().model = (p.models && p.models[0]) || '';
    fillProvider();
  };
  el.inpApiKey.oninput = () => { S().apiKey = el.inpApiKey.value.trim(); };
  el.selModel.onchange = () => { S().model = el.selModel.value; };
  el.chkOnlyFree.onchange = () => { S().onlyFree = el.chkOnlyFree.checked; loadModels(); };
  el.chkOnline.onchange = () => { S().online = el.chkOnline.checked; };
  el.btnRefreshModels.onclick = () => loadModels();
  $('inpEndpoint').oninput = () => { S().customEndpoint = $('inpEndpoint').value.trim(); };
  el.btnToggleKey.onclick = () => {
    el.inpApiKey.type = el.inpApiKey.type === 'password' ? 'text' : 'password';
    el.btnToggleKey.textContent = el.inpApiKey.type === 'password' ? 'দেখাও' : 'লুকাও';
  };
  el.btnSaveKey.onclick = async () => {
    S().apiKey = el.inpApiKey.value.trim();
    el.keyStatus.className = 'save-note';
    el.keyStatus.textContent = 'টেস্ট করা হচ্ছে…';
    const r = await window.AI.testKey();
    el.keyStatus.textContent = r.msg;
    el.keyStatus.className = 'save-note ' + (r.ok ? 'ok' : 'bad');
    if (r.ok) { setHud('অনলাইন · ' + window.CFG.PROVIDERS[S().provider].name); loadModels(true); }
  };

  /* ভয়েস */
  function refreshVoiceList() {
    const vs = window.SPEECH.listVoices((S().lang || 'bn').slice(0, 2));
    el.selVoice.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = ''; auto.textContent = '— অটো (সেরা বাংলা ভয়েস) —';
    el.selVoice.appendChild(auto);
    vs.forEach(v => {
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = `${v.name.replace(/Microsoft |Google |\(.*\)/g, '').trim()} · ${v.lang}${v.localService ? '' : ' ☁'}`;
      el.selVoice.appendChild(o);
    });
    el.selVoice.value = S().voiceURI || '';
    const bn = vs.filter(v => v.lang.toLowerCase().startsWith('bn'));
    el.voiceHint.innerHTML = bn.length
      ? `✅ এই ডিভাইসে ${bn.length}টি বাংলা ভয়েস আছে।`
      : `⚠️ বাংলা ভয়েস পাওয়া যায়নি। <b>Android:</b> Settings → System → Languages → Text-to-speech → <i>Bangla (Bangladesh)</i> ইনস্টল করো, তারপর এই পেজ রিফ্রেশ করো।`;
  }
  el.selLang.onchange = () => { S().lang = el.selLang.value; refreshVoiceList(); };
  el.selVoice.onchange = () => { S().voiceURI = el.selVoice.value; };
  el.rngRate.oninput = () => { S().rate = parseFloat(el.rngRate.value); el.rateVal.textContent = S().rate.toFixed(2); };
  el.rngPitch.oninput = () => { S().pitch = parseFloat(el.rngPitch.value); el.pitchVal.textContent = S().pitch.toFixed(2); };
  el.chkAutoSpeak.onchange = () => { S().autoSpeak = el.chkAutoSpeak.checked; };
  el.chkWake.onchange = () => { S().wake = el.chkWake.checked; S().wake ? startWakeLoop() : stopWakeLoop(); };
  el.chkListenAfter.onchange = () => { S().listenAfter = el.chkListenAfter.checked; };
  el.btnTestVoice.onclick = () => {
    window.SPEECH.speak('হ্যালো স্যার, আমি জার্ভিস। আমি বাংলায় কথা বলতে পারি। আপনি কেমন আছেন?');
  };
  el.btnStopVoice.onclick = () => { window.SPEECH.stop(); el.btnStop.hidden = true; };

  el.inpUserName.oninput = () => { S().userName = el.inpUserName.value.trim() || 'স্যার'; };
  el.selPersona.onchange = () => { S().persona = el.selPersona.value; };
  el.chkShortReply.onchange = () => { S().shortReply = el.chkShortReply.checked; };

  el.btnClearChat.onclick = () => { window.STORE.clearChat(); el.chat.innerHTML = ''; toast('চ্যাট মুছে ফেলা হয়েছে'); };
  el.btnResetAll.onclick = () => {
    if (confirm('সব নোট, টাস্ক, রিমাইন্ডার ও চ্যাট মুছে যাবে। চালাবো?')) {
      window.STORE.resetAll(); el.chat.innerHTML = ''; renderData(); toast('রিসেট সম্পন্ন');
    }
  };

  /* ================= ইভেন্ট ================= */
  el.btnSend.onclick = () => { const v = el.textInput.value.trim(); el.textInput.value = ''; process(v || 'হ্যালো জার্ভিস'); };
  el.textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.btnSend.click(); });
  el.btnMic.onclick = () => { askNotify(); if (document.body.classList.contains('listening')) { const t = listener && listener.abort(); stopListening(); if (t) process(stripWake(t)); } else startListening(); };
  el.orb.onclick = () => {
    askNotify();
    if (window.SPEECH.isSpeaking()) { window.SPEECH.stop(); return; }
    el.btnMic.click();
  };
  el.btnStop.onclick = () => { window.SPEECH.stop(); stopListening(); busy = false; el.btnStop.hidden = true; setStatus('থামানো হয়েছে', ''); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopWakeLoop(); else maybeResumeWake(); });

  /* ================= ইনস্টল (PWA) ================= */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; el.btnInstall.hidden = false;
  });
  el.btnInstall.onclick = async () => {
    if (!deferredPrompt) {
      toast('ব্রাউজারের মেনু (⋮) → “Add to Home screen / ইনস্টল” চাপো');
      return;
    }
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice;
    if (r.outcome === 'accepted') toast('ইনস্টল হয়ে গেছে! 🎉');
    deferredPrompt = null; el.btnInstall.hidden = true;
  };

  /* ================= সার্ভিস ওয়ার্কার ================= */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ================= শুরু ================= */
  function boot() {
    const s = S();

    // পুরনো মডেল নাম থাকলে (যেমন gemini-2.5-flash) নিজে থেকে আপগ্রেড
    if (s.provider === 'gemini' && /^gemini-2\./.test(s.model || '')) {
      s.model = 'gemini-3.8-flash';
    }
    el.selProvider.value = s.provider;
    el.inpApiKey.value = s.apiKey;
    $('inpEndpoint').value = s.customEndpoint || '';
    el.chkOnlyFree.checked = s.onlyFree;
    el.chkOnline.checked = s.online;
    el.selLang.value = s.lang;
    el.rngRate.value = s.rate; el.rateVal.textContent = s.rate.toFixed(2);
    el.rngPitch.value = s.pitch; el.pitchVal.textContent = s.pitch.toFixed(2);
    el.chkAutoSpeak.checked = s.autoSpeak;
    el.chkWake.checked = s.wake;
    el.chkListenAfter.checked = s.listenAfter;
    el.inpUserName.value = s.userName;
    el.selPersona.value = s.persona;
    el.chkShortReply.checked = s.shortReply;

    fillProvider();
    renderHistory();
    renderData();

    window.STORE.reminders.filter(r => !r.fired).forEach(armReminder);

    setHud(s.apiKey ? 'অনলাইন · ' + window.CFG.PROVIDERS[s.provider].name : 'লোকাল মোড · key নেই');
    if (!s.apiKey) {
      addMsg('sys', 'স্বাগতম স্যার। আমি জার্ভিস। ⚙ সেটিংস আইকনে গিয়ে একটা ফ্রি API key বসালে আমি পুরো ক্ষমতায় কাজ করব — ততক্ষণ সময়, হিসাব আর আবহাওয়া আমি নিজেই বলতে পারি।');
    } else {
      addMsg('sys', 'সিস্টেম অনলাইন। নিচের মাইকে চাপ দিয়ে বাংলায় বলো, নাহলে টাইপ করো।');
    }

    // শর্টকাট: index.html?tab=tasks
    const q = new URLSearchParams(location.search).get('tab');
    if (q && ['tasks', 'notes', 'reminders', 'memory'].includes(q)) {
      curTab = q;
      [...$('dataSeg').children].forEach(x => x.classList.toggle('active', x.dataset.tab === q));
      setTimeout(() => { renderData(); openDrawer(el.notesDrawer, el.notesBackdrop); }, 400);
    }

    // প্রথম ইন্টারঅ্যাকশনের পর ওয়েক-ওয়ার্ড চালু (Chrome-এর নিয়ম)
    const once = () => {
      document.removeEventListener('pointerdown', once);
      window.SPEECH.loadVoices();
      refreshVoiceList();
      if (s.wake) setTimeout(startWakeLoop, 1200);
      askNotify();
    };
    document.addEventListener('pointerdown', once, { once: true });
  }

  boot();
})();
