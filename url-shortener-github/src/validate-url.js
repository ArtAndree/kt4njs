const { isIP } = require('node:net');

// Проверяем структуру адреса. Доступность сайта и DNS не проверяются.
function validateUrl(value) {
  if (typeof value !== 'string') return null;
  const original = value.trim();
  if (!original || original.length > 8192 || /[\s\\\u0000-\u001f\u007f]/u.test(original)) return null;
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(original);
  if (hasScheme && !/^https?:\/\//i.test(original)) return null;
  if (original.startsWith('//')) return null;
  const target = hasScheme ? original : 'https://' + original;
  const authority = target.split('://')[1].split(/[/?#]/)[0];
  // Запрещаем user:password@host и сокращённую запись числовых IP (12345).
  const hostMatch = authority.match(/^\[([^\]]+)\](?::\d+)?$|^([^:@]+)(?::\d+)?$/);
  if (!hostMatch) return null;
  const rawHost = hostMatch[1] || hostMatch[2];
  try {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    if (!isIP(rawHost)) {
      const hostname = parsed.hostname;
      const labels = hostname.split('.');
      if (hostname.length > 253 || labels.length < 2) return null;
      if (!labels.every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) return null;
      if (!/^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i.test(labels.at(-1))) return null;
    }
    return { original, target: parsed.href };
  } catch {
    return null;
  }
}
module.exports = { validateUrl };
