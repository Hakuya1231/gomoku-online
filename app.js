const $ = (id) => document.getElementById(id);

const canvas = $("board");
const ctx = canvas.getContext("2d");

const statusEl = $("status");
const btnUndo = $("btnUndo");
const btnRestart = $("btnRestart");
const moveCountEl = $("moveCount");
const lastMoveEl = $("lastMove");
const winnerEl = $("winner");
const firstPlayerEl = $("firstPlayer");
const boardSizeEl = $("boardSize");
const toggleCoordsEl = $("toggleCoords");
const toggleHintsEl = $("toggleHints");
const gameModeEl = $("gameMode");
const humanSideEl = $("humanSide");
const aiLevelEl = $("aiLevel");

// 联机UI元素
const onlinePanel = $("onlinePanel");
const linkSection = $("linkSection");
const shareLinkInput = $("shareLinkInput");
const btnCopyLink = $("btnCopyLink");
const connectSection = $("connectSection");
const btnCreateRoom = $("btnCreateRoom");
const btnDisconnect = $("btnDisconnect");
const connectionStatusEl = $("connectionStatus");
const roomIdDisplayEl = $("roomIdDisplay");
const opponentInfoEl = $("opponentInfo");

const COLORS = {
  boardLine: "rgba(25, 28, 40, .55)",
  star: "rgba(25, 28, 40, .65)",
  black: "#101318",
  white: "#f5f7ff",
  shadow: "rgba(0,0,0,.35)",
  win: "rgba(77,228,184,.35)",
};

function createState(size, first = "B") {
  return {
    size,
    first,
    turn: first,
    winner: null,
    winningLine: null,
    board: Array.from({ length: size }, () => Array(size).fill(null)),
    moves: [],
    showCoords: true,
    showHints: true,
    hover: null,
    mode: "PVP",
    human: "B",
    aiLevel: 1,
    aiThinking: false,
    // 网络相关
    network: {
      mode: 'offline', // 'offline' | 'online'
      role: null,      // 'host' | 'guest'
      connected: false,
      roomId: null,
      localSide: 'B',  // 本地玩家执子（主机黑，客机白）
    }
  };
}

let state = createState(15, "B");

function cellToLabel(r, c) {
  const col = String.fromCharCode("A".charCodeAt(0) + c);
  return `${col}${r + 1}`;
}

function nextPlayer(p) {
  return p === "B" ? "W" : "B";
}

function aiPlayer() {
  return nextPlayer(state.human);
}

function isAITurn() {
  return state.mode === "AI" && !state.winner && state.turn === aiPlayer();
}

async function maybeAIMove() {
  if (!isAITurn()) return;
  if (state.aiThinking) return;
  state.aiThinking = true;
  updateUI();
  draw();
  await new Promise((r) => setTimeout(r, 30));
  try {
    const m = pickAIMove();
    if (m) placeInternal(m.r, m.c);
  } finally {
    state.aiThinking = false;
    updateUI();
    draw();
  }
}

// 更新游戏模式UI（显示/隐藏相关控件）
function updateGameModeUI() {
  const gameMode = gameModeEl?.value ?? "PVP";

  // 联机面板显示/隐藏
  if (onlinePanel) {
    onlinePanel.style.display = gameMode === 'ONLINE' ? 'block' : 'none';
  }

  // 联机模式下禁用一些本地设置
  const disableLocalSettings = gameMode === 'ONLINE';

  if (firstPlayerEl) firstPlayerEl.disabled = disableLocalSettings;
  if (boardSizeEl) boardSizeEl.disabled = disableLocalSettings;
  if (humanSideEl) humanSideEl.disabled = disableLocalSettings;
  if (aiLevelEl) aiLevelEl.disabled = disableLocalSettings;

  // 更新状态文本
  if (gameMode === 'ONLINE') {
    // 如果是联机模式，设置网络模式
    state.network.mode = 'online';
    if (state.network.connected) {
      statusEl.textContent = `联机模式 - 已连接`;
    } else {
      statusEl.textContent = `联机模式 - 未连接`;
    }
  } else {
    // 非联机模式
    state.network.mode = 'offline';
    // 状态文本会在updateUI中更新
  }
}

