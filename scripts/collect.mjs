import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readJson, safeError } from './collector/core.mjs';
import { runCollector } from './collector/run.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const value = (key) => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);

if (args.includes('--help')) {
  console.log('npm run collect -- [--sources=qmuse,github,dev,hackernews] [--dry-run] [--bundle=/path/to/public-bundle.js]');
} else {
  try {
    const config = await readJson(`${root}collector.config.json`);
    if (config.schemaVersion !== 1 || !Array.isArray(config.sources) || !Number.isFinite(config.intervalHours) || config.intervalHours < 1) {
      throw new Error('采集配置格式错误。');
    }
    const selectedSources = value('sources')?.split(',') || (value('bundle') ? ['qmuse'] : undefined);
    if (selectedSources?.some(id => !config.sources.some(source => source.id === id))) throw new Error('指定了未知的采集来源。');
    const summary = await runCollector({
      root, config, selectedSources,
      bundle: value('bundle') ? await readFile(value('bundle'), 'utf8') : undefined,
      dryRun: args.includes('--dry-run'),
      onProgress: message => console.log(`[${new Date().toISOString()}] ${message}`),
    });
    console.log(JSON.stringify({ outcome: summary.outcome, added: summary.added, updated: summary.updated, removed: summary.removed, total: summary.total, dryRun: args.includes('--dry-run') }));
    if (summary.outcome === 'error') process.exitCode = 1;
  } catch (error) {
    console.error(safeError(error));
    process.exitCode = error.code === 'COLLECTOR_BUSY' ? 0 : 1;
  }
}
