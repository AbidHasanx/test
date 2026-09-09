/* ============================================================
   tools.js — JARVIS-এর "হাত" : সময়, হিসাব, আবহাওয়া, নোট, রিমাইন্ডার…
   ============================================================ */
window.TOOLS = (function () {
  const S = () => window.STORE.settings;

  /* ---------- হেল্পার ---------- */
  const bnDigits = { '০': 0, '১': 1, '২': 2, '৩': 3, '৪': 4, '৫': 5, '৬': 6, '৭': 7, '৮': 8, '৯': 9 };
  function toEnNum(str) {
    return String(str).replace(/[০-৯]/g, d => bnDigits[d]);
  }
  function bnNum(n) {
    return String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
  }
  function fmtTime(ts) {
    return new Intl.DateTimeFormat('bn-BD', {
      hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka'
    }).format(new Date(ts));
  }
  function fmtDate(ts) {
    return new Intl.DateTimeFormat('bn-BD', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dhaka'
    }).format(new Date(ts));
  }

  const WMO = {
    0: 'পরিষ্কার আকাশ', 1: 'প্রায় পরিষ্কার', 2: 'আংশিক মেঘলা', 3: 'মেঘলা',
    45: 'কুয়াশা', 48: 'ঘন কুয়াশা', 51: 'হালকা গুঁড়ি গুঁড়ি বৃষ্টি', 53: 'গুঁড়ি গুঁড়ি বৃষ্টি',
    55: 'ভারী গুঁড়ি গুঁড়ি বৃষ্টি', 56: 'হালকা শীতল বৃষ্টি', 57: 'শীতল বৃষ্টি',
    61: 'হালকা বৃষ্টি', 63: 'মাঝারি বৃষ্টি', 65: 'ভারী বৃষ্টি', 66: 'হালকা বরফ-বৃষ্টি',
    67: 'বরফ-বৃষ্টি', 71: 'হালকা তুষারপাত', 73: 'তুষারপাত', 75: 'ভারী তুষারপাত',
    77: 'তুষার দানা', 80: 'হালকা বৃষ্টি ঝড়', 81: 'বৃষ্টি ঝড়', 82: 'প্রবল বৃষ্টি ঝড়',
    85: 'তুষার ঝড়', 86: 'প্রবল তুষার ঝড়', 95: 'বজ্রঝড়', 96: 'বজ্রঝড় ও শিলাবৃষ্টি',
    99: 'প্রবল বজ্রঝড় ও শিলাবৃষ্টি'
  };

  /* ---------- সময় পার্সার (বাংলা টেক্সট → timestamp) ---------- */
  function parseWhen(input) {
    if (!input) return null;
    const raw = toEnNum(String(input)).trim().toLowerCase();

    // 1) ISO
    const iso = Date.parse(raw);
    if (!isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(raw)) return iso;

    const now = new Date();

    // 2) "৫ মিনিট পর" / "in 10 minutes" / "2 ঘন্টা বাদে"
    // ⚠️ \b ব্যবহার করা যাবে না — বাংলা অক্ষর \w নয়, তাই \b কাজ করবে না
    const rel = raw.match(/(\d+(?:\.\d+)?)\s*(মিনিট|মিনিটের|minute|min|মি\.?)/);
    const relH = raw.match(/(\d+(?:\.\d+)?)\s*(ঘন্টা|ঘণ্টা|hour|hr)/);
    const relS = raw.match(/(\d+(?:\.\d+)?)\s*(সেকেন্ড|second|sec)/);

    if (relS) return now.getTime() + parseFloat(relS[1]) * 1000;
    if (relH) return now.getTime() + parseFloat(relH[1]) * 3600000;
    if (rel) return now.getTime() + parseFloat(rel[1]) * 60000;

    // 3) আজ / কাল / আগামীকাল + সময়
    let base = new Date(now);
    if (/(পরশু|পরশুদিন)/.test(raw)) base.setDate(base.getDate() + 2);
    else if (/(আগামীকাল|কালকে|কাল|tomorrow)/.test(raw)) base.setDate(base.getDate() + 1);
    else if (/(আজ|today)/.test(raw)) { /* আজই */ }

    // সময়: "সকাল ৯টা", "৯:৩০", "রাত ১০", "বিকেল ৪টা", "pm 5"
    let t = raw.match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
    let hour = null, minute = 0;
    if (t) { hour = parseInt(t[1], 10); minute = parseInt(t[2], 10); }
    else {
      t = raw.match(/(\d{1,2})\s*(টা|টায়|টার|ঘটিকায়|বাজে|o'?clock)?/);
      if (t) hour = parseInt(t[1], 10);
    }
    if (hour === null) return null;

    if (/(রাত|সন্ধ্যা|সন্ধা|বিকেল|pm|রাত্রি)/.test(raw) && hour < 12) hour += 12;
    if (/(সকাল|ভোর|সূর্যোদয়)/.test(raw) && hour === 12) hour = 0;
    if (/(দুপুর|মধ্যাহ্ন)/.test(raw) && hour < 12) hour = hour; // দুপুর ৩ = 15:00
    if (/(দুপুর)/.test(raw) && hour < 12 && hour >= 1) hour += 12;

    base.setHours(hour, minute, 0, 0);
    if (base.getTime() <= now.getTime() && !/(আজ|today)/.test(raw)) {
      base.setDate(base.getDate() + 1); // সময় পার হয়ে গেলে পরের দিন
    }
    return base.getTime();
  }

  /* ---------- নিরাপদ ক্যালকুলেটর ---------- */
  function calc(expr) {
    let e = toEnNum(expr)
      .replace(/[×x]/g, '*').replace(/[÷]/g, '/').replace(/\^/g, '**')
      .replace(/–/g, '-').replace(/[−—]/g, '-')
      .replace(/[, ]/g, '');
    if (!e) throw new Error('খালি');
    // হরফ থাকলে বন্ধ ( যেমন "alert(1)" )
    if (/[a-zA-Zঀ-৿\u09E6-\u09EF]/.test(e)) throw new Error('অবৈধ অক্ষর');
    e = e.replace(/[^\d+\-*/().%]/g, '');
    if (!e) throw new Error('খালি');
    // eslint-disable-next-line no-new-func
    const out = Function('"use strict";return (' + e + ')')();
    if (typeof out !== 'number' || !isFinite(out)) throw new Error('অবৈধ ফলাফল');
    return Math.round(out * 1e10) / 1e10;
  }

  /* ============================================================
     টুল রেজিস্ট্রি
     ============================================================ */
  const REG = {};

  function def(name, desc, argsDesc, fn) {
    REG[name] = { name, desc, argsDesc, run: fn };
  }

  /* --- সময় ও তারিখ --- */
  def('get_time', 'এখন কয়টা বাড়ছে বা আজ কী তারিখ জানতে।', '{}', async () => {
    const now = new Date();
    return `এখন সময় ${fmtTime(now)}। আজ ${fmtDate(now)} (এশিয়া/ঢাকা সময়)।`;
  });

  /* --- হিসাব --- */
  def('calculate', 'যেকোনো গাণিতিক হিসাব। অনুমান করো না, সবসময় এটা ব্যবহার করো।',
    '{"expression": "যেমন (1250*3)/2"}', async (a) => {
      const v = calc(a.expression);
      return `${a.expression} = ${v}`;
    });

  /* --- আবহাওয়া --- */
  def('get_weather', 'যেকোনো জায়গার বর্তমান ও আগামীকালের আবহাওয়া (কোনো key লাগে না)।',
    '{"place": "শহরের নাম, যেমন Bogra"}', async (a) => {
      const place = (a.place || 'Bogra').trim();
      const g = await fetch(`https://geocoding.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=bn&format=json`)
        .then(r => r.json());
      if (!g.results || !g.results.length) return `দুঃখিত, "${place}" নামে কোনো জায়গা খুঁজে পাইনি।`;
      const p = g.results[0];
      const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
        `&timezone=Asia%2FDhaka&forecast_days=2`).then(r => r.json());
      const c = w.current, d = w.daily;
      const name = p.name + (p.admin1 ? ', ' + p.admin1 : '');
      return `${name}-এর আবহাওয়া:\n` +
        `এখন ${c.temperature_2m}°সেলসিয়াস, অনুভূত হচ্ছে ${c.apparent_temperature}°, ${WMO[c.weather_code] || 'জানা নেই'}\n` +
        `আর্দ্রতা ${c.relative_humidity_2m}%, বাতাস ${c.wind_speed_10m} কিমি/ঘণ্টা\n` +
        `আজ সর্বোচ্চ ${d.temperature_2m_max[0]}° / সর্বনিম্ন ${d.temperature_2m_min[0]}°, বৃষ্টির সম্ভাবনা ${d.precipitation_probability_max[0]}%\n` +
        `আগামীকাল সর্বোচ্চ ${d.temperature_2m_max[1]}° / সর্বনিম্ন ${d.temperature_2m_min[1]}°, বৃষ্টির সম্ভাবনা ${d.precipitation_probability_max[1]}%`;
    });

  /* --- ওয়েব সার্চ (CORS-ফ্রেন্ডলি উৎস) --- */
  def('web_search', 'ইন্টারনেটে কারেন্ট তথ্য, খবর, দাম, সংজ্ঞা খোঁজা।',
    '{"query": "সার্চ কীওয়ার্ড"}', async (a) => {
      const q = (a.query || '').trim();
      if (!q) return 'কী খুঁজতে হবে বলোনি।';
      const parts = [];

      // ১) উইকিপিডিয়া (বাংলা → ইংরেজি)
      try {
        const s = await fetch(`https://bn.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=3&origin=*`)
          .then(r => r.json());
        const hit = s.query && s.query.search && s.query.search[0];
        if (hit) {
          const sum = await fetch(`https://bn.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}?origin=*`).then(r => r.json());
          if (sum && sum.extract) parts.push(`উইকিপিডিয়া (${hit.title}): ${sum.extract}`);
        }
      } catch (e) { /* চুপচাপ */ }

      if (!parts.length) {
        try {
          const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=3&origin=*`).then(r => r.json());
          const hit = s.query && s.query.search && s.query.search[0];
          if (hit) {
            const sum = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}?origin=*`).then(r => r.json());
            if (sum && sum.extract) parts.push(`Wikipedia (${hit.title}): ${sum.extract}`);
          }
        } catch (e) { /* চুপচাপ */ }
      }

      // ২) DuckDuckGo instant answer
      try {
        const d = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=jarvis-bd`)
          .then(r => r.json());
        if (d.AbstractText) parts.push('DuckDuckGo: ' + d.AbstractText);
        if (d.Answer) parts.push('উত্তর: ' + d.Answer);
        if (d.RelatedTopics && d.RelatedTopics.length && !d.AbstractText) {
          const t = d.RelatedTopics.slice(0, 3).map(x => x.Text).filter(Boolean).join(' | ');
          if (t) parts.push('সম্পর্কিত: ' + t);
        }
      } catch (e) { /* চুপচাপ */ }

      if (!parts.length) {
        return `ইন্টারনেট থেকে "${q}" নিয়ে কিছু পাইনি। তুমি নিজের জ্ঞান থেকে উত্তর দাও এবং জানিয়ে দাও যে তথ্যটি নিশ্চিত নয়।`;
      }
      const txt = parts.join('\n').slice(0, 2200);
      return `ওয়েব থেকে পাওয়া তথ্য (${new Date().toLocaleDateString('bn-BD')}):\n${txt}\n\nউপরের তথ্য ব্যবহার করে বাংলায় উত্তর দাও।`;
    });

  /* --- নোট --- */
  def('add_note', 'দরকারি কিছু নোট হিসেবে সেভ করে রাখা।', '{"text": "নোটের বিষয়"}', async (a) => {
    window.STORE.addNote(a.text);
    return `নোট সেভ করা হয়েছে: "${a.text}"`;
  });
  def('list_notes', 'সব নোটের তালিকা দেখা।', '{}', async () => {
    const n = window.STORE.notes;
    if (!n.length) return 'কোনো নোট নেই।';
    return 'নোটসমূহ:\n' + n.slice(0, 20).map((x, i) => `${i + 1}. ${x.text}`).join('\n');
  });

  /* --- টাস্ক --- */
  def('add_task', 'কাজের লিস্টে নতুন টাস্ক যোগ করা।', '{"text": "কাজটা"}', async (a) => {
    window.STORE.addTask(a.text);
    return `টাস্ক যোগ করা হয়েছে: "${a.text}"`;
  });
  def('list_tasks', 'বাকি থাকা কাজের তালিকা।', '{}', async () => {
    const t = window.STORE.tasks;
    if (!t.length) return 'কোনো টাস্ক নেই — লিস্ট খালি।';
    return 'টাস্কসমূহ:\n' + t.slice(0, 20).map((x, i) => `${i + 1}. ${x.text}${x.done ? ' (শেষ)' : ''}`).join('\n');
  });
  def('complete_task', 'কোনো কাজ শেষ হয়ে গেলে টিক দেওয়া।', '{"text": "টাস্কের কিছু অংশ"}', async (a) => {
    const t = window.STORE.tasks.find(x => !x.done && x.text.toLowerCase().includes(String(a.text).toLowerCase()));
    if (!t) return 'এমন কোনো টাস্ক খুঁজে পাইনি।';
    window.STORE.toggleTask(t.id);
    return `"${t.text}" টাস্কটি সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে।`;
  });

  /* --- রিমাইন্ডার --- */
  def('set_reminder', 'নির্দিষ্ট সময়ে মনে করিয়ে দেওয়া (নোটিফিকেশন + গলায় বলা)।',
    '{"text": "কী মনে করাবে", "when": "যেমন: ১০ মিনিট পর / আগামীকাল সকাল ৯টা / 2026-09-10T08:30"}',
    async (a) => {
      const ts = parseWhen(a.when);
      if (!ts) return 'সময়টা বুঝতে পারিনি। ব্যবহারকারীকে জিজ্ঞেস করো: কখন মনে করাবো — যেমন "১০ মিনিট পর" বা "সন্ধ্যা ৭টা"।';
      if (ts - Date.now() > 365 * 24 * 3600 * 1000) return 'এত দীর্ঘ সময় পরের রিমাইন্ডার সমর্থিত নয়।';
      const r = window.STORE.addReminder(a.text, ts);
      if (window.JARVIS && window.JARVIS.armReminder) window.JARVIS.armReminder(r);
      return `রিমাইন্ডার সেট করা হয়েছে: "${a.text}" — ${fmtDate(ts)} ${fmtTime(ts)}-এ।`;
    });
  def('list_reminders', 'সেট করা রিমাইন্ডারগুলো দেখা।', '{}', async () => {
    const r = window.STORE.reminders.filter(x => !x.fired);
    if (!r.length) return 'কোনো রিমাইন্ডার নেই।';
    return 'রিমাইন্ডারসমূহ:\n' + r.map((x, i) => `${i + 1}. ${x.text} — ${fmtDate(x.at)} ${fmtTime(x.at)}`).join('\n');
  });

  /* --- স্মৃতি --- */
  def('remember_fact', 'ব্যবহারকারীর সম্পর্কে কোনো তথ্য স্থায়ীভাবে মনে রাখা (নাম, পছন্দ, ঠিকানা…)।',
    '{"fact": "যেমন: ব্যবহারকারীর শহর বগুড়া"}', async (a) => {
      const ok = window.STORE.remember(a.fact);
      return ok ? `মনে রাখলাম: ${a.fact}` : 'এই তথ্য আগেই মনে রাখা আছে।';
    });

  /* --- ডিভাইস --- */
  def('device_status', 'ফোনের ব্যাটারি, চার্জিং, নেটওয়ার্ক ও ডিভাইস তথ্য।', '{}', async () => {
    const out = [];
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery();
        out.push(`ব্যাটারি ${Math.round(b.level * 100)}%, ${b.charging ? 'চার্জিং চলছে' : 'চার্জিং নয়'}`);
      }
    } catch (e) { /* নেই */ }
    out.push(`নেটওয়ার্ক: ${navigator.onLine ? 'অনলাইন' : 'অফলাইন'}`);
    out.push(`স্ক্রিন: ${screen.width}x${screen.height}`);
    return out.join(' | ');
  });
  def('vibrate', 'ফোন ভাইব্রেট করা (যেমন: টাস্ক শেষ বা সতর্কবার্তা)।', '{"pattern": "short / long / 100,200,100"}', async (a) => {
    let p = a.pattern;
    if (p === 'short' || !p) p = [60];
    else if (p === 'long') p = [400];
    else if (typeof p === 'string') p = toEnNum(p).split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
    if (navigator.vibrate) { navigator.vibrate(p); return 'ভাইব্রেট করা হয়েছে।'; }
    return 'এই ডিভাইসে ভাইব্রেশন সাপোর্ট করে না।';
  });
  def('flashlight', 'ফোনের টর্চ জ্বালা (এখানে স্ক্রিন সাদা করে আলো দেওয়া হয় — ব্রাউজার হার্ডওয়্যার টর্চ খুলতে পারে না)।',
    '{"seconds": 10}', async (a) => {
      const sec = Math.min(Math.max(parseInt(toEnNum(a.seconds || 10), 10) || 10, 2), 120);
      if (window.JARVIS && window.JARVIS.screenLight) window.JARVIS.screenLight(sec);
      return `স্ক্রিন ${sec} সেকেন্ড সাদা করে আলো জ্বালানো হয়েছে। ব্যবহারকারীকে জানাও: ব্রাউজার থেকে সরাসরি ফোনের টর্চ অন করা যায় না — ফোনের নিজস্ব টর্চ বাটন/কুইক সেটিং ব্যবহার করতে হবে।`;
    });
  def('open_url', 'কোনো ওয়েবসাইট বা অ্যাপ লিংক খোলা।', '{"url": "https://…"}', async (a) => {
    let u = a.url;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    window.open(u, '_blank', 'noopener');
    return `${u} খোলা হয়েছে।`;
  });

  /* ---------- প্রম্পটের জন্য বর্ণনা ---------- */
  function describe() {
    return Object.values(REG).map(t =>
      `- ${t.name} : ${t.desc} → ${t.argsDesc}`
    ).join('\n');
  }

  async function run(name, args) {
    const t = REG[name];
    if (!t) return null;
    try {
      return { ok: true, name, out: await t.run(args || {}) };
    } catch (e) {
      return { ok: false, name, out: 'টুল চালাতে সমস্যা: ' + (e.message || e) };
    }
  }

  return { REG, run, describe, parseWhen, calc, bnNum, fmtTime, fmtDate };
})();