function resetGame({ size = state.size, first = state.first } = {}) {
  const gameMode = gameModeEl?.value ?? "PVP";

  // 如果是联机模式，棋盘设置由主机决定
  if (gameMode === 'ONLINE' && state.network.connected) {
    // 在网络模式下，保持当前网络状态
    const networkState = state.network;
    state = createState(size, first);
    state.network = networkState;

    // 联机模式下，本地玩家执子由角色决定
    if (state.network.role === 'host') {
      state.human = 'B'; // 主机执黑
      state.first = 'B'; // 黑先
    } else if (state.network.role === 'guest') {
      state.human = 'W'; // 客机执白
      state.first = 'B'; // 黑先（主机先走）
    }
  } else {
    // 非联机模式，正常重置
    state = createState(size, first);
    state.showCoords = toggleCoordsEl.checked;
    state.showHints = toggleHintsEl.checked;
    state.mode = gameMode;
    state.human = humanSideEl?.value ?? "B";
    state.aiLevel = Number(aiLevelEl?.value ?? 1);
  }

  // 更新模式
  state.mode = gameMode;

  updateUI();
  draw();

  // 只有非联机模式才触发AI思考
  if (state.mode === 'AI') {
    maybeAIMove();
  }
}

// ===================== Drawing =====================

function boardGeometry() {
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

function drawBoard() {
  const { padding, gap, grid } = boardGeometry();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const g = ctx.createRadialGradient(
    canvas.width * 0.35, canvas.height * 0.25, 120,
    canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.9
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

function drawCoords() {
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

function drawStone(r, c, p) {
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
    const g = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 2, x, y, radius * 1.15);
    g.addColorStop(0, "rgba(255,255,255,.14)");
    g.addColorStop(0.25, "#1a1f2a");
    g.addColorStop(1, COLORS.black);
    ctx.fillStyle = g;
  } else {
    const g = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.25, 2, x, y, radius * 1.15);
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

function drawHoverHint() {
  if (!state.showHints || state.winner || !state.hover) return;
  const { r, c } = state.hover;
  if (state.board[r][c]) return;
  const { gap } = boardGeometry();
  const { x, y } = cellCenter(r, c);
  const radius = gap * 0.40;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = state.turn === "B" ? "rgba(16,19,24,.75)" : "rgba(245,247,255,.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWinningLine() {
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

function draw() {
  drawBoard();
  if (state.winningLine) drawWinningLine();
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      const p = state.board[r][c];
      if (p) drawStone(r, c, p);
    }
  }
  drawHoverHint();
}

// ===================== Game Logic =====================

function inBounds(r, c) {
  return r >= 0 && c >= 0 && r < state.size && c < state.size;
}

function checkWinFrom(r, c, p) {
  const dirs = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: -1 },
  ];
  for (const { dr, dc } of dirs) {
    let line = [{ r, c }];
    for (let k = 1; k < 5; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      if (!inBounds(rr, cc) || state.board[rr][cc] !== p) break;
      line.push({ r: rr, c: cc });
    }
    for (let k = 1; k < 5; k++) {
      const rr = r - dr * k, cc = c - dc * k;
      if (!inBounds(rr, cc) || state.board[rr][cc] !== p) break;
      line.unshift({ r: rr, c: cc });
    }
    if (line.length >= 5) {
      const idx = line.findIndex((x) => x.r === r && x.c === c);
      const start = clamp(idx - 4, 0, line.length - 5);
      return line.slice(start, start + 5);
    }
  }
  return null;
}

function placeInternal(r, c) {
  if (state.winner) return;
  if (state.board[r][c]) return;
  const p = state.turn;
  state.board[r][c] = p;
  state.moves.push({ r, c, p });
  const winLine = checkWinFrom(r, c, p);
  if (winLine) {
    state.winner = p;
    state.winningLine = winLine;
  } else {
    state.turn = nextPlayer(state.turn);
  }
  updateUI();
  draw();
}

function place(r, c) {
  // 检查是否可以落子
  if (state.mode === "AI" && state.turn !== state.human) return;
  if (state.aiThinking) return;

  // 联机模式检查
  if (state.mode === "ONLINE") {
    if (!state.network.connected) {
      alert('未连接到对手，无法落子');
      return;
    }
    // 检查是否是本地玩家的回合
    if (state.turn !== state.human) {
      return; // 不是本地回合，不能落子
    }
  }

  placeInternal(r, c);

  // 如果是联机模式，发送落子消息
  if (state.mode === "ONLINE" && state.network.connected && window.gomokuNetwork) {
    window.gomokuNetwork.sendMove(r, c, state.turn);
  }

  // AI模式才需要触发AI思考
  if (state.mode === "AI") {
    maybeAIMove();
  }
}

