/* ============================================================
   config.js — প্রোভাইডার, মডেল ও ব্যক্তিত্বের সেটিং
   ============================================================ */
window.CFG = (function () {

  const PROVIDERS = {
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      keyUrl: 'https://aistudio.google.com/apikey',
      isGemini: true,
      help: `Google AI Studio-এ ঢুকে <b>Create API key</b> চাপো → key কপি করো। সম্পূর্ণ বিনামূল্যে।`,
      models: [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-flash-latest',
        'gemini-flash-lite-latest'
      ],
      freeModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest']
    },
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter',
      endpoint: 'https://openrouter.ai/api/v1',
      keyUrl: 'https://openrouter.ai/keys',
      help: `openrouter.ai-তে সাইন ইন → <b>Keys</b> → Create Key। এরপর ⟳ চেপে <b>ফ্রি মডেল</b> লিস্ট লোড করো — DeepSeek, Qwen, Llama, Kimi সব ফ্রি।`,
      models: [
        'deepseek/deepseek-r1:free',
        'deepseek/deepseek-chat-v3-0324:free',
        'qwen/qwen3-235b-a22b:free',
        'qwen/qwen3-30b-a3b:free',
        'moonshotai/kimi-k2:free',
        'google/gemma-3-27b-it:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'mistralai/mistral-nemo:free',
        'nvidia/nemotron-nano-9b-v2:free'
      ],
      freeModels: null /* লাইভ API থেকে লোড হবে */
    },
    groq: {
      id: 'groq',
      name: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1',
      keyUrl: 'https://console.groq.com/keys',
      help: `console.groq.com-এ ঢুকে <b>Create API Key</b>। ফ্রি tier-এও খুব দ্রুত।`,
      models: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3-32b',
        'moonshotai/kimi-k2-instruct'
      ],
      freeModels: null
    },
    custom: {
      id: 'custom',
      name: 'Custom / OpenAI-compatible',
      endpoint: '',
      keyUrl: '',
      help: `যেকোনো OpenAI-compatible সার্ভার। যেমন লোকাল Ollama: <code>http://localhost:11434/v1</code> আর model <code>llama3.2</code>`,
      models: ['llama3.2', 'gpt-4o-mini'],
      freeModels: null
    }
  };

  const PERSONAS = {
    jarvis: `তুমি JARVIS — একজন অত্যন্ত বুদ্ধিমান, ভদ্র ও নির্ভরযোগ্য ব্যক্তিগত AI সহকারী, ঠিক যেমনটা আয়রন ম্যানের সিনেমায় দেখা যায়।
কথা বলার ধরন: সংক্ষিপ্ত, পরিষ্কার, আত্মবিশ্বাসী, কখনো বাড়াবাড়ি না। প্রয়োজনে এক লাইনে জবাব দাও। ব্যবহারকারীকে "স্যার" (অথবা সেট করা নাম) বলে সম্বোধন করো। মাঝে মাঝে হালকা মার্জিত রসিকতা চলবে, কিন্তু কাজের ক্ষতি করবে না।`,
    friend: `তুমি ব্যবহারকারীর ঘনিষ্ঠ বন্ধু — আড্ডাবাজ, ফুরফুরে, মজার। বাংলায় খুব প্রাকৃতিক, চলতি ভাষায় কথা বলো। দরকারে সিরিয়াস হতে পারো, কিন্তু ভারী হবে না। "ভাই", "রে", "শোন" — এমন সম্বোধন চলবে।`,
    teacher: `তুমি একজন ধৈর্যশীল শিক্ষক। বিষয়টা ধাপে ধাপে, সহজ উদাহরণ দিয়ে বুঝিয়ে বলো। কোনো জিনিস শিখতে চাইলে উদাহরণ ও অনুশীলন দাও। তবুও খুব বড় লেকচার এড়িয়ে চলো — মুখে বলে শোনানো হচ্ছে মনে রেখো।`
  };

  const BASE_RULES = `
# ভাষা
- তুমি সবসময় **বাংলায়** কথা বলবে। প্রযুক্তিগত শব্দ (Wi-Fi, app, API, battery) ইংরেজিতেই রাখতে পারো, বাকি সব বাংলায়।
- বাংলা বর্ণমালায় লিখবে। কোনোmarkdown নয়: কোনো তারকাচিহ্ন (*), বোল্ড (**), হেডিং (#), বুলেট (-), টেবিল বা লিংক ব্যবহার করবে না — কারণ তোমার উত্তর কণ্ঠস্বরে পড়ে শোনানো হবে। সংখ্যা/তালিকা দরকার হলে "প্রথমে…, দ্বিতীয়ত…" বলবে।
- ছোট বাক্য ব্যবহার করো। এমনভাবে লিখো যেন পড়লে শুনতে প্রাকৃতিক লাগে (যেমন "৩০ ডিগ্রি" না লিখে "ত্রিশ ডিগ্রি")।

# পরিবেশ
- ব্যবহারকারীর নাম: {USER_NAME}
- আজকের তারিখ ও সময় (এশিয়া/ঢাকা): {NOW}
- ব্যবহারকারীর ডিভাইস: মোবাইল ব্রাউজার।

# টুল ব্যবহার (খুব জরুরি)
তোমার কাছে টুল আছে। সরাসরি উত্তর দেওয়ার আগে ভাবো: এই প্রশ্নের উত্তর কি টুল ছাড়া সম্ভব?
- সময়/তারিখ, হিসাব, আবহাওয়া, কারেন্ট ঘটনা/দাম/খবর/সংস্করণ — এসব **অনুমান করবে না**, টুল চালাবে।
- টুল চালাতে হলে **পুরো উত্তরের জায়গায় শুধু একটা JSON** দেবে, অন্য কিছু নয়:
{"tool": "টুলের_নাম", "args": { … }}
- টুলের ফলাফল পাওয়ার পর সেটা ব্যবহার করে সাধারণ বাংলায় চূড়ান্ত উত্তর দেবে।
- একবারে একটাই টুল। প্রয়োজনে ধাপে ধাপে চালাও। কখনো JSON-এর সাথে কথা মেশাবে না।

# অন্যান্য
- তুমি কোনো মডেল বা প্রোগ্রাম নও — এসব প্রশ্নের উত্তরে নিজেকে JARVIS/সহকারী হিসেবেই পরিচয় দাও।
- কথা না বুঝলে সুন্দর করে জিজ্ঞেস করো, অনুমান করে উত্তর দিও না।`;

  const SHORT_RULE = `\n- উত্তর যতটা পারো ছোট করো — সাধারণত ১-৩ বাক্য। ভয়েসে শোনানো হয়, তাই অযথা লম্বা করো না।`;

  function buildSystemPrompt() {
    const s = window.STORE.settings;
    let p = (PERSONAS[s.persona] || PERSONAS.jarvis) + '\n' + BASE_RULES;
    p = p.replace('{USER_NAME}', (s.userName || 'স্যার'))
         .replace('{NOW}', new Intl.DateTimeFormat('bn-BD', {
           dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Dhaka'
         }).format(new Date()));
    if (s.shortReply) p += SHORT_RULE;
    return p;
  }

  return { PROVIDERS, PERSONAS, BASE_RULES, buildSystemPrompt };
})();
