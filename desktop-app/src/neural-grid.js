/**
 * NeuralGrid — Vanilla JS port of the React NeuralGrid component.
 * Animated hexagonal grid with spring physics, mouse repulsion, and phantom cursor.
 */
(function () {
  var canvas = document.getElementById('neural-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var SPACING = 110;
  var ROW_H = SPACING * Math.sqrt(3) / 2;
  var REPEL_RADIUS = 220;
  var REPEL_STRENGTH = 22;
  var SPRING = 0.035;
  var DAMPING = 0.85;
  var NODE_BASE_RADIUS = 1.6;
  var ROTATION_SPEED = (2 * Math.PI) / (600 * 60);

  var gridLineColor = [78, 81, 87];
  var gridLineAlpha = 0.09;
  var dotColor = [108, 112, 120];
  var accentColor = [74, 136, 199];
  var neuralLineAlpha = 0.18;

  var nodes = [];
  var edges = [];
  var angle = 0;
  var cx = 0, cy = 0;
  var dpr = window.devicePixelRatio || 1;
  var mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 };
  var phantom = { x: 0, y: 0, intensity: 0, phase: 0, timer: 60 };
  var raf = 0;

  function buildGrid(w, h) {
    var diag = Math.sqrt(w * w + h * h);
    var cols = Math.ceil(diag / SPACING) + 6;
    var rows = Math.ceil(diag / ROW_H) + 6;
    cx = w / 2;
    cy = h / 2;
    nodes = [];
    edges = [];

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var isOddRow = r % 2 === 1;
        var xOff = isOddRow ? SPACING * 0.5 : 0;
        var jx = (Math.random() - 0.5) * SPACING * 0.45;
        var jy = (Math.random() - 0.5) * ROW_H * 0.45;
        var hx = (c - (cols - 1) / 2) * SPACING + xOff + jx;
        var hy = (r - (rows - 1) / 2) * ROW_H + jy;

        nodes.push({
          origDx: hx, origDy: hy,
          homeX: cx + hx, homeY: cy + hy,
          x: cx + hx, y: cy + hy,
          vx: 0, vy: 0,
          row: r, col: c,
          repelAngleOffset: (Math.random() - 0.5) * 1.4,
          repelStrength: 0.3 + Math.random() * 1.4,
          springStiff: 0.5 + Math.random() * 1.0,
          dampingMul: 0.96 + Math.random() * 0.08,
          jitterScale: 0.4 + Math.random() * 0.6,
        });
      }
    }

    var id = function (r, c) { return r * cols + c; };

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var ai = id(r, c);
        var a = nodes[ai];

        if (c < cols - 1) {
          var bi = id(r, c + 1);
          var b = nodes[bi];
          edges.push({ a: ai, b: bi, restLen: Math.sqrt(Math.pow(b.origDx - a.origDx, 2) + Math.pow(b.origDy - a.origDy, 2)) });
        }

        if (r < rows - 1) {
          var isOddRow = r % 2 === 1;
          var dlCol = isOddRow ? c : c - 1;
          if (dlCol >= 0 && dlCol < cols) {
            var bi = id(r + 1, dlCol);
            var b = nodes[bi];
            edges.push({ a: ai, b: bi, restLen: Math.sqrt(Math.pow(b.origDx - a.origDx, 2) + Math.pow(b.origDy - a.origDy, 2)) });
          }
          var drCol = isOddRow ? c + 1 : c;
          if (drCol >= 0 && drCol < cols) {
            var bi = id(r + 1, drCol);
            var b = nodes[bi];
            edges.push({ a: ai, b: bi, restLen: Math.sqrt(Math.pow(b.origDx - a.origDx, 2) + Math.pow(b.origDy - a.origDy, 2)) });
          }
        }
      }
    }
  }

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrid(w, h);
  }

  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mouseleave', function () {
    mouse.x = -9999;
    mouse.y = -9999;
    mouse.speed = 0;
  });

  function drawBreakingSegment(a, b, restLen, mx, my) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var actualDist = Math.sqrt(dx * dx + dy * dy);
    var distortion = Math.abs(actualDist - restLen);
    var breakStart = restLen * 0.08;
    var breakEnd = restLen * 0.40;
    var breakFactor = 0;
    if (distortion > breakStart) {
      breakFactor = Math.min((distortion - breakStart) / (breakEnd - breakStart), 1);
    }
    if (breakFactor >= 1) return;

    var midX = (a.x + b.x) / 2;
    var midY = (a.y + b.y) / 2;
    var cursorDist = Math.sqrt(Math.pow(midX - mx, 2) + Math.pow(midY - my, 2));
    var cursorInf = Math.max(0, 1 - cursorDist / (REPEL_RADIUS * 2));
    var mix = Math.max(cursorInf, breakFactor * 0.6);
    var cr = Math.round(gridLineColor[0] + (accentColor[0] - gridLineColor[0]) * mix);
    var cg = Math.round(gridLineColor[1] + (accentColor[1] - gridLineColor[1]) * mix);
    var cb = Math.round(gridLineColor[2] + (accentColor[2] - gridLineColor[2]) * mix);

    if (breakFactor > 0.05) {
      var intact = 1 - breakFactor;
      var ax2 = a.x + dx * 0.5 * intact;
      var ay2 = a.y + dy * 0.5 * intact;
      var bx2 = b.x - dx * 0.5 * intact;
      var by2 = b.y - dy * 0.5 * intact;
      var stubAlpha = (gridLineAlpha + cursorInf * 0.15) * intact;
      var lineW = Math.max(0.3, 0.7 * intact);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(ax2, ay2);
      ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + stubAlpha + ')';
      ctx.lineWidth = lineW;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(bx2, by2);
      ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + stubAlpha + ')';
      ctx.lineWidth = lineW;
      ctx.stroke();
    } else {
      var alpha = gridLineAlpha + cursorInf * 0.15;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + alpha + ')';
      ctx.lineWidth = cursorInf > 0.1 ? 0.8 : 0.5;
      ctx.stroke();
    }
  }

  function animate() {
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    if (nodes.length === 0) { raf = requestAnimationFrame(animate); return; }

    var mx = mouse.x;
    var my = mouse.y;

    // Cursor velocity
    var dxMouse = mx - mouse.prevX;
    var dyMouse = my - mouse.prevY;
    var instantSpeed = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
    mouse.speed = mouse.speed * 0.92 + instantSpeed * 0.08;
    mouse.prevX = mx;
    mouse.prevY = my;
    var velocityFactor = Math.min(mouse.speed / 12, 1);

    // Phantom cursor update
    phantom.timer--;
    if (phantom.timer <= 0) {
      phantom.phase = (phantom.phase + 1) % 4;
      if (phantom.phase === 0) {
        phantom.timer = 120 + Math.random() * 240;
      } else if (phantom.phase === 1) {
        var margin = 0.15;
        var px, py;
        do {
          px = margin + Math.random() * (1 - 2 * margin);
          py = margin + Math.random() * (1 - 2 * margin);
        } while (Math.abs(px - 0.5) < 0.2 && Math.abs(py - 0.5) < 0.2);
        phantom.x = px * w;
        phantom.y = py * h;
        phantom.timer = 120 + Math.random() * 60;
      } else if (phantom.phase === 2) {
        phantom.timer = 150 + Math.random() * 150;
      } else {
        phantom.timer = 120 + Math.random() * 60;
      }
    }
    if (phantom.phase === 1) { phantom.intensity += (1 - phantom.intensity) * 0.015; }
    else if (phantom.phase === 2) { phantom.intensity += (1 - phantom.intensity) * 0.02; }
    else { phantom.intensity *= 0.985; }
    var phX = phantom.x, phY = phantom.y, phStr = phantom.intensity;
    var PH_RADIUS = 180, PH_STRENGTH = 16;

    // Rotation
    angle += ROTATION_SPEED;
    var cosA = Math.cos(angle);
    var sinA = Math.sin(angle);

    // Physics update
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.homeX = cx + n.origDx * cosA - n.origDy * sinA;
      n.homeY = cy + n.origDx * sinA + n.origDy * cosA;

      n.vx += (n.homeX - n.x) * SPRING * n.springStiff;
      n.vy += (n.homeY - n.y) * SPRING * n.springStiff;

      // Mouse repulsion
      var dx = n.x - mx;
      var dy = n.y - my;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < REPEL_RADIUS && dist > 0.1) {
        var t = 1 - dist / REPEL_RADIUS;
        var baseForce = t * t * REPEL_STRENGTH * n.repelStrength;
        var force = baseForce * (0.15 + 0.85 * velocityFactor);
        var baseAngle = Math.atan2(dy, dx);
        var scatterAngle = baseAngle + n.repelAngleOffset * velocityFactor;
        n.vx += Math.cos(scatterAngle) * force;
        n.vy += Math.sin(scatterAngle) * force;
        var jitter = force * 0.2 * n.jitterScale * velocityFactor;
        n.vx += (Math.random() - 0.5) * jitter;
        n.vy += (Math.random() - 0.5) * jitter;
      }

      // Phantom repulsion
      if (phStr > 0.01) {
        var pdx = n.x - phX;
        var pdy = n.y - phY;
        var pDist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pDist < PH_RADIUS && pDist > 0.1) {
          var pt = 1 - pDist / PH_RADIUS;
          var pForce = pt * pt * PH_STRENGTH * n.repelStrength * phStr;
          var pAngle = Math.atan2(pdy, pdx) + n.repelAngleOffset * 0.3;
          n.vx += Math.cos(pAngle) * pForce;
          n.vy += Math.sin(pAngle) * pForce;
        }
      }

      n.vx *= DAMPING * n.dampingMul;
      n.vy *= DAMPING * n.dampingMul;
      n.x += n.vx;
      n.y += n.vy;
    }

    // Draw edges
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      drawBreakingSegment(nodes[edge.a], nodes[edge.b], edge.restLen, mx, my);
    }

    // Neural connections
    var NEURAL_DIST = SPACING * 2.2;
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      var dispA = Math.sqrt(Math.pow(a.x - a.homeX, 2) + Math.pow(a.y - a.homeY, 2));
      if (dispA < 3) continue;

      for (var j = i + 2; j < Math.min(i + 8, nodes.length); j++) {
        var b = nodes[j];
        var ddx = b.x - a.x;
        var ddy = b.y - a.y;
        var d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d > NEURAL_DIST || d < SPACING * 0.5) continue;

        var dispB = Math.sqrt(Math.pow(b.x - b.homeX, 2) + Math.pow(b.y - b.homeY, 2));
        var avgDisp = (dispA + dispB) / 2;
        var dispFactor = Math.min(avgDisp / 30, 1);
        var distFactor = 1 - d / NEURAL_DIST;
        var alpha = dispFactor * distFactor * neuralLineAlpha;
        if (alpha < 0.005) continue;

        var mix = dispFactor;
        var cr = Math.round(gridLineColor[0] + (accentColor[0] - gridLineColor[0]) * mix);
        var cg = Math.round(gridLineColor[1] + (accentColor[1] - gridLineColor[1]) * mix);
        var cb = Math.round(gridLineColor[2] + (accentColor[2] - gridLineColor[2]) * mix);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + alpha + ')';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // Draw nodes
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var disp = Math.sqrt(Math.pow(n.x - n.homeX, 2) + Math.pow(n.y - n.homeY, 2));
      var dispFactor = Math.min(disp / 35, 1);
      var cursorDist = Math.sqrt(Math.pow(n.x - mx, 2) + Math.pow(n.y - my, 2));
      var cursorInf = Math.max(0, 1 - cursorDist / (REPEL_RADIUS * 1.5));
      var colorMix = Math.max(dispFactor, cursorInf);
      var a = 0.3 + dispFactor * 0.45 + cursorInf * 0.25;
      var radius = NODE_BASE_RADIUS + dispFactor * 1.5 + cursorInf * 0.6;

      var cr = Math.round(dotColor[0] + (accentColor[0] - dotColor[0]) * colorMix);
      var cg = Math.round(dotColor[1] + (accentColor[1] - dotColor[1]) * colorMix);
      var cb = Math.round(dotColor[2] + (accentColor[2] - dotColor[2]) * colorMix);

      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a + ')';
      ctx.fill();

      if (colorMix > 0.4) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + accentColor[0] + ',' + accentColor[1] + ',' + accentColor[2] + ',' + (colorMix * 0.08) + ')';
        ctx.fill();
      }
    }

    raf = requestAnimationFrame(animate);
  }

  raf = requestAnimationFrame(animate);
})();
