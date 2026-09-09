/* ============================================================
   ai.js — এক API-ইন্টারফেস, অনেক প্রোভাইডার (Gemini / OpenRouter / Groq / Custom)
   ============================================================ */
window.AI = (function () {
  const S = () => window.STORE.settings;

  /* ---------- JSON টুল-কল খোঁজা ---------- */

  // প্রথম "{" থেকে শুরু করে ব্রেস ব্যালেন্স করে পুরো JSON অবজেক্টটা কেটে নেয়
  function firstJsonObject(t) {
    const start = t.indexOf('{');
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < t.length; i++) {
      const ch = t[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return t.slice(start, i + 1);
      }
    }
    return null; // অসম্পূর্ণ
  }

  function extractToolCall(text) {
    if (!text) return null;
    const t = String(text).trim();

    // ১) ```json … ``` বা ``` … ``` ফেন্স
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates = [];
    if (fence) candidates.push(fence[1].trim());
    const obj = firstJsonObject(t);
    if (obj) candidates.push(obj);
    candidates.push(t);

    for (const c of candidates) {
      let s = c.trim();
      if (!s.startsWith('{')) continue;
      try {
        const o = JSON.parse(s);
        if (o && typeof o.tool === 'string' && o.tool.length < 40) {
          return { tool: o.tool.trim(), args: (o.args && typeof o.args === 'object') ? o.args : {} };
        }
      } catch (e) { /* পরের চেষ্টা */ }
    }

    // ২) মডেল কখনো "tool": "name" আলাদা করে লিখে দেয় — সেটাও ধরি
    const loose = t.match(/"tool"\s*:\s*"([a-z_]{2,30})"/i);
    if (loose && /"args"/.test(t)) {
      const am = t.match(/"args"\s*:\s*(\{[\s\S]*?\})\s*\}?\s*$/i);
      let args = {};
      if (am) { try { args = JSON.parse(am[1]); } catch (e) {} }
      return { tool: loose[1], args };
    }
    return null;
  }

  function cleanReply(text) {
    return String(text || '')
      .replace(/```(?:json)?[\s\S]*?```/gi, '')
      .replace(/[*#`_>]/g, '')
      .replace(/^\s*[-•]\s*/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /* ---------- প্রোভাইডার কল ---------- */
  async function callGemini(messages, systemPrompt) {
    const s = S();
    const key = s.apiKey.trim();
    if (!key) throw new Error('NO_KEY');
    const model = (s.model || 'gemini-2.5-flash').replace(/^models\//, '');
    const url = `${window.CFG.PROVIDERS.gemini.endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    const contents = messages
      .filter(m => m.role !== 'system')
      .slice(-30)
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }))
      .filter(m => m.parts[0].text && m.parts[0].text.trim());

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 900 }
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
    const cand = j.candidates && j.candidates[0];
    const txt = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
    if (!txt) throw new Error(cand?.finishReason === 'SAFETY' ? 'নিরাপত্তা ফিল্টারে আটকেছে।' : 'মডেল কোনো উত্তর দেয়নি।');
    return txt;
  }

  async function callOpenAICompat(messages, systemPrompt) {
    const s = S();
    const key = s.apiKey.trim();
    if (!key) throw new Error('NO_KEY');
    const p = window.CFG.PROVIDERS[s.provider] || window.CFG.PROVIDERS.openrouter;
    const endpoint = (s.provider === 'custom' ? (s.customEndpoint || '').trim() : p.endpoint).replace(/\/+$/, '');
    if (!endpoint) throw new Error('Custom endpoint সেট করা নেই।');

    let model = (s.model || '').trim();
    if (s.provider === 'openrouter' && s.online && model && !model.endsWith(':online')) model += ':online';

    const msgs = [{ role: 'system', content: systemPrompt }]
      .concat(messages.filter(m => m.role !== 'system').slice(-30).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.text
      })));

    const r = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'HTTP-Referer': location.origin,
        'X-Title': 'JARVIS BD'
      },
      body: JSON.stringify({ model, messages: msgs, temperature: 0.7, max_tokens: 900 })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || j.message || `HTTP ${r.status}`);
    const txt = j.choices?.[0]?.message?.content;
    if (!txt) throw new Error('মডেল কোনো উত্তর দেয়নি।');
    return txt;
  }

  function call(messages, systemPrompt) {
    return S().provider === 'gemini' ? callGemini(messages, systemPrompt) : callOpenAICompat(messages, systemPrompt);
  }

  /* ---------- টুল লুপসহ মূল চ্যাট ---------- */
  async function chat(userText, opts) {
    opts = opts || {};
    const onStatus = opts.onStatus || function () {};
    const s = S();
    const systemPrompt = window.CFG.buildSystemPrompt() +
      '\n\n# তোমার টুলসমূহ\n' + window.TOOLS.describe() +
      (window.STORE.memory.length ? '\n\n# ব্যবহারকারী সম্পর্কে মনে রাখা তথ্য\n' + window.STORE.memoryText() : '');

    const history = window.STORE.chat
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map(m => ({ role: m.role, text: m.text }));

    const messages = history.concat([{ role: 'user', text: userText }]);
    let reply = '';
    const usedTools = [];

    for (let step = 0; step < 4; step++) {
      const raw = await call(messages, systemPrompt);
      const call1 = extractToolCall(raw);

      if (call1 && window.TOOLS.REG[call1.tool]) {
        usedTools.push(call1.tool);
        onStatus('টুল চালাচ্ছি: ' + call1.tool);
        const res = await window.TOOLS.run(call1.tool, call1.args);
        messages.push({ role: 'assistant', text: raw.trim() });
        messages.push({
          role: 'user',
          text: `[সিস্টেম] "${call1.tool}" টুলের ফলাফল:\n${res.out}\n\nএখন সাধারণ বাংলায়, ছোট করে ব্যবহারকারীকে উত্তর দাও। আর কোনো JSON দিও না।`
        });
        continue;
      }
      reply = cleanReply(raw);
      break;
    }
    if (!reply) reply = 'দুঃখিত স্যার, কোনো উত্তর তৈরি করতে পারিনি।';
    return { text: reply, tools: usedTools };
  }

  /* ---------- key টেস্ট ---------- */
  async function testKey() {
    const s = S();
    if (!s.apiKey.trim()) return { ok: false, msg: 'আগে API key বসাও।' };
    try {
      const t = await call([{ role: 'user', text: 'শুধু "ঠিক আছে" লিখো।' }], 'তুমি নীরব সহকারী।');
      return { ok: true, msg: '✅ কানেকশন সফল! মডেল বলছে: ' + cleanReply(t).slice(0, 60) };
    } catch (e) {
      let msg = e.message || String(e);
      if (msg === 'NO_KEY') msg = 'API key নেই।';
      if (/401|403|invalid|API key/i.test(msg)) msg = '❌ key গ্রহণযোগ্য নয়। key ঠিক করে কপি করেছো কি? (' + msg + ')';
      if (/quota|429|rate/i.test(msg)) msg = '⚠️ ফ্রি লিমিট শেষ। কিছুক্ষণ পর চেষ্টা করো। (' + msg + ')';
      if (/Failed to fetch|NetworkError|TypeError/i.test(msg)) msg = '⚠️ নেটওয়ার্ক সমস্যা — ইন্টারনেট চেক করো।';
      return { ok: false, msg };
    }
  }

  /* ---------- মডেল লিস্ট ---------- */
  async function fetchModels() {
    const s = S();
    const key = s.apiKey.trim();
    try {
      if (s.provider === 'gemini') {
        if (!key) return window.CFG.PROVIDERS.gemini.models;
        const j = await fetch(`${window.CFG.PROVIDERS.gemini.endpoint}/models?key=${encodeURIComponent(key)}`).then(r => r.json());
        if (!j.models) return window.CFG.PROVIDERS.gemini.models;
        return j.models
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && m.name.includes('gemini'))
          .map(m => m.name.replace('models/', ''))
          .sort();
      }
      if (!key) return window.CFG.PROVIDERS[s.provider].models;
      const p = window.CFG.PROVIDERS[s.provider];
      const endpoint = (s.provider === 'custom' ? (s.customEndpoint || '').trim() : p.endpoint).replace(/\/+$/, '');
      if (!endpoint) return p.models;
      const j = await fetch(`${endpoint}/models`, { headers: { Authorization: 'Bearer ' + key } }).then(r => r.json());
      const list = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
      if (!list.length) return p.models;
      if (s.onlyFree) {
        const free = (j.data || []).filter(m => {
          const pr = m.pricing || {};
          const prompt = parseFloat(pr.prompt || '1');
          return prompt === 0 || /:free$/i.test(m.id || '');
        }).map(m => m.id);
        return free.length ? free.sort() : list.sort();
      }
      return list.sort();
    } catch (e) {
      return window.CFG.PROVIDERS[s.provider].models;
    }
  }

  return { chat, testKey, fetchModels, extractToolCall, cleanReply };
})();
