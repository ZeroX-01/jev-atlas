import { loadEnvFile } from 'node:process';
import { stat, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
try { loadEnvFile(`${root}.env.collector`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const name of ['launchd.out.log', 'launchd.err.log']) {
  const path = `${root}.collector/${name}`;
  try {
    if ((await stat(path)).size > 2 * 1024 * 1024) {
      await unlink(`${path}.1`).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await rename(path, `${path}.1`);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await import('../collect.mjs');
