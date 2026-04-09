import { getState } from "./state.js";

export const COLORS = {
  boardLine: "rgba(25, 28, 40, .55)",
  star: "rgba(25, 28, 40, .65)",
  black: "#101318",
  white: "#f5f7ff",
  shadow: "rgba(0,0,0,.35)",
  win: "rgba(77,228,184,.35)",
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function boardGeometry() {
    const state = getState();
    const padding = 42;
    const grid = state.size;
    const inner = canvas.width - padding * 2;
    const gap = inner / (grid - 1);
    return { padding, grid, inner, gap };
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function posToCell(x, y) {
    const { padding, gap, grid } = boardGeometry();
    const fx = (x - padding) / gap;
    const fy = (y - padding) / gap;
    const c = Math.round(fx);
    const r = Math.round(fy);
    if (c < 0 || r < 0 || c >= grid || r >= grid) return null;
    const dx = Math.abs(fx - c);
    const dy = Math.abs(fy - r);
    if (dx > 0.35 || dy > 0.35) return null;
    return { r, c };
  }

  function cellCenter(r, c) {
    const { padding, gap } = boardGeometry();
    return { x: padding + c * gap, y: padding + r * gap };
  }

  function drawCoords() {
    const state = getState();
    const { padding, gap, grid } = boardGeometry();
    ctx.fillStyle = "rgba(20,24,36,.55)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let c = 0; c < grid; c++) {
      const label = String.fromCharCode("A".charCodeAt(0) + c);
      const x = padding + c * gap;
      ctx.fillText(label, x, padding - 20);
      ctx.fillText(label, x, padding + (grid - 1) * gap + 20);
    }
    for (let r = 0; r < grid; r++) {
      const label = `${r + 1}`;
      const y = padding + r * gap;
      ctx.fillText(label, padding - 20, y);
      ctx.fillText(label, padding + (grid - 1) * gap + 20, y);
    }
  }

  function drawBoard() {
    const state = getState();
    const { padding, gap, grid } = boardGeometry();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const g = ctx.createRadialGradient(
      canvas.width * 0.35,
      canvas.height * 0.25,
      120,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.9,
    );
    g.addColorStop(0, "rgba(255,255,255,.18)");
    g.addColorStop(1, "rgba(0,0,0,.10)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = COLORS.boardLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < grid; i++) {
      const x = padding + i * gap;
      const y = padding + i * gap;
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + (grid - 1) * gap, y);
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + (grid - 1) * gap);
    }
    ctx.stroke();

    const starIdx = grid === 19 ? [3, 9, 15] : [3, 7, 11];
    ctx.fillStyle = COLORS.star;
    for (const r of starIdx) {
      for (const c of starIdx) {
        const { x, y } = cellCenter(r, c);
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (state.showCoords) drawCoords();
  }

  function drawStone(r, c, p) {
    const state = getState();
    const { gap } = boardGeometry();
    const { x, y } = cellCenter(r, c);
    const radius = gap * 0.42;

    ctx.save();
    ctx.shadowColor = COLORS.shadow;
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();

    if (p === "B") {
      const g = ctx.createRadialGradient(
        x - radius * 0.35,
        y - radius * 0.35,
        2,
        x,
        y,
        radius * 1.15,
      );
      g.addColorStop(0, "rgba(255,255,255,.14)");
      g.addColorStop(0.25, "#1a1f2a");
      g.addColorStop(1, COLORS.black);
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(
        x - radius * 0.25,
        y - radius * 0.25,
        2,
        x,
        y,
        radius * 1.15,
      );
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.55, "#f2f5ff");
      g.addColorStop(1, "#d8def5");
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = p === "B" ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    const last = state.moves[state.moves.length - 1];
    if (last && last.r === r && last.c === c) {
      ctx.strokeStyle = p === "B" ? "rgba(255,255,255,.30)" : "rgba(0,0,0,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawWinningLine() {
    const state = getState();
    if (!state.winningLine) return;
    const pts = state.winningLine.map(({ r, c }) => cellCenter(r, c));
    ctx.save();
    ctx.strokeStyle = COLORS.win;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawHoverHint({ checkForbiddenAt } = {}) {
    const state = getState();
    if (!state.showHints || state.winner || !state.hover) return;
    const { r, c } = state.hover;
    if (state.board[r][c]) return;
    const { gap } = boardGeometry();
    const { x, y } = cellCenter(r, c);
    const radius = gap * 0.4;

    const forbiddenType =
      state.forbidden && state.turn === "B" && typeof checkForbiddenAt === "function"
        ? checkForbiddenAt(r, c, "B")
        : null;

    ctx.save();
    if (forbiddenType) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "rgba(255,60,60,1)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.7, y - radius * 0.7);
      ctx.lineTo(x + radius * 0.7, y + radius * 0.7);
      ctx.moveTo(x + radius * 0.7, y - radius * 0.7);
      ctx.lineTo(x - radius * 0.7, y + radius * 0.7);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,60,60,1)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(forbiddenType, x, y + radius + 4);
    } else {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle =
        state.turn === "B" ? "rgba(16,19,24,.75)" : "rgba(245,247,255,.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw({ checkForbiddenAt } = {}) {
    const state = getState();
    drawBoard();
    if (state.winningLine) drawWinningLine();
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const p = state.board[r][c];
        if (p) drawStone(r, c, p);
      }
    }
    drawHoverHint({ checkForbiddenAt });
  }

  return {
    ctx,
    boardGeometry,
    clamp,
    posToCell,
    cellCenter,
    draw,
  };
}

