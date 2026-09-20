import { spawnSync } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, readJson } from './collector/core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const label = 'pub.jevatlas.collector';
const domain = `gui/${process.getuid?.()}`;
const target = `${domain}/${label}`;
const plistPath = join(homedir(), 'Library/LaunchAgents', `${label}.plist`);
const command = process.argv[2] || 'status';
const xml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const launchctl = args => spawnSync('/bin/launchctl', args, { encoding: 'utf8' });

async function writeState(enabled, intervalHours) {
  const value = { schemaVersion: 1, enabled, mode: 'local-macos', intervalHours, changedAt: new Date().toISOString() };
  await atomicJson(join(root, '.collector/schedule.json'), value);
}

try {
  if (process.platform !== 'darwin') throw new Error('本机调度命令适用于 macOS。服务器可用 cron 调用 npm run collect。');
  const config = await readJson(join(root, 'collector.config.json'));
  await mkdir(join(root, '.collector'), { recursive: true });
  const current = launchctl(['print', target]);
  if (command === 'install') {
    if (!Number.isFinite(config.intervalHours) || config.intervalHours < 1) throw new Error('intervalHours 必须至少为 1。');
    let existing = '';
    try { existing = await readFile(plistPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing && !existing.includes(xml(join(root, 'scripts/collector/scheduled.mjs')))) {
      throw new Error('同名定时任务属于其他路径；未覆盖。');
    }
    if (current.status === 0) {
      const result = launchctl(['bootout', target]);
      if (result.status !== 0) throw new Error(`无法更新现有任务：${result.stderr.trim()}`);
    }
    await mkdir(dirname(plistPath), { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(root, 'scripts/collector/scheduled.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>RunAtLoad</key><true/>
<key>StartInterval</key><integer>${Math.round(config.intervalHours * 3600)}</integer>
<key>ProcessType</key><string>Background</string>
<key>LowPriorityIO</key><true/>
<key>StandardOutPath</key><string>${xml(join(root, '.collector/launchd.out.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(root, '.collector/launchd.err.log'))}</string>
</dict></plist>
`;
    await writeFile(plistPath, plist, { mode: 0o600 });
    const validation = spawnSync('/usr/bin/plutil', ['-lint', plistPath], { encoding: 'utf8' });
    if (validation.status !== 0) throw new Error(`定时配置校验失败：${validation.stdout}`);
    const enable = launchctl(['enable', target]);
    if (enable.status !== 0) throw new Error(enable.stderr.trim());
    const installed = launchctl(['bootstrap', domain, plistPath]);
    if (installed.status !== 0) {
      await writeState(false, config.intervalHours);
      throw new Error(`launchd 注册失败：${installed.stderr.trim()}`);
    }
    await writeState(true, config.intervalHours);
    console.log(`已启用 ${label}：每 ${config.intervalHours} 小时收录，登录时运行；已立即启动首轮。`);
  } else if (command === 'uninstall') {
    const existing = await readFile(plistPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    if (existing && !existing.includes(xml(join(root, 'scripts/collector/scheduled.mjs')))) throw new Error('同名任务属于其他路径，未修改。');
    if (current.status === 0) {
      const result = launchctl(['bootout', target]);
      if (result.status !== 0) throw new Error(result.stderr.trim());
    }
    await unlink(plistPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await writeState(false, config.intervalHours);
    console.log('已停止定时收录；所有案例、备份和个人收藏均保留。');
  } else if (command === 'run') {
    if (current.status !== 0) throw new Error('定时任务尚未安装。');
    const result = launchctl(['kickstart', target]);
    if (result.status !== 0) throw new Error(result.stderr.trim());
    console.log('已请求执行；如果任务已经在运行，不会重复启动。');
  } else if (command === 'status') {
    const data = await readJson(join(root, 'public/data/source-cases.json'));
    const state = await readJson(join(root, '.collector/schedule.json'), {});
    console.log(JSON.stringify({
      installed: current.status === 0,
      intervalHours: state.intervalHours || config.intervalHours,
      state: current.stdout.match(/^\s*state = (.+)$/m)?.[1] || 'not installed',
      runs: current.stdout.match(/^\s*runs = (.+)$/m)?.[1] || null,
      lastExitCode: current.stdout.match(/^\s*last exit code = (.+)$/m)?.[1] || null,
      lastRunAt: data.collection?.lastRunAt || null,
      outcome: data.collection?.outcome || null,
      sources: data.collection?.sources?.map(({ cursor, ...source }) => source) || [],
    }, null, 2));
  } else throw new Error('支持 install / uninstall / status / run。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
