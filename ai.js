import { getState, nextPlayer } from "./state.js";

const W5 = [0, 1, 15, 400, 15000, 1000000];

export function createAI({ game } = {}) {
  if (!game) throw new Error("createAI: missing game");

  function aiPlayer() {
    const state = getState();
    return nextPlayer(state.human);
  }

  function boardEmpty() {
    return getState().moves.length === 0;
  }

  function centerCell() {
    const state = getState();
    const mid = Math.floor(state.size / 2);
    return { r: mid, c: mid };
  }

  function wouldWin(r, c, p) {
    const state = getState();
    state.board[r][c] = p;
    const win = game.checkWinFrom(r, c, p);
    state.board[r][c] = null;
    return win;
  }

  function evaluateBoard() {
    const state = getState();
    const size = state.size;
    const board = state.board;
    const ai = aiPlayer();
    const opp = state.human;
    let score = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (c + 4 < size) {
          let a = 0,
            o = 0;
          for (let k = 0; k < 5; k++) {
            const v = board[r][c + k];
            if (v === ai) a++;
            else if (v === opp) o++;
          }
          if (a > 0 && o === 0) score += W5[a];
          else if (o > 0 && a === 0) score -= W5[o];
        }

        if (r + 4 < size) {
          let a = 0,
            o = 0;
          for (let k = 0; k < 5; k++) {
            const v = board[r + k][c];
            if (v === ai) a++;
            else if (v === opp) o++;
          }
          if (a > 0 && o === 0) score += W5[a];
          else if (o > 0 && a === 0) score -= W5[o];
        }

        if (r + 4 < size && c + 4 < size) {
          let a = 0,
            o = 0;
          for (let k = 0; k < 5; k++) {
            const v = board[r + k][c + k];
            if (v === ai) a++;
            else if (v === opp) o++;
          }
          if (a > 0 && o === 0) score += W5[a];
          else if (o > 0 && a === 0) score -= W5[o];
        }

        if (r + 4 < size && c >= 4) {
          let a = 0,
            o = 0;
          for (let k = 0; k < 5; k++) {
            const v = board[r + k][c - k];
            if (v === ai) a++;
            else if (v === opp) o++;
          }
          if (a > 0 && o === 0) score += W5[a];
          else if (o > 0 && a === 0) score -= W5[o];
        }
      }
    }

    return score;
  }

  function quickMoveScore(r, c, player) {
    const state = getState();
    const size = state.size;
    const board = state.board;
    let total = 0;
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (const [dr, dc] of dirs) {
      let cnt = 1;
      let openEnds = 0;
      for (let k = 1; k <= 4; k++) {
        const rr = r + dr * k,
          cc = c + dc * k;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) break;
        if (board[rr][cc] === player) cnt++;
        else {
          if (!board[rr][cc]) openEnds++;
          break;
        }
      }
      for (let k = 1; k <= 4; k++) {
        const rr = r - dr * k,
          cc = c - dc * k;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) break;
        if (board[rr][cc] === player) cnt++;
        else {
          if (!board[rr][cc]) openEnds++;
          break;
        }
      }

      if (cnt >= 5) total += 10000000;
      else if (cnt === 4) total += openEnds === 2 ? 1000000 : openEnds === 1 ? 100000 : 0;
      else if (cnt === 3) total += openEnds === 2 ? 50000 : openEnds === 1 ? 8000 : 0;
      else if (cnt === 2) total += openEnds === 2 ? 3000 : openEnds === 1 ? 500 : 0;
      else total += openEnds === 2 ? 200 : openEnds === 1 ? 50 : 0;
    }
    return total;
  }

  function genOrderedCandidates(currentPlayer, limit) {
    const state = getState();
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
            const rr = r + dr,
              cc = c + dc;
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
      const r = Math.floor(key / size),
        c = key % size;
      const atk = quickMoveScore(r, c, currentPlayer);
      const def = quickMoveScore(r, c, opp);
      cands.push({ r, c, score: atk + def * 1.1 });
    }
    cands.sort((a, b) => b.score - a.score);
    return cands.slice(0, limit);
  }

  function isForbiddenMoveForAI(r, c, player) {
    const state = getState();
    // 拍板：禁手只约束黑棋；且当 AI 执黑且禁手开启时必须约束
    if (!state.forbidden) return false;
    if (player !== "B") return false;
    const forbidden = game.checkForbiddenAt(r, c, "B");
    return !!forbidden;
  }

  function alphaBeta(depth, alpha, beta, isMax) {
    if (depth === 0) return evaluateBoard();

    const state = getState();
    const ai = aiPlayer();
    const opp = state.human;
    const player = isMax ? ai : opp;
    const cands = genOrderedCandidates(player, isMax ? 12 : 10);
    if (cands.length === 0) return evaluateBoard();

    if (isMax) {
      let best = -Infinity;
      for (const { r, c } of cands) {
        if (!state.board[r][c] && isForbiddenMoveForAI(r, c, player)) continue;
        state.board[r][c] = player;
        let val;
        if (game.checkWinFrom(r, c, player)) val = 10000000 + depth;
        else val = alphaBeta(depth - 1, alpha, beta, false);
        state.board[r][c] = null;
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (beta <= alpha) break;
      }
      return best;
    }

    let best = Infinity;
    for (const { r, c } of cands) {
      if (!state.board[r][c] && isForbiddenMoveForAI(r, c, player)) continue;
      state.board[r][c] = player;
      let val;
      if (game.checkWinFrom(r, c, player)) val = -10000000 - depth;
      else val = alphaBeta(depth - 1, alpha, beta, true);
      state.board[r][c] = null;
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }

  function pickAIMove() {
    const state = getState();
    const ai = aiPlayer();
    const opp = state.human;

    if (boardEmpty()) return centerCell();

    const allCands = genOrderedCandidates(ai, 25).filter(
      (m) => !isForbiddenMoveForAI(m.r, m.c, ai),
    );
    if (allCands.length === 0) return null;

    for (const m of allCands) {
      if (wouldWin(m.r, m.c, ai)) return m;
    }
    for (const m of allCands) {
      if (wouldWin(m.r, m.c, opp)) return m;
    }

    const level = state.aiLevel;
    if (level === 1) {
      const pool = allCands.slice(0, Math.min(8, allCands.length));
      return pool[Math.floor(Math.random() * pool.length)] ?? allCands[0];
    }

    const depth = level === 2 ? 4 : 6;
    const searchCands = allCands.slice(0, level === 2 ? 12 : 15);

    let bestMove = searchCands[0];
    let bestVal = -Infinity;
    let alpha = -Infinity;

    for (const m of searchCands) {
      state.board[m.r][m.c] = ai;
      let val;
      if (game.checkWinFrom(m.r, m.c, ai)) val = 10000000 + depth;
      else val = alphaBeta(depth - 1, alpha, Infinity, false);
      state.board[m.r][m.c] = null;
      if (val > bestVal) {
        bestVal = val;
        bestMove = m;
      }
      alpha = Math.max(alpha, bestVal);
    }

    return bestMove;
  }

  async function maybeAIMove() {
    const state = getState();
    const ai = aiPlayer();
    if (state.mode !== "AI" || state.winner) return;
    if (state.turn !== ai) return;
    if (state.aiThinking) return;

    state.aiThinking = true;
    game.updateUI();
    game.draw();
    await new Promise((r) => setTimeout(r, 30));
    try {
      const m = pickAIMove();
      if (m) game.placeInternal(m.r, m.c);
    } finally {
      state.aiThinking = false;
      game.updateUI();
      game.draw();
    }
  }

  return {
    pickAIMove,
    maybeAIMove,
    aiPlayer,
  };
}

