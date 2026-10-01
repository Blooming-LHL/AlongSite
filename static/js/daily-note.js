const CACHE_KEY = 'along-daily-note-v1';
const API_URL = 'https://v1.hitokoto.cn/?c=d&c=e&c=i&c=k&encode=json&max_length=55';
const FALLBACK = '把好奇留给今天，让灵感自然发生。';

export function localDayKey(date = new Date()) {
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  return parts.map((part, index) => index ? String(part).padStart(2, '0') : String(part)).join('-');
}

export function normalizeQuote(data) {
  if (!data || typeof data.hitokoto !== 'string') return null;
  const quote = data.hitokoto.trim();
  if (!quote || quote.length > 100) return null;
  const source = typeof data.from === 'string' ? data.from.trim().slice(0, 60) : '';
  const uuid = typeof data.uuid === 'string' && /^[\da-f-]{36}$/i.test(data.uuid) ? data.uuid : '';
  return { quote, source, uuid };
}

function renderQuote(data) {
  document.querySelector('#daily-note-quote').textContent = data.quote;
  const source = document.querySelector('#daily-note-source');
  source.textContent = data.source ? `—— ${data.source} · 一言 ↗` : '—— 一言 ↗';
  source.href = data.uuid ? `https://hitokoto.cn/?uuid=${data.uuid}` : 'https://hitokoto.cn/';
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
}

export async function startDailyNote() {
  const date = new Date();
  const day = localDayKey(date);
  const dateNode = document.querySelector('#daily-note-date');
  dateNode.dateTime = day;
  dateNode.textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(date);

  let cached;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { /* Storage may be disabled. */ }
  if (cached?.day === day) {
    const valid = normalizeQuote({ hitokoto: cached.quote, from: cached.source, uuid: cached.uuid });
    if (valid) { renderQuote(valid); return; }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(API_URL, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Daily note unavailable');
    const quote = normalizeQuote(await response.json());
    if (!quote) throw new Error('Invalid daily note');
    renderQuote(quote);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ day, ...quote })); } catch { /* Keep the live quote. */ }
  } catch {
    // The static quote remains visible when the public API or network is unavailable.
    document.querySelector('#daily-note-quote').textContent = FALLBACK;
    const source = document.querySelector('#daily-note-source');
    source.textContent = 'ALong 的一句话 ↗';
    source.href = source.dataset.fallbackHref;
    source.removeAttribute('target');
    source.removeAttribute('rel');
  } finally {
    clearTimeout(timeout);
  }
}

if (typeof document !== 'undefined' && document.querySelector('#daily-note-quote')) startDailyNote();
