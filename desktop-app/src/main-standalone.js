const { app, BrowserWindow, ipcMain, net, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const STANDALONE_PORT = String(process.env.OPENREQ_PORT || '4010');
const STANDALONE_HOST = String(process.env.OPENREQ_HOST || '127.0.0.1');
const HEALTH_URL = `http://${STANDALONE_HOST}:${STANDALONE_PORT}/health`;

let mainWindow;
let tray;
let trayReady = false;
let backendProcess = null;

function getAppIcon() {
  const iconPath =
    process.platform === 'win32'
      ? path.join(__dirname, '..', 'assets', 'icon.ico')
      : path.join(__dirname, '..', 'assets', 'icon.png');
  const img = nativeImage.createFromPath(iconPath);
  return img.isEmpty() ? iconPath : img;
}

function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function ensureTray() {
  if (trayReady) return;
  trayReady = true;

  const icon = getAppIcon();
  tray = new Tray(icon);
  tray.setToolTip('OpenReq Standalone');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'OpenReq megnyitasa',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Elrejtes / Megjelenites',
      click: () => toggleWindowVisibility(),
    },
    { type: 'separator' },
    {
      label: 'Kilepes',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => toggleWindowVisibility());
}


function getBackendBinaryPath() {
  const exeName = process.platform === 'win32' ? 'openreq-backend.exe' : 'openreq-backend';
  const packaged = path.join(process.resourcesPath, 'backend', exeName);
  if (fs.existsSync(packaged)) return packaged;

  const devPath = path.join(__dirname, '..', '..', 'backend', 'dist', 'openreq-backend', exeName);
  if (fs.existsSync(devPath)) return devPath;

  return null;
}

function startBackend() {
  const userDataDir = app.getPath('userData');
  const dataDir = path.join(userDataDir, 'data');
  const dbPath = path.join(dataDir, 'openreq.db');
  const logsDir = path.join(userDataDir, 'logs');
  const logFile = path.join(logsDir, 'backend.log');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch {
    // ignore
  }
  const env = {
    ...process.env,
    OPENREQ_STANDALONE: '1',
    OPENREQ_DATA_DIR: dataDir,
    OPENREQ_DB_PATH: dbPath,
    OPENREQ_PORT: STANDALONE_PORT,
    OPENREQ_HOST: STANDALONE_HOST,
    OPENREQ_LOG_FILE: logFile,
  };

  const binPath = getBackendBinaryPath();
  if (binPath) {
    backendProcess = spawn(binPath, [], {
      env,
      cwd: userDataDir,
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  const scriptPath = path.join(__dirname, '..', '..', 'backend', 'standalone_server.py');
  backendProcess = spawn('python', [scriptPath], {
    env,
    cwd: userDataDir,
    stdio: 'ignore',
    windowsHide: true,
  });
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    backendProcess.kill();
  } catch {
    // ignore
  }
  backendProcess = null;
}

function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Backend health check timeout'));
        } else {
          setTimeout(tryOnce, 300);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Backend health check timeout'));
        } else {
          setTimeout(tryOnce, 300);
        }
      });
    };
    tryOnce();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#2b2d30',
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      sandbox: false,
      webviewTag: true,
    },
    icon: getAppIcon(),
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    ensureTray();
    mainWindow.show();
  });

  const url = `http://${STANDALONE_HOST}:${STANDALONE_PORT}`;
  loadApp(url);
}

function loadApp(url) {
  let webviewPreload = path.join(__dirname, 'webview-preload.js');
  if (webviewPreload.includes('app.asar')) {
    webviewPreload = webviewPreload.replace('app.asar', 'app.asar.unpacked');
  }
  mainWindow.loadFile(path.join(__dirname, 'shell.html'), {
    query: { url: url, webviewPreload: webviewPreload },
  });
}

// IPC handlers for window chrome
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

// Local proxy handler (unchanged)
const httpLib = require('http');
const httpsLib = require('https');
const { URL } = require('url');

const LOCAL_PROXY_BINARY_PREFIXES = [
  'image/', 'audio/', 'video/', 'font/',
  'application/pdf', 'application/zip', 'application/gzip',
  'application/x-tar', 'application/x-7z-compressed',
  'application/x-rar-compressed', 'application/octet-stream',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats',
  'application/msword', 'application/x-bzip2',
  'application/wasm', 'application/protobuf',
];

function isLocalProxyBinary(ct) {
  const lower = (ct || '').toLowerCase().split(';')[0].trim();
  return LOCAL_PROXY_BINARY_PREFIXES.some(p => lower.startsWith(p));
}

ipcMain.handle('local-proxy-request', async (_event, { url, method, headers, body, query_params }) => {
  const urlObj = new URL(url);
  if (query_params) {
    for (const [k, v] of Object.entries(query_params)) {
      urlObj.searchParams.set(k, v);
    }
  }

  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? httpsLib : httpLib;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const reqOptions = {
      method: method || 'GET',
      headers: headers || {},
      timeout: 120000,
    };

    if (isHttps) {
      reqOptions.rejectUnauthorized = false;
    }

    const req = lib.request(urlObj.toString(), reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        const isBinary = isLocalProxyBinary(contentType);

        const respHeaders = {};
        for (const [k, v] of Object.entries(res.headers)) {
          respHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
        }

        resolve({
          status_code: res.statusCode,
          headers: respHeaders,
          body: isBinary ? '' : buffer.toString('utf-8'),
          body_base64: isBinary ? buffer.toString('base64') : null,
          is_binary: isBinary,
          content_type: contentType,
          elapsed_ms: elapsed,
          size_bytes: buffer.length,
        });
      });
    });

    req.on('error', (err) => reject(new Error(`Local proxy error: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout (120s)')); });

    if (body && !['GET', 'HEAD'].includes((method || 'GET').toUpperCase())) {
      req.write(body);
    }
    req.end();
  });
});

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.openreq.standalone');
  }
  startBackend();
  try {
    await waitForHealth();
  } catch {
    // If backend is slow, still open the window and let it retry
  }
  createWindow();
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
