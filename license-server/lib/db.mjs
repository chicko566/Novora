import { createMemoryStore } from './store/memory.mjs';
import { readMigrationFiles, splitSql } from './sql.mjs';

export { readMigrationFiles, splitSql };

export async function openStore(cfg) {
  if (cfg.db.driver === 'memory') {
    const store = createMemoryStore();
    await store.init();
    return { store, close: () => store.close() };
  }
  const { createMysqlStore } = await import('./store/mysql.mjs');
  const { store, migrate } = await createMysqlStore(cfg);
  await migrate();
  return { store, close: () => store.close() };
}
