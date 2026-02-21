const { app, BrowserWindow, ipcMain, net, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'openreq-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // ignore corrupt config
  }
  return {};
}

function saveConfig(data) {
  const existing = loadConfig();
  const merged = { ...existing, ...data };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
}

let mainWindow;
let tray;
let trayReady = false;

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
  tray.setToolTip('OpenReq');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'OpenReq megnyitása',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Elrejtés / Megjelenítés',
      click: () => toggleWindowVisibility(),
    },
    { type: 'separator' },
    {
      label: 'Kilépés',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => toggleWindowVisibility());
}

function createWindow() {
  const config = loadConfig();
  const bounds = config.windowBounds || { width: 1400, height: 900 };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    // NO transparent: true — let Windows 11 DWM handle rounded corners natively
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

  // Save window bounds on resize/move
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isMinimized() && !mainWindow.isDestroyed()) {
      saveConfig({ windowBounds: mainWindow.getBounds() });
    }
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Decide what to load
  const serverIp = config.serverIp || '';
  const serverPort = config.serverPort || '80';

  if (serverIp) {
    loadApp(`http://${serverIp}:${serverPort}`);
  } else {
    loadSetup();
  }
}

function loadSetup() {
  mainWindow.loadFile(path.join(__dirname, 'setup.html'));
}

function loadApp(url) {
  // Load the shell page which contains a drag bar + webview
  // In production (asar), webview preload must point to the unpacked file
  // because <webview preload="file://..."> cannot load from inside app.asar
  let webviewPreload = path.join(__dirname, 'webview-preload.js');
  if (webviewPreload.includes('app.asar')) {
    webviewPreload = webviewPreload.replace('app.asar', 'app.asar.unpacked');
  }
  mainWindow.loadFile(path.join(__dirname, 'shell.html'), {
    query: { url: url, webviewPreload: webviewPreload },
  });
}

// ── IPC Handlers ──

ipcMain.handle('test-connection', async (_event, ip, port) => {
  const url = `http://${ip}:${port}`;
  return new Promise((resolve) => {
    try {
      const request = net.request(url);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          request.abort();
          resolve({ success: false, error: 'Connection timed out (5s)' });
        }
      }, 5000);

      request.on('response', (response) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ success: true, status: response.statusCode });
        }
      });

      request.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ success: false, error: err.message });
        }
      });

      request.end();
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('save-config', async (_event, ip, port) => {
  saveConfig({ serverIp: ip, serverPort: port });
  loadApp(`http://${ip}:${port}`);
  return true;
});

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

ipcMain.handle('get-config', async () => {
  const config = loadConfig();
  return {
    ip: config.serverIp || '',
    port: config.serverPort || '80',
  };
});

ipcMain.handle('reset-config', async () => {
  saveConfig({ serverIp: '', serverPort: '80' });
  loadSetup();
  return true;
});

// ── Local Proxy: execute HTTP requests directly from the desktop ──

const http = require('http');
const https = require('https');
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
  const lib = isHttps ? https : http;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const reqOptions = {
      method: method || 'GET',
      headers: headers || {},
      timeout: 120000,
    };

    // Disable SSL verification for local development scenarios
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

// ── App lifecycle ──

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.openreq.desktop');
  }
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
