document.addEventListener('DOMContentLoaded', async () => {
  const ipInput = document.getElementById('ip-input');
  const portInput = document.getElementById('port-input');
  const btnTest = document.getElementById('btn-test');
  const btnConnect = document.getElementById('btn-connect');
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('status-text');

  // Window controls
  document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());
  document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());

  // Pre-fill from saved config
  try {
    const config = await window.electronAPI.getConfig();
    if (config.ip) ipInput.value = config.ip;
    if (config.port) portInput.value = config.port;
  } catch {
    // ignore
  }

  let connectionTested = false;

  function showStatus(type, text) {
    statusEl.className = `status ${type}`;
    statusText.textContent = text;
  }

  function hideStatus() {
    statusEl.className = 'status hidden';
  }

  function validateInputs() {
    const ip = ipInput.value.trim();
    const port = portInput.value.trim();
    return ip.length > 0 && port.length > 0 && /^\d+$/.test(port);
  }

  function updateConnectButton() {
    btnConnect.disabled = !connectionTested;
  }

  // Reset test status when inputs change
  ipInput.addEventListener('input', () => {
    connectionTested = false;
    updateConnectButton();
    hideStatus();
  });
  portInput.addEventListener('input', () => {
    connectionTested = false;
    updateConnectButton();
    hideStatus();
  });

  // Test connection
  btnTest.addEventListener('click', async () => {
    if (!validateInputs()) {
      showStatus('error', 'Please enter a valid IP address and port number');
      return;
    }

    const ip = ipInput.value.trim();
    const port = portInput.value.trim();

    showStatus('loading', `Testing connection to ${ip}:${port}...`);
    btnTest.disabled = true;

    const result = await window.electronAPI.testConnection(ip, port);

    btnTest.disabled = false;

    if (result.success) {
      connectionTested = true;
      showStatus('success', `Connected successfully (HTTP ${result.status})`);
    } else {
      connectionTested = false;
      showStatus('error', `Connection failed: ${result.error}`);
    }

    updateConnectButton();
  });

  // Connect
  btnConnect.addEventListener('click', async () => {
    if (!connectionTested) return;

    const ip = ipInput.value.trim();
    const port = portInput.value.trim();

    showStatus('loading', 'Connecting...');
    btnConnect.disabled = true;
    btnTest.disabled = true;

    await window.electronAPI.saveConfig(ip, port);
  });

  // Enter key
  const handleEnter = (e) => {
    if (e.key === 'Enter') {
      if (connectionTested) {
        btnConnect.click();
      } else {
        btnTest.click();
      }
    }
  };
  ipInput.addEventListener('keydown', handleEnter);
  portInput.addEventListener('keydown', handleEnter);

  // Focus IP input on load
  ipInput.focus();
});
