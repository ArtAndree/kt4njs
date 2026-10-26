const Datastore = require('@seald-io/nedb');
const { randomBytes } = require('node:crypto');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');

const RESERVED = new Set(['create', 'refresh', 'alias', 'remove']);
class LinkStore {
  constructor(db, generateCode = () => randomBytes(6).toString('hex')) {
    this.db = db;
    this.generateCode = generateCode;
    this.pending = Promise.resolve();
  }

  static async open(filename) {
    if (filename) await mkdir(path.dirname(path.resolve(filename)), { recursive: true });
    const db = new Datastore(filename ? { filename } : { inMemoryOnly: true });
    await db.loadDatabaseAsync();
    await db.ensureIndexAsync({ fieldName: 'original', unique: true });
    // Индекс массива запрещает повторение кода у разных документов.
    await db.ensureIndexAsync({ fieldName: 'codes', unique: true });
    return new LinkStore(db);
  }

  // Один процесс: весь цикл «прочитать → изменить» выполняется по очереди.
  // Ошибка одной операции не останавливает следующие запросы.
  mutate(action, original, target) {
    const operation = this.pending.then(() => this.apply(action, original, target));
    this.pending = operation.catch(() => {});
    return operation;
  }

  async freshCode(excluded = []) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = this.generateCode();
      if (!/^[a-zA-Z0-9_-]{6,32}$/.test(code) || RESERVED.has(code) || excluded.includes(code)) continue;
      if (!await this.db.findOneAsync({ codes: code })) return code;
    }
    throw new Error('Не удалось подобрать свободный короткий код');
  }

  async apply(action, original, target) {
    const existing = await this.db.findOneAsync({ original });
    if (action === 'remove') {
      if (!existing) return { result: null };
      await this.db.removeAsync({ original }, { multi: true });
      return { result: true };
    }
    if (action === 'create' && existing) return { result: null, code: existing.codes[0] };
    if (action === 'refresh' && !existing) return { result: null };

    const code = await this.freshCode(existing?.codes);
    if (!existing) {
      await this.db.insertAsync({ original, target, codes: [code] });
    } else {
      const codes = action === 'refresh'
        ? [code, ...existing.codes.slice(1)]
        : [...existing.codes, code];
      await this.db.updateAsync({ _id: existing._id }, { $set: { codes } });
    }
    return { result: true, code, created: !existing };
  }

  async resolve(code) {
    const document = await this.db.findOneAsync({ codes: code });
    return document?.target || null;
  }
}
module.exports = { LinkStore };
