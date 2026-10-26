const path = require('node:path');
const { LinkStore } = require('./store');
const { createApp } = require('./app');

async function main() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный PORT');
  const baseUrl = process.env.BASE_URL || 'http://localhost:' + port;
  const filename = path.resolve(process.env.DB_FILE || path.join(__dirname, '../data/links.db'));
  const store = await LinkStore.open(filename);
  const app = createApp({ store, baseUrl });
  const server = app.listen(port, () => console.log('Сервис запущен: ' + baseUrl));
  server.on('error', error => {
    console.error('Не удалось запустить сервер:', error.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(error => {
      if (error) console.error(error);
      process.exitCode = error ? 1 : 0;
    }));
  }
}
main().catch(error => {
  console.error('Ошибка запуска:', error.message);
  process.exitCode = 1;
});
