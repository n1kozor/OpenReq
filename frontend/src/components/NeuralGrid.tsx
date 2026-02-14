import { useRef, useEffect, useCallback } from "react";

interface Node {
  origDx: number;
  origDy: number;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  row: number;
  col: number;
  // Per-node randomness for organic feel
  repelAngleOffset: number;
  repelStrength: number;
  springStiff: number;
  dampingMul: number;
  jitterScale: number;
}

interface Edge {
  a: number;
  b: number;
  restLen: number;
}

interface GridMeta {
  nodes: Node[];
  edges: Edge[];
  cols: number;
  rows: number;
}

interface NeuralGridProps {
  isDark: boolean;
  repelElementRef?: React.RefObject<HTMLDivElement | null>;
}

export default function NeuralGrid({ isDark, repelElementRef }: NeuralGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<GridMeta>({ nodes: [], edges: [], cols: 0, rows: 0 });
  const mouseRef = useRef({ x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 });
  const rafRef = useRef<number>(0);
  const dprRef = useRef(1);
  const angleRef = useRef(0);
  const centerRef = useRef({ cx: 0, cy: 0 });

  // Phantom cursor — ambient "ghost mouse" that wanders the edges
  const phantomRef = useRef({
    x: 0, y: 0,
    intensity: 0,           // 0..1 current force multiplier
    phase: 0 as number,     // 0=wait, 1=fadeIn, 2=hold, 3=fadeOut
    timer: 0,               // frames remaining in current phase
  });

  const SPACING = 110;
  const ROW_H = SPACING * Math.sqrt(3) / 2; // ~95px — equilateral triangle row height
  const REPEL_RADIUS = 220;
  const REPEL_STRENGTH = 22;
  const SPRING = 0.035;
  const DAMPING = 0.85;
  const NODE_BASE_RADIUS = 1.6;
  const ROTATION_SPEED = (2 * Math.PI) / (600 * 60);

  const buildGrid = useCallback((w: number, h: number): GridMeta => {
    const diag = Math.sqrt(w * w + h * h);
    const cols = Math.ceil(diag / SPACING) + 6;
    const rows = Math.ceil(diag / ROW_H) + 6;
    const cx = w / 2;
    const cy = h / 2;
    centerRef.current = { cx, cy };
    const nodes: Node[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isOddRow = r % 2 === 1;
        const xOff = isOddRow ? SPACING * 0.5 : 0;
        // Heavy per-node jitter — irregular, organic triangles
        const jx = (Math.random() - 0.5) * SPACING * 0.45;
        const jy = (Math.random() - 0.5) * ROW_H * 0.45;
        const hx = (c - (cols - 1) / 2) * SPACING + xOff + jx;
        const hy = (r - (rows - 1) / 2) * ROW_H + jy;

        nodes.push({
          origDx: hx,
          origDy: hy,
          homeX: cx + hx,
          homeY: cy + hy,
          x: cx + hx,
          y: cy + hy,
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

    // Build triangle edges
    const edges: Edge[] = [];
    const id = (r: number, c: number) => r * cols + c;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ai = id(r, c);
        const a = nodes[ai]!;

        // Horizontal neighbor (right)
        if (c < cols - 1) {
          const bi = id(r, c + 1);
          const b = nodes[bi]!;
          edges.push({ a: ai, b: bi, restLen: Math.sqrt((b.origDx - a.origDx) ** 2 + (b.origDy - a.origDy) ** 2) });
        }

        // Diagonal neighbors to next row
        if (r < rows - 1) {
          const isOddRow = r % 2 === 1;

          // Down-left
          const dlCol = isOddRow ? c : c - 1;
          if (dlCol >= 0 && dlCol < cols) {
            const bi = id(r + 1, dlCol);
            const b = nodes[bi]!;
            edges.push({ a: ai, b: bi, restLen: Math.sqrt((b.origDx - a.origDx) ** 2 + (b.origDy - a.origDy) ** 2) });
          }

          // Down-right
          const drCol = isOddRow ? c + 1 : c;
          if (drCol >= 0 && drCol < cols) {
            const bi = id(r + 1, drCol);
            const b = nodes[bi]!;
            edges.push({ a: ai, b: bi, restLen: Math.sqrt((b.origDx - a.origDx) ** 2 + (b.origDy - a.origDy) ** 2) });
          }
        }
      }
    }

    return { nodes, edges, cols, rows };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gridRef.current = buildGrid(w, h);
    };

    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };
    const onMouseLeave = () => {
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
      mouseRef.current.speed = 0;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [buildGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const gridLineColor = isDark ? [139, 148, 158] : [100, 116, 139];
    const gridLineAlpha = isDark ? 0.07 : 0.06;
    const dotColor = isDark ? [154, 164, 178] : [100, 116, 139];
    const accentColor = isDark ? [129, 140, 248] : [99, 102, 241];
    const neuralLineAlpha = isDark ? 0.18 : 0.12;

    const animate = () => {
      const w = canvas.width / dprRef.current;
      const h = canvas.height / dprRef.current;
      ctx.clearRect(0, 0, w, h);

      const { nodes, edges } = gridRef.current;
      if (nodes.length === 0) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // === Calculate cursor velocity (smoothed) ===
      const dxMouse = mx - mouseRef.current.prevX;
      const dyMouse = my - mouseRef.current.prevY;
      const instantSpeed = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
      mouseRef.current.speed = mouseRef.current.speed * 0.92 + instantSpeed * 0.08;
      mouseRef.current.prevX = mx;
      mouseRef.current.prevY = my;

      const speed = mouseRef.current.speed;
      const velocityFactor = Math.min(speed / 12, 1);

      // Logo element repulsion source (rect-based, computed once per frame)
      const LOGO_PAD = 30;
      const LOGO_FADE = 70;
      let logoL = 0, logoT = 0, logoR = 0, logoB = 0, logoCx = 0, logoCy = 0;
      let hasLogo = false;
      if (repelElementRef?.current) {
        const rect = repelElementRef.current.getBoundingClientRect();
        logoL = rect.left - LOGO_PAD;
        logoT = rect.top - LOGO_PAD;
        logoR = rect.right + LOGO_PAD;
        logoB = rect.bottom + LOGO_PAD;
        logoCx = (logoL + logoR) / 2;
        logoCy = (logoT + logoB) / 2;
        hasLogo = true;
      }

      // === Phantom cursor update ===
      const ph = phantomRef.current;
      ph.timer--;
      if (ph.timer <= 0) {
        ph.phase = (ph.phase + 1) % 4;
        if (ph.phase === 0) {
          ph.timer = 120 + Math.random() * 240;
        } else if (ph.phase === 1) {
          const margin = 0.15;
          let px: number, py: number;
          do {
            px = margin + Math.random() * (1 - 2 * margin);
            py = margin + Math.random() * (1 - 2 * margin);
          } while (Math.abs(px - 0.5) < 0.2 && Math.abs(py - 0.5) < 0.2);
          ph.x = px * w;
          ph.y = py * h;
          ph.timer = 120 + Math.random() * 60;
        } else if (ph.phase === 2) {
          ph.timer = 150 + Math.random() * 150;
        } else {
          ph.timer = 120 + Math.random() * 60;
        }
      }
      if (ph.phase === 1) {
        ph.intensity += (1 - ph.intensity) * 0.015;
      } else if (ph.phase === 2) {
        ph.intensity += (1 - ph.intensity) * 0.02;
      } else if (ph.phase === 3) {
        ph.intensity *= 0.985;
      } else {
        ph.intensity *= 0.985;
      }
      const phX = ph.x;
      const phY = ph.y;
      const phStr = ph.intensity;
      const PH_RADIUS = 180;
      const PH_STRENGTH = 16;

      // Slowly advance rotation angle
      angleRef.current += ROTATION_SPEED;
      const angle = angleRef.current;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const { cx, cy } = centerRef.current;

      // === Update rotated home positions & physics ===
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;

        n.homeX = cx + n.origDx * cosA - n.origDy * sinA;
        n.homeY = cy + n.origDx * sinA + n.origDy * cosA;

        n.vx += (n.homeX - n.x) * SPRING * n.springStiff;
        n.vy += (n.homeY - n.y) * SPRING * n.springStiff;

        // Mouse repulsion
        const dx = n.x - mx;
        const dy = n.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPEL_RADIUS && dist > 0.1) {
          const t = 1 - dist / REPEL_RADIUS;
          const baseForce = t * t * REPEL_STRENGTH * n.repelStrength;
          const force = baseForce * (0.15 + 0.85 * velocityFactor);
          const baseAngle = Math.atan2(dy, dx);
          const scatterAngle = baseAngle + n.repelAngleOffset * velocityFactor;
          n.vx += Math.cos(scatterAngle) * force;
          n.vy += Math.sin(scatterAngle) * force;

          const jitter = force * 0.2 * n.jitterScale * velocityFactor;
          n.vx += (Math.random() - 0.5) * jitter;
          n.vy += (Math.random() - 0.5) * jitter;
        }

        // Logo element repulsion (rect-based, constant, always active)
        if (hasLogo) {
          const nearX = Math.max(logoL, Math.min(n.x, logoR));
          const nearY = Math.max(logoT, Math.min(n.y, logoB));
          const dlx = n.x - nearX;
          const dly = n.y - nearY;
          const logoDist = Math.sqrt(dlx * dlx + dly * dly);

          if (logoDist < LOGO_FADE) {
            let lAngle: number;
            if (logoDist > 0.1) {
              lAngle = Math.atan2(dly, dlx);
            } else {
              lAngle = Math.atan2(n.y - logoCy, n.x - logoCx);
            }
            const lt = 1 - logoDist / LOGO_FADE;
            const logoForce = lt * lt * 10 * n.repelStrength;
            n.vx += Math.cos(lAngle) * logoForce;
            n.vy += Math.sin(lAngle) * logoForce;
          }
        }

        // Phantom cursor repulsion
        if (phStr > 0.01) {
          const pdx = n.x - phX;
          const pdy = n.y - phY;
          const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
          if (pDist < PH_RADIUS && pDist > 0.1) {
            const pt = 1 - pDist / PH_RADIUS;
            const pForce = pt * pt * PH_STRENGTH * n.repelStrength * phStr;
            const pAngle = Math.atan2(pdy, pdx) + n.repelAngleOffset * 0.3;
            n.vx += Math.cos(pAngle) * pForce;
            n.vy += Math.sin(pAngle) * pForce;
          }
        }

        n.vx *= DAMPING * n.dampingMul;
        n.vy *= DAMPING * n.dampingMul;
        n.x += n.vx;
        n.y += n.vy;
      }

      // === Draw triangle edges with breaking effect ===
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i]!;
        const a = nodes[edge.a]!;
        const b = nodes[edge.b]!;
        drawBreakingSegment(ctx, a, b, edge.restLen, mx, my, gridLineColor, gridLineAlpha, accentColor, REPEL_RADIUS);
      }

      // === Neural connections (long-range when displaced) ===
      const NEURAL_DIST = SPACING * 2.2;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        const dispA = Math.sqrt((a.x - a.homeX) ** 2 + (a.y - a.homeY) ** 2);
        if (dispA < 3) continue;

        // Check a few nearby nodes (skip direct neighbors by stride)
        for (let j = i + 2; j < Math.min(i + 8, nodes.length); j++) {
          const b = nodes[j]!;
          const ddx = b.x - a.x;
          const ddy = b.y - a.y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d > NEURAL_DIST || d < SPACING * 0.5) continue;

          const dispB = Math.sqrt((b.x - b.homeX) ** 2 + (b.y - b.homeY) ** 2);
          const avgDisp = (dispA + dispB) / 2;
          const dispFactor = Math.min(avgDisp / 30, 1);
          const distFactor = 1 - d / NEURAL_DIST;
          const alpha = dispFactor * distFactor * neuralLineAlpha;
          if (alpha < 0.005) continue;

          const mix = dispFactor;
          const cr = Math.round(gridLineColor[0]! + (accentColor[0]! - gridLineColor[0]!) * mix);
          const cg = Math.round(gridLineColor[1]! + (accentColor[1]! - gridLineColor[1]!) * mix);
          const cb = Math.round(gridLineColor[2]! + (accentColor[2]! - gridLineColor[2]!) * mix);

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // === Draw nodes ===
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        const disp = Math.sqrt((n.x - n.homeX) ** 2 + (n.y - n.homeY) ** 2);
        const dispFactor = Math.min(disp / 35, 1);

        const cursorDist = Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2);
        const cursorInf = Math.max(0, 1 - cursorDist / (REPEL_RADIUS * 1.5));
        const colorMix = Math.max(dispFactor, cursorInf);

        const baseAlpha = isDark ? 0.3 : 0.25;
        const a = baseAlpha + dispFactor * 0.45 + cursorInf * 0.25;
        const radius = NODE_BASE_RADIUS + dispFactor * 1.5 + cursorInf * 0.6;

        const cr = Math.round(dotColor[0]! + (accentColor[0]! - dotColor[0]!) * colorMix);
        const cg = Math.round(dotColor[1]! + (accentColor[1]! - dotColor[1]!) * colorMix);
        const cb = Math.round(dotColor[2]! + (accentColor[2]! - dotColor[2]!) * colorMix);

        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
        ctx.fill();

        if (colorMix > 0.4) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${accentColor[0]},${accentColor[1]},${accentColor[2]},${colorMix * 0.08})`;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

/** Edge segment that breaks when the two nodes drift apart */
function drawBreakingSegment(
  ctx: CanvasRenderingContext2D,
  a: Node, b: Node,
  restLen: number,
  mx: number, my: number,
  lineColor: number[], baseAlpha: number,
  accentColor: number[],
  repelRadius: number,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const actualDist = Math.sqrt(dx * dx + dy * dy);

  const distortion = Math.abs(actualDist - restLen);
  const breakStart = restLen * 0.08;
  const breakEnd = restLen * 0.40;
  let breakFactor = 0;
  if (distortion > breakStart) {
    breakFactor = Math.min((distortion - breakStart) / (breakEnd - breakStart), 1);
  }

  if (breakFactor >= 1) return;

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const cursorDist = Math.sqrt((midX - mx) ** 2 + (midY - my) ** 2);
  const cursorInf = Math.max(0, 1 - cursorDist / (repelRadius * 2));

  const mix = Math.max(cursorInf, breakFactor * 0.6);
  const cr = Math.round(lineColor[0]! + (accentColor[0]! - lineColor[0]!) * mix);
  const cg = Math.round(lineColor[1]! + (accentColor[1]! - lineColor[1]!) * mix);
  const cb = Math.round(lineColor[2]! + (accentColor[2]! - lineColor[2]!) * mix);

  if (breakFactor > 0.05) {
    const intact = 1 - breakFactor;
    const ax2 = a.x + dx * 0.5 * intact;
    const ay2 = a.y + dy * 0.5 * intact;
    const bx2 = b.x - dx * 0.5 * intact;
    const by2 = b.y - dy * 0.5 * intact;

    const stubAlpha = (baseAlpha + cursorInf * 0.15) * intact;
    const lineW = Math.max(0.3, 0.7 * intact);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ax2, ay2);
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${stubAlpha})`;
    ctx.lineWidth = lineW;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(bx2, by2);
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${stubAlpha})`;
    ctx.lineWidth = lineW;
    ctx.stroke();
  } else {
    const alpha = baseAlpha + cursorInf * 0.15;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
    ctx.lineWidth = cursorInf > 0.1 ? 0.8 : 0.5;
    ctx.stroke();
  }
}
