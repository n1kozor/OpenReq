// Runs in the page's MAIN world — has direct access to window
window.__OPENREQ_EXTENSION__ = { version: "1.1.16" };
window.dispatchEvent(new Event("openreq-extension-ready"));
