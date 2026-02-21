const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');
const desktopDir = path.join(rootDir, 'desktop-app');
const frontendDist = path.join(frontendDir, 'dist');
const backendStatic = path.join(backendDir, 'static');
const backendDist = path.join(backendDir, 'dist');
const backendBuild = path.join(backendDir, 'build');
const backendExeDir = path.join(backendDist, 'openreq-backend');
const resourcesBackend = path.join(desktopDir, 'resources', 'backend');

const isWin = process.platform === 'win32';

function resolveCmd(cmd) {
  if (!isWin) return cmd;
  if (cmd === 'npm') return 'npm.cmd';
  if (cmd === 'npx') return 'npx.cmd';
  return cmd;
}

function run(cmd, args, opts) {
  const resolved = resolveCmd(cmd);
  const result = spawnSync(resolved, args, { stdio: 'inherit', shell: isWin, ...opts });
  if (result.error) {
    console.error(`Command failed: ${resolved}`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

console.log('==> Building frontend (standalone mode)...');
run('node', [path.join('scripts', 'gen-installer-assets.js')], { cwd: desktopDir });
run('npm', ['run', 'build'], {
  cwd: frontendDir,
  env: {
    ...process.env,
    VITE_STANDALONE: 'true',
    VITE_API_URL: '',
  },
});

if (!fs.existsSync(frontendDist)) {
  console.error('Frontend build failed: dist folder not found.');
  process.exit(1);
}

console.log('==> Syncing frontend dist to backend/static...');
copyDir(frontendDist, backendStatic);

console.log('==> Building backend executable (PyInstaller)...');
const pyCheck = spawnSync(resolveCmd('python'), ['-m', 'PyInstaller', '--version'], { stdio: 'ignore', shell: isWin });
if (pyCheck.status !== 0) {
  console.error('PyInstaller is missing. Install it with: python -m pip install pyinstaller');
  process.exit(1);
}
const addData = `${backendStatic}${path.delimiter}app/static`;
run('python', [
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
  '--name', 'openreq-backend',
  '--distpath', backendDist,
  '--workpath', backendBuild,
  '--specpath', backendBuild,
  '--add-data', addData,
  path.join(backendDir, 'standalone_server.py'),
], { cwd: rootDir });

if (!fs.existsSync(backendExeDir)) {
  console.error('Backend build failed: output folder not found.');
  process.exit(1);
}

console.log('==> Copying backend into desktop resources...');
ensureDir(resourcesBackend);
copyDir(backendExeDir, resourcesBackend);

console.log('==> Building Electron standalone installer...');
run('npx', ['electron-builder', '--config', 'electron-builder.standalone.yml', '--win'], {
  cwd: desktopDir,
});

console.log('==> Standalone build complete.');
