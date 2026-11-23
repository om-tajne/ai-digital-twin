#!/usr/bin/env node
/**
 * One-command launcher for Windows, macOS and Linux:   npm start
 *
 *  1. creates .env from .env.example if missing
 *  2. installs Node / Python dependencies if missing
 *  3. starts PostgreSQL (pgvector) + Redis with Docker and waits until healthy
 *  4. runs Node API, FastAPI, Celery worker and the React app together
 *
 * Set SKIP_DOCKER=1 to use your own Postgres/Redis (see DATABASE_URL / REDIS_URL in .env).
 */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const log = (m) => console.log(`\n▶ ${m}`);
const fail = (m) => { console.error(`\n❌ ${m}\n`); process.exit(1); };

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin, ...opts });
}
function quiet(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, stdio: 'ignore', shell: isWin });
}

// 1. .env ----------------------------------------------------------------
const envFile = path.join(root, '.env');
if (!fs.existsSync(envFile)) {
  fs.copyFileSync(path.join(root, '.env.example'), envFile);
  log('Created .env from .env.example');
}
const envText = fs.readFileSync(envFile, 'utf8');
if (/^GEMINI_API_KEY=(your_gemini_api_key_here)?\s*$/m.test(envText)) {
  console.warn('\n⚠️  GEMINI_API_KEY is not set in .env - quiz generation and viva need it.\n   Get a key at https://aistudio.google.com/apikey and restart.\n');
}

// 2. Dependencies ----------------------------------------------------------
for (const dir of ['node-backend', 'frontend']) {
  if (!fs.existsSync(path.join(root, dir, 'node_modules'))) {
    log(`Installing ${dir} dependencies...`);
    if (run('npm', ['--prefix', dir, 'install']).status !== 0) fail(`npm install failed in ${dir}`);
  }
}
const python = ['python3', 'python', 'py'].find((p) => quiet(p, ['--version']).status === 0);
if (!python) fail('Python 3.10+ was not found. Install it from https://www.python.org/downloads/');
if (quiet(python, ['-c', 'import fastapi, celery, sqlalchemy, pgvector, pdfplumber']).status !== 0) {
  log('Installing Python dependencies (first run only, takes a few minutes)...');
  const req = path.join('fastapi-backend', 'requirements.txt');
  if (run(python, ['-m', 'pip', 'install', '-r', req]).status !== 0) {
    fail('pip install failed. Try creating a virtualenv:  python -m venv venv  then activate it and run npm start again.');
  }
}

// 3. Database + Redis ----------------------------------------------------------
if (process.env.SKIP_DOCKER === '1') {
  log('SKIP_DOCKER=1 - using the Postgres/Redis from your .env');
} else {
  if (quiet('docker', ['--version']).status !== 0) {
    fail('Docker was not found. Install Docker Desktop, or run your own Postgres (pgvector) + Redis and start with SKIP_DOCKER=1.');
  }
  log('Starting PostgreSQL (:5434) and Redis (:6379)...');
  const up = run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis']);
  if (up.status !== 0) fail('Could not start the database containers. Is Docker Desktop running?');
}

// 4. Services ---------------------------------------------------------------------
log('Starting Node API (:5000), FastAPI (:8000), Celery worker and Frontend (:5173)...');
console.log('   Open http://localhost:5173 when the FRONTEND line says "ready".\n');
const q = (s) => `"${s}"`;
const services = [
  'npm --prefix node-backend run dev',
  `cd fastapi-backend && ${python} -m uvicorn app.main:app --port 8000 --reload`,
  `cd fastapi-backend && ${python} -m celery -A worker.celery_app worker --loglevel=info --pool=solo`,
  'npm --prefix frontend run dev',
];
const child = spawn(
  'npx',
  ['--yes', 'concurrently', '--kill-others', '--names', 'NODE,FASTAPI,CELERY,FRONTEND',
   '--prefix-colors', 'blue,green,yellow,magenta', ...services.map(q)],
  { cwd: root, stdio: 'inherit', shell: isWin }
);
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
