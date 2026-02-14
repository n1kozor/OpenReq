// Create drag strip (makes top area of window draggable)
var dragStrip = document.createElement('div');
dragStrip.id = 'openreq-titlebar-drag-strip';
document.body.appendChild(dragStrip);

// Create titlebar container
var titlebar = document.createElement('div');
titlebar.id = 'openreq-titlebar';

// Close button
var btnClose = document.createElement('button');
btnClose.className = 'otb-dot otb-close';
btnClose.title = 'Close';
btnClose.addEventListener('click', function() {
  if (window.electronAPI) window.electronAPI.close();
});

// Minimize button
var btnMin = document.createElement('button');
btnMin.className = 'otb-dot otb-minimize';
btnMin.title = 'Minimize';
btnMin.addEventListener('click', function() {
  if (window.electronAPI) window.electronAPI.minimize();
});

// Maximize button
var btnMax = document.createElement('button');
btnMax.className = 'otb-dot otb-maximize';
btnMax.title = 'Maximize';
btnMax.addEventListener('click', function() {
  if (window.electronAPI) window.electronAPI.maximize();
});

titlebar.appendChild(btnClose);
titlebar.appendChild(btnMin);
titlebar.appendChild(btnMax);
document.body.appendChild(titlebar);
