document.addEventListener('DOMContentLoaded', () => {
  // Window controls
  document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());
  document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());

  // Set webview URL from query parameter
  const params = new URLSearchParams(window.location.search);
  const appUrl = params.get('url');
  const webview = document.getElementById('app-view');

  if (appUrl) {
    webview.setAttribute('src', appUrl);
  }

  // Ctrl+Shift+S → reset config, return to setup screen
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      window.electronAPI.resetConfig();
    }
  });
});