function undo() {
  if (state.moves.length === 0 || state.aiThinking) return;

  // 联机模式检查
  if (state.mode === "ONLINE") {
    if (!state.network.connected) {
      alert('未连接到对手，无法悔棋');
      return;
    }
  }

  let steps = 1;
  if (state.mode === "AI") {
    doUndoOne();
    if (state.moves.length > 0 && state.turn !== state.human && !state.winner) {
      doUndoOne();
      steps = 2;
    }
  } else if (state.mode === "ONLINE") {
    // 联机模式：悔棋两步（自己和对手的最后一步）
    doUndoOne();
    if (state.moves.length > 0 && !state.winner) {
      doUndoOne();
      steps = 2;
    }
  } else {
    // 本地双人：只悔棋一步
    doUndoOne();
  }

  // 如果是联机模式，发送悔棋消息
  if (state.mode === "ONLINE" && state.network.connected && window.gomokuNetwork) {
    window.gomokuNetwork.sendUndo();
  }

  updateUI();
  draw();
}

function doUndoOne() {
  if (state.moves.length === 0) return;
  const last = state.moves.pop();
  state.board[last.r][last.c] = null;
  state.winner = null;
  state.winningLine = null;
  state.turn = last.p;
}

function updateUI() {
  const t = state.turn === "B" ? "\u9ed1" : "\u767d";
  const w = state.winner ? (state.winner === "B" ? "\u9ed1" : "\u767d") : null;

  // 基础状态
  let statusText = '';
  if (state.winner) {
    statusText = `\u80dc\u8d1f\u5df2\u5206\uff1a${w}\u65b9\u83b7\u80dc`;
  } else if (state.aiThinking) {
    statusText = `\u7535\u8111\u601d\u8003\u4e2d\u2026\uff08\u8f6e\u5230\uff1a${t}\u65b9\uff09`;
  } else {
    statusText = `\u8f6e\u5230\uff1a${t}\u65b9`;
  }

  // 添加联机状态信息
  if (state.mode === "ONLINE") {
    const roleText = state.network.role === 'host' ? '主机' : (state.network.role === 'guest' ? '客机' : '');
    const connText = state.network.connected ? '已连接' : '未连接';
    statusText += ` | 联机${roleText ? `(${roleText})` : ''} - ${connText}`;
  }

  statusEl.textContent = statusText;
  btnUndo.disabled = state.moves.length === 0 || state.aiThinking;
  moveCountEl.textContent = String(state.moves.length);
  const last = state.moves[state.moves.length - 1];
  lastMoveEl.textContent = last ? `${last.p === "B" ? "\u9ed1" : "\u767d"} @ ${cellToLabel(last.r, last.c)}` : "-";
  winnerEl.textContent = w ?? "-";
}

// ===================== AI Engine =====================

// Window-of-5 score table: index = count of same-color stones in a
// contiguous window of 5 cells that contains NO opponent stones.
const W5 = [0, 1, 15, 400, 15000, 1000000];

function boardEmpty() {
  return state.moves.length === 0;
}

function centerCell() {
  const mid = Math.floor(state.size / 2);
  return { r: mid, c: mid };
}

function wouldWin(r, c, p) {
  state.board[r][c] = p;
  const win = checkWinFrom(r, c, p);
  state.board[r][c] = null;
  return win;
}

// Full board evaluation from AI's perspective.
// Scans every possible window of 5 cells in all 4 directions.
function evaluateBoard() {
  const size = state.size;
  const board = state.board;
  const ai = aiPlayer();
  const opp = state.human;
  let score = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Horizontal
      if (c + 4 < size) {
        let a = 0, o = 0;
        for (let k = 0; k < 5; k++) { const v = board[r][c + k]; if (v === ai) a++; else if (v === opp) o++; }
        if (a > 0 && o === 0) score += W5[a];
        else if (o > 0 && a === 0) score -= W5[o];
      }
      // Vertical
      if (r + 4 < size) {
        let a = 0, o = 0;
        for (let k = 0; k < 5; k++) { const v = board[r + k][c]; if (v === ai) a++; else if (v === opp) o++; }
        if (a > 0 && o === 0) score += W5[a];
        else if (o > 0 && a === 0) score -= W5[o];
      }
      // Diagonal down-right
      if (r + 4 < size && c + 4 < size) {
        let a = 0, o = 0;
        for (let k = 0; k < 5; k++) { const v = board[r + k][c + k]; if (v === ai) a++; else if (v === opp) o++; }
        if (a > 0 && o === 0) score += W5[a];
        else if (o > 0 && a === 0) score -= W5[o];
      }
      // Diagonal down-left
      if (r + 4 < size && c >= 4) {
        let a = 0, o = 0;
        for (let k = 0; k < 5; k++) { const v = board[r + k][c - k]; if (v === ai) a++; else if (v === opp) o++; }
        if (a > 0 && o === 0) score += W5[a];
        else if (o > 0 && a === 0) score -= W5[o];
      }
    }
  }
  return score;
}

