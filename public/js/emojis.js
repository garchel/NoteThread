// Lazy-load do catálogo de emojis (~5.5KB): carregado via dynamic import
// apenas quando o seletor de emojis é aberto pela primeira vez.
let _cache = null;

export async function getEmojiCats() {
  if (_cache) return _cache;
  const mod = await import('./emojis-data.js');
  _cache = mod.EMOJI_CATS;
  return _cache;
}

export function getCachedEmojiCats() {
  return _cache; // null até o primeiro load
}
