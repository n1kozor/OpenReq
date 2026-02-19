document.addEventListener('DOMContentLoaded', () => {
  // Window controls
  document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());
  document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());

  // Set webview URL from query parameter
  const params = new URLSearchParams(window.location.search);
  const appUrl = params.get('url');
  const webview = document.getElementById('app-view');

  // Set webview preload for local proxy support
  const webviewPreload = params.get('webviewPreload');
  if (webviewPreload) {
    webview.setAttribute('preload', `file://${webviewPreload.replace(/\\/g, '/')}`);
  }

  if (appUrl) {
    webview.setAttribute('src', appUrl);
  }

  // ── Local Proxy Bridge ──
  // The webview-preload.js sends 'local-proxy-request' via sendToHost().
  // We receive it here, forward to the main process via electronAPI.localProxy(),
  // then send the response back to the webview.
  webview.addEventListener('ipc-message', (event) => {
    if (event.channel === 'local-proxy-request') {
      const { requestId, request } = event.args[0];
      window.electronAPI.localProxy(request)
        .then((response) => {
          webview.send('local-proxy-response', { requestId, response });
        })
        .catch((err) => {
          webview.send('local-proxy-response', { requestId, error: err.message });
        });
    }
  });

  // Ctrl+Shift+S → reset config, return to setup screen
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      window.electronAPI.resetConfig();
    }
  });
});