// Fast per-cell heuristic used for move ordering.
// Counts consecutive stones + open ends after virtually placing at (r,c).
function quickMoveScore(r, c, player) {
  const size = state.size;
  const board = state.board;
  let total = 0;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (const [dr, dc] of dirs) {
    let cnt = 1;
    let openEnds = 0;
    for (let k = 1; k <= 4; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) break;
      if (board[rr][cc] === player) cnt++;
      else { if (!board[rr][cc]) openEnds++; break; }
    }
    for (let k = 1; k <= 4; k++) {
      const rr = r - dr * k, cc = c - dc * k;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) break;
      if (board[rr][cc] === player) cnt++;
      else { if (!board[rr][cc]) openEnds++; break; }
    }

    if (cnt >= 5) total += 10000000;
    else if (cnt === 4) total += openEnds === 2 ? 1000000 : openEnds === 1 ? 100000 : 0;
    else if (cnt === 3) total += openEnds === 2 ? 50000 : openEnds === 1 ? 8000 : 0;
    else if (cnt === 2) total += openEnds === 2 ? 3000 : openEnds === 1 ? 500 : 0;
    else total += openEnds === 2 ? 200 : openEnds === 1 ? 50 : 0;
  }
  return total;
}

// Generate candidate moves (near existing stones) ordered by heuristic score.
// Scans state.board directly so it works correctly during search.
function genOrderedCandidates(currentPlayer, limit) {
  const size = state.size;
  const board = state.board;
  const opp = nextPlayer(currentPlayer);
  const set = new Set();
  let hasStones = false;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!board[r][c]) continue;
      hasStones = true;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          if (board[rr][cc]) continue;
          set.add(rr * size + cc);
        }
      }
    }
  }

  if (!hasStones) return [centerCell()];

  const cands = [];
  for (const key of set) {
    const r = Math.floor(key / size), c = key % size;
    const atk = quickMoveScore(r, c, currentPlayer);
    const def = quickMoveScore(r, c, opp);
    cands.push({ r, c, score: atk + def * 1.1 });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, limit);
}

