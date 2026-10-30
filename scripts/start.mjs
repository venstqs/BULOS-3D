// One command to run Bulos 3D: data server + optimized website.
//   npm start
// Starts the FastAPI backend on :8000, builds the site (small, minified bundles
// instead of the ~50 MB unbundled dev modules) and serves it on :5173.
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const isWin = process.platform === 'win32';
const python = process.env.PYTHON ?? (isWin ? 'python' : 'python3');
const children = [];

function run(cmd, args, name) {
  // one command string (no separate args) so Windows shells don't warn about unescaped arguments
  const p = spawn([cmd, ...args].join(' '), { stdio: ['ignore', 'pipe', 'pipe'], shell: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const tag = `[${name}]`;
  const out = (d) => String(d).split(/\r?\n/).filter((l) => l && !l.includes('" 200 OK')).forEach((l) => console.log(tag, l));
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', (code) => { console.log(tag, `stopped (code ${code})`); shutdown(code ?? 0); });
  children.push(p);
  return p;
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (isWin) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function waitFor(url, label, seconds = 60) {
  for (let i = 0; i < seconds * 2; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  console.error(`${label} did not start within ${seconds} s. See the messages above.`);
  return false;
}

console.log('Starting the Bulos 3D data server…');
run(python, ['-m', 'uvicorn', 'backend.main:app', '--port', '8000', '--host', '127.0.0.1'], 'data server');

console.log('Building the website (about 10–30 s)…');
const build = spawnSync('npm run build', { stdio: 'inherit', shell: true });
if (build.status !== 0) { console.error('Website build failed.'); shutdown(1); }

if (!(await waitFor('http://127.0.0.1:8000/api/health', 'The data server'))) shutdown(1);
run('npx', ['vite', 'preview', '--port', '5173', '--strictPort'], 'website');
if (await waitFor('http://127.0.0.1:5173/', 'The website', 30)) {
  console.log('\n  Bulos 3D is running:  http://127.0.0.1:5173\n  Press Ctrl+C to stop.\n');
}
