// Runs in the page's MAIN world — has direct access to window
window.__OPENREQ_EXTENSION__ = { version: "1.0.9" };
window.dispatchEvent(new Event("openreq-extension-ready"));