// Alpha-beta minimax. Returns score from AI's perspective.
function alphaBeta(depth, alpha, beta, isMax) {
  if (depth === 0) return evaluateBoard();

  const ai = aiPlayer();
  const opp = state.human;
  const player = isMax ? ai : opp;
  const cands = genOrderedCandidates(player, isMax ? 12 : 10);

  if (cands.length === 0) return evaluateBoard();

  if (isMax) {
    let best = -Infinity;
    for (const { r, c } of cands) {
      state.board[r][c] = player;
      let val;
      if (checkWinFrom(r, c, player)) val = 10000000 + depth;
      else val = alphaBeta(depth - 1, alpha, beta, false);
      state.board[r][c] = null;
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { r, c } of cands) {
      state.board[r][c] = player;
      let val;
      if (checkWinFrom(r, c, player)) val = -10000000 - depth;
      else val = alphaBeta(depth - 1, alpha, beta, true);
      state.board[r][c] = null;
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

// Top-level AI move picker.
function pickAIMove() {
  const ai = aiPlayer();
  const opp = state.human;

  if (boardEmpty()) return centerCell();

  const allCands = genOrderedCandidates(ai, 25);

  // 1) Immediate win
  for (const m of allCands) {
    if (wouldWin(m.r, m.c, ai)) return m;
  }
  // 2) Block opponent's immediate win
  for (const m of allCands) {
    if (wouldWin(m.r, m.c, opp)) return m;
  }

  const level = state.aiLevel;

  // Easy: random pick from top 8 heuristic candidates
  if (level === 1) {
    const pool = allCands.slice(0, Math.min(8, allCands.length));
    return pool[Math.floor(Math.random() * pool.length)] ?? allCands[0];
  }

  // Medium: depth 4 | Hard: depth 6
  const depth = level === 2 ? 4 : 6;
  const searchCands = allCands.slice(0, level === 2 ? 12 : 15);

  let bestMove = searchCands[0];
  let bestVal = -Infinity;
  let alpha = -Infinity;

  for (const m of searchCands) {
    state.board[m.r][m.c] = ai;
    let val;
    if (checkWinFrom(m.r, m.c, ai)) {
      val = 10000000 + depth;
    } else {
      val = alphaBeta(depth - 1, alpha, Infinity, false);
    }
    state.board[m.r][m.c] = null;
    if (val > bestVal) {
      bestVal = val;
      bestMove = m;
    }
    alpha = Math.max(alpha, bestVal);
  }
  return bestMove;
}

// ===================== Event Handlers =====================

function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((evt.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

canvas.addEventListener("mousemove", (evt) => {
  const { x, y } = canvasPoint(evt);
  state.hover = posToCell(x, y);
  draw();
});
canvas.addEventListener("mouseleave", () => { state.hover = null; draw(); });
canvas.addEventListener("click", (evt) => {
  const { x, y } = canvasPoint(evt);
  const cell = posToCell(x, y);
  if (cell) place(cell.r, cell.c);
});

btnUndo.addEventListener("click", () => undo());
btnRestart.addEventListener("click", () => {
  // 联机模式：只有主机可以重开，并且发送重开消息
  if (state.mode === "ONLINE" && state.network.connected && window.gomokuNetwork) {
    if (state.network.role !== 'host') {
      alert('只有主机可以重新开始游戏');
      return;
    }
    // 发送重开消息
    window.gomokuNetwork.sendReset(state.size, state.first);
  }
  resetGame();
});

firstPlayerEl.addEventListener("change", () => {
  resetGame({ first: firstPlayerEl.value });
});
boardSizeEl.addEventListener("change", () => {
  resetGame({ size: Number(boardSizeEl.value) });
});
gameModeEl?.addEventListener("change", () => {
  updateGameModeUI();
  resetGame();
});
humanSideEl?.addEventListener("change", () => resetGame());
aiLevelEl?.addEventListener("change", () => {
  state.aiLevel = Number(aiLevelEl.value);
  updateUI();
});
toggleCoordsEl.addEventListener("change", () => { state.showCoords = toggleCoordsEl.checked; draw(); });
toggleHintsEl.addEventListener("change", () => { state.showHints = toggleHintsEl.checked; draw(); });

// 联机面板事件
if (btnCreateRoom) {
  btnCreateRoom.addEventListener("click", () => {
    handleCreateRoom();
  });
}

if (btnCopyLink) {
  btnCopyLink.addEventListener("click", () => {
    copyShareLink();
  });
}

if (btnDisconnect) {
  btnDisconnect.addEventListener("click", () => {
    handleDisconnectClick();
  });
}

// 解析URL参数
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  return room ? room.toUpperCase() : null;
}

// 生成分享链接
function generateShareLink(roomId) {
  const baseUrl = window.location.href.split('?')[0];
  return `${baseUrl}?room=${roomId}`;
}

// 复制分享链接
function copyShareLink() {
  const link = shareLinkInput.value;
  if (!link) return;

  navigator.clipboard.writeText(link).then(() => {
    // 复制成功反馈
    btnCopyLink.textContent = '已复制!';
    setTimeout(() => {
      btnCopyLink.textContent = '复制';
    }, 2000);
  }).catch(err => {
    console.error('复制失败:', err);
    alert('复制失败，请手动复制链接');
  });
}

// 自动加入房间（从URL参数）
function autoJoinRoom(roomId) {
  if (!window.gomokuNetwork) {
    console.error('网络模块未加载');
    return;
  }

  // 切换到联机模式
  if (gameModeEl.value !== 'ONLINE') {
    gameModeEl.value = 'ONLINE';
    updateGameModeUI();
  }

  // 隐藏创建房间按钮，显示等待状态
  if (connectSection) connectSection.style.display = 'none';

  // 等待PeerJS初始化完成后加入
  const tryJoin = () => {
    if (window.gomokuNetwork.myPeerId) {
      window.gomokuNetwork.joinRoom(roomId);
      state.network.role = 'guest';
      updateUI();
    } else {
      setTimeout(tryJoin, 200);
    }
  };
  tryJoin();
}

// 处理创建房间
function handleCreateRoom() {
  if (!window.gomokuNetwork) {
    alert('网络模块未加载');
    return;
  }

  // 调用创建房间（结果通过onRoomCreated回调处理）
  window.gomokuNetwork.createRoom();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "z" || e.key === "Z") undo();
  if (e.key === "r" || e.key === "R") resetGame();
});

// 初始化网络模块
function initNetwork() {
  if (!window.gomokuNetwork) {
    console.error('网络模块未加载');
    return;
  }

  // 初始化网络模块
  window.gomokuNetwork.init({
    onMove: (r, c, playerSide) => {
      // 收到对手落子
      if (state.network.connected && state.turn !== state.human) {
        placeInternal(r, c);
      }
    },
    onUndo: () => {
      // 收到对手悔棋
      if (state.network.connected) {
        undo();
      }
    },
    onReset: (size, first) => {
      // 收到对手重开
      if (state.network.connected) {
        resetGame({ size, first });
      }
    },
    onConnectionChange: (connected) => {
      // 连接状态变化
      state.network.connected = connected;
      updateGameModeUI();
      updateUI();

      if (connected) {
        // 连接成功，更新角色
        state.network.role = window.gomokuNetwork.isHost ? 'host' : 'guest';
        state.network.roomId = window.gomokuNetwork.getRoomId();

        // 更新UI
        if (btnDisconnect) btnDisconnect.style.display = 'block';
        if (roomIdDisplayEl) roomIdDisplayEl.textContent = state.network.roomId;

        // 重置游戏（联机模式）
        resetGame();
      } else {
        // 断开连接
        if (btnDisconnect) btnDisconnect.style.display = 'none';
        // 显示创建房间按钮（主机）或提示（客机）
        if (state.network.role === 'host') {
          linkSection.style.display = 'block';
        } else {
          connectSection.style.display = 'block';
        }
      }
    },
    onRoomCreated: (roomId) => {
      // 房间创建完成
      state.network.roomId = roomId;
      state.network.role = 'host';

      // 生成并显示分享链接
      const shareLink = generateShareLink(roomId);
      shareLinkInput.value = shareLink;
      linkSection.style.display = 'block';
      connectSection.style.display = 'none';

      updateUI();
    },
    onError: (err) => {
      console.error('网络错误:', err);
      alert('网络错误: ' + (err.message || err.type || err));
    },
    statusEl: connectionStatusEl,
    roomIdDisplayEl: roomIdDisplayEl,
    opponentInfoEl: opponentInfoEl
  });

  console.log('网络模块初始化完成');
}

// 处理断开连接按钮点击
function handleDisconnectClick() {
  if (!window.gomokuNetwork) return;

  window.gomokuNetwork.disconnect();
  state.network.connected = false;
  state.network.role = null;
  state.network.roomId = null;

  if (btnDisconnect) btnDisconnect.style.display = 'none';
  if (roomIdDisplayEl) roomIdDisplayEl.textContent = '-';
  if (opponentInfoEl) opponentInfoEl.textContent = '-';
  if (linkSection) linkSection.style.display = 'none';
  if (connectSection) connectSection.style.display = 'block';

  // 清除URL参数
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  // 切换回本地模式
  if (gameModeEl.value === 'ONLINE') {
    gameModeEl.value = 'PVP';
    updateGameModeUI();
    resetGame();
  }
}

function init() {
  toggleCoordsEl.checked = true;
  toggleHintsEl.checked = true;
  firstPlayerEl.value = "B";
  boardSizeEl.value = "15";
  gameModeEl.value = "PVP";
  humanSideEl.value = "B";
  aiLevelEl.value = "1";

  // 初始化网络
  initNetwork();

  // 更新游戏模式UI
  updateGameModeUI();

  // 检测URL参数，自动加入房间
  const roomId = parseUrlParams();
  if (roomId) {
    // 有房间参数，自动切换到联机模式并加入
    console.log('检测到房间参数:', roomId);
    autoJoinRoom(roomId);
  } else {
    // 正常初始化
    resetGame({ size: 15, first: "B" });
  }
}

init();
