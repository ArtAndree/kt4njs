const express = require('express');
const { validateUrl } = require('./validate-url');

function createApp({ store, baseUrl, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('BASE_URL должен быть HTTP(S)-адресом сервиса без пути и параметров');
  }
  const publicUrl = base.origin;
  // GET изменяет данные по условию задания: ответы нельзя кешировать.
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const fields = { create: 'created', refresh: 'refresh', alias: 'alias', remove: 'deleted' };
  for (const [action, field] of Object.entries(fields)) {
    app.get('/' + action, async (req, res) => {
      const raw = req.query.url;
      const original = typeof raw === 'string' ? raw.trim() : null;
      const validated = validateUrl(raw);
      if (!validated) return res.status(400).json({ original, [field]: false });
      try {
        const outcome = await store.mutate(action, validated.original, validated.target);
        // /alias для отсутствующего URL полностью повторяет /create.
        const responseField = action === 'alias' && outcome.created ? 'created' : field;
        const body = { original: validated.original };
        if (outcome.code) body.short = publicUrl + '/' + outcome.code;
        body[responseField] = outcome.result;
        return res.json(body);
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ original, [field]: false });
      }
    });
  }

  app.get('/', (req, res) => res.json({
    service: 'URL Shortener',
    endpoints: ['/create?url=', '/refresh?url=', '/alias?url=', '/remove?url=', '/:code']
  }));

  app.get('/:code', async (req, res) => {
    if (!/^[a-zA-Z0-9_-]{6,32}$/.test(req.params.code)) {
      return res.status(404).json({ error: 'Короткая ссылка не найдена' });
    }
    const target = await store.resolve(req.params.code);
    if (!target) return res.status(404).json({ error: 'Короткая ссылка не найдена' });
    return res.redirect(302, target);
  });

  app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));
  app.use((error, req, res, next) => {
    logger.error(error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });
  return app;
}
module.exports = { createApp };
