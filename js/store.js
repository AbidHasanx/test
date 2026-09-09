/* ============================================================
   store.js — localStorage-এ সব কিছু (ফোনেই থাকে, সার্ভারে নয়)
   ============================================================ */
window.STORE = (function () {
  const K = 'jarvis_bd_v1';

  const DEFAULTS = {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.5-flash',
    customEndpoint: '',
    online: false,
    onlyFree: true,

    lang: 'bn-BD',
    voiceURI: '',
    rate: 1.0,
    pitch: 1.0,
    autoSpeak: true,
    wake: true,
    listenAfter: false,

    userName: 'স্যার',
    persona: 'jarvis',
    shortReply: true,

    notes: [],
    tasks: [],
    reminders: [],
    memory: [],
    chat: []
  };

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(K);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  function save() {
    try { localStorage.setItem(K, JSON.stringify(data)); }
    catch (e) { console.warn('save failed', e); }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- সেটিংস ---------- */
  const settings = new Proxy(data, {
    set(t, k, v) { t[k] = v; save(); return true; },
    get(t, k) { return t[k]; }
  });

  /* ---------- নোট ---------- */
  function addNote(text) {
    const n = { id: uid(), text, at: Date.now() };
    data.notes.unshift(n); save(); return n;
  }
  function removeNote(id) { data.notes = data.notes.filter(n => n.id !== id); save(); }

  /* ---------- টাস্ক ---------- */
  function addTask(text) {
    const t = { id: uid(), text, done: false, at: Date.now() };
    data.tasks.unshift(t); save(); return t;
  }
  function toggleTask(id) {
    const t = data.tasks.find(x => x.id === id);
    if (t) { t.done = !t.done; save(); }
    return t;
  }
  function removeTask(id) { data.tasks = data.tasks.filter(t => t.id !== id); save(); }

  /* ---------- রিমাইন্ডার ---------- */
  function addReminder(text, at) {
    const r = { id: uid(), text, at, fired: false, created: Date.now() };
    data.reminders.push(r); save(); return r;
  }
  function removeReminder(id) { data.reminders = data.reminders.filter(r => r.id !== id); save(); }
  function markFired(id) {
    const r = data.reminders.find(x => x.id === id);
    if (r) { r.fired = true; save(); }
  }

  /* ---------- স্মৃতি (long-term facts) ---------- */
  function remember(fact) {
    const m = { id: uid(), text: fact, at: Date.now() };
    const exists = data.memory.some(x => x.text.toLowerCase() === fact.toLowerCase());
    if (!exists) { data.memory.unshift(m); save(); return true; }
    return false;
  }
  function forget(id) { data.memory = data.memory.filter(m => m.id !== id); save(); }
  function memoryText() {
    return data.memory.slice(0, 40).map(m => '- ' + m.text).join('\n');
  }

  /* ---------- চ্যাট ---------- */
  function pushChat(role, text, meta) {
    data.chat.push({ role, text, at: Date.now(), meta: meta || null });
    if (data.chat.length > 120) data.chat = data.chat.slice(-120);
    save();
  }
  function clearChat() { data.chat = []; save(); }

  function resetAll() {
    const keepKey = data.apiKey, keepProv = data.provider, keepModel = data.model;
    localStorage.removeItem(K);
    data = { ...DEFAULTS };
    data.apiKey = keepKey; data.provider = keepProv; data.model = keepModel;
    save();
  }

  return {
    settings, addNote, removeNote, addTask, toggleTask, removeTask,
    addReminder, removeReminder, markFired, remember, forget, memoryText,
    pushChat, clearChat, resetAll, uid, save,
    get notes() { return data.notes; },
    get tasks() { return data.tasks; },
    get reminders() { return data.reminders; },
    get memory() { return data.memory; },
    get chat() { return data.chat; }
  };
})();
