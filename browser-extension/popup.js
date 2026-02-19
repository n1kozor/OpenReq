const statusEl = document.getElementById("status");
const toggleEl = document.getElementById("enableToggle");

// Load saved state
chrome.storage.local.get(["enabled"], (result) => {
  const enabled = result.enabled !== false; // default: true
  toggleEl.checked = enabled;
  updateStatus(enabled);
});

toggleEl.addEventListener("change", () => {
  const enabled = toggleEl.checked;
  chrome.storage.local.set({ enabled });
  updateStatus(enabled);
});

function updateStatus(enabled) {
  if (enabled) {
    statusEl.className = "status active";
    statusEl.innerHTML = `<div class="dot green"></div><span>Local Proxy Active</span>`;
  } else {
    statusEl.className = "status inactive";
    statusEl.innerHTML = `<div class="dot gray"></div><span>Local Proxy Disabled</span>`;
  }
}

// Check if current tab has OpenReq
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { type: "PING" }, (response) => {
      // If no response, the content script isn't loaded or the page isn't OpenReq
      // This is fine — the status just shows whether the extension is enabled
    });
  }
});
