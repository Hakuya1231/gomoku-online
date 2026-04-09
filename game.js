import { cellToLabel, createState, getState, nextPlayer, setState } from "./state.js";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function createGame({ elements, renderer, network, maybeAIMove } = {}) {
  if (!elements) throw new Error("createGame: missing elements");
  if (!renderer) throw new Error("createGame: missing renderer");

  const {
    statusEl,
    subtitleEl,
    moveCountEl,
    lastMoveEl,
    winnerEl,
    boardSizeEl,
    toggleCoordsEl,
    toggleHintsEl,
    toggleForbiddenEl,
    gameModeEl,
    humanSideEl,
    aiLevelEl,
    onlinePanel,
    connectionStatusEl,
  } = elements;

  function updateSubtitle() {
    if (!subtitleEl) return;
    const state = getState();
    const gameMode = state.mode;
    const size = state.size;

    let modeText = "";
    if (gameMode === "PVP") modeText = "本地双人对战";
    else if (gameMode === "AI") modeText = "人机对战";
    else if (gameMode === "ONLINE") {
      if (state.network.role === "spectator") modeText = "观战模式";
      else modeText = "联机对战";
    }

    subtitleEl.textContent = `${modeText} · ${size}×${size}`;
  }

  function updateGameModeUI() {
    const state = getState();
    const gameMode = gameModeEl?.value ?? "PVP";
    state.mode = gameMode;

    if (onlinePanel) {
      onlinePanel.style.display = gameMode === "ONLINE" ? "block" : "none";
    }

    const disableLocalSettings = gameMode === "ONLINE" && state.network.connected;
    if (boardSizeEl) boardSizeEl.disabled = disableLocalSettings;
    if (humanSideEl) {
      humanSideEl.disabled =
        disableLocalSettings || (gameMode === "ONLINE" && state.network.role === "guest");
    }
    if (aiLevelEl) aiLevelEl.disabled = gameMode === "ONLINE";

    if (gameMode === "ONLINE") {
      state.network.mode = "online";
      if (connectionStatusEl) {
        connectionStatusEl.textContent = state.network.connected ? "已连接" : "未连接";
      }
      if (statusEl) statusEl.textContent = state.network.connected ? "联机模式 - 已连接" : "联机模式 - 未连接";
    } else {
      state.network.mode = "offline";
    }

    updateSubtitle();
  }

  function updateUI() {
    const state = getState();
    const t = state.turn === "B" ? "黑" : "白";
    const w = state.winner ? (state.winner === "B" ? "黑" : "白") : null;

    let statusText = "";
    if (state.winner) statusText = `胜负已分：${w}方获胜`;
    else if (state.aiThinking) statusText = `电脑思考中…（轮到：${t}方）`;
    else statusText = `轮到：${t}方`;

    if (state.mode === "ONLINE") {
      const roleText =
        state.network.role === "host"
          ? "主机"
          : state.network.role === "guest"
            ? "客机"
            : state.network.role === "spectator"
              ? "观战者"
              : "";
      const connText = state.network.connected ? "已连接" : "未连接";
      statusText += ` | 联机${roleText ? `(${roleText})` : ""} - ${connText}`;
    }
    if (statusEl) statusEl.textContent = statusText;

    if (moveCountEl) moveCountEl.textContent = String(state.moves.length);
    const last = state.moves[state.moves.length - 1];
    if (lastMoveEl) {
      lastMoveEl.textContent = last ? `${last.p === "B" ? "黑" : "白"} @ ${cellToLabel(last.r, last.c)}` : "-";
    }
    if (winnerEl) winnerEl.textContent = w ?? "-";
  }

  function inBounds(r, c) {
    const state = getState();
    return r >= 0 && c >= 0 && r < state.size && c < state.size;
  }

  function checkWinFrom(r, c, p) {
    const state = getState();
    const dirs = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 },
      { dr: 1, dc: 1 },
      { dr: 1, dc: -1 },
    ];
    for (const { dr, dc } of dirs) {
      const line = [{ r, c }];
      for (let k = 1; k < 5; k++) {
        const rr = r + dr * k,
          cc = c + dc * k;
        if (!inBounds(rr, cc) || state.board[rr][cc] !== p) break;
        line.push({ r: rr, c: cc });
      }
      for (let k = 1; k < 5; k++) {
        const rr = r - dr * k,
          cc = c - dc * k;
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

  function countPatternsInDirection(r, c, dr, dc, player) {
    const state = getState();
    const board = state.board;
    board[r][c] = player;

    const cells = [];
    for (let k = 5; k >= 1; k--) {
      const rr = r - dr * k,
        cc = c - dc * k;
      if (!inBounds(rr, cc)) cells.push("O");
      else if (board[rr][cc] === player) cells.push("P");
      else if (board[rr][cc] === null) cells.push("E");
      else cells.push("O");
    }
    cells.push("P");
    for (let k = 1; k <= 5; k++) {
      const rr = r + dr * k,
        cc = c + dc * k;
      if (!inBounds(rr, cc)) cells.push("O");
      else if (board[rr][cc] === player) cells.push("P");
      else if (board[rr][cc] === null) cells.push("E");
      else cells.push("O");
    }
    board[r][c] = null;

    const CURRENT_INDEX = 5;
    const result = { liveThree: 0, four: 0, overline: 0 };

    let leftConsec = 0,
      rightConsec = 0;
    for (let i = CURRENT_INDEX - 1; i >= 0 && cells[i] === "P"; i--) leftConsec++;
    for (let i = CURRENT_INDEX + 1; i <= 10 && cells[i] === "P"; i++) rightConsec++;
    const totalConsec = leftConsec + 1 + rightConsec;

    if (totalConsec >= 6) {
      result.overline = 1;
      return result;
    }
    if (totalConsec === 5) return result;

    if (totalConsec === 4) {
      const leftEndIdx = CURRENT_INDEX - leftConsec - 1;
      const rightEndIdx = CURRENT_INDEX + rightConsec + 1;
      const leftEmpty = leftEndIdx >= 0 && cells[leftEndIdx] === "E";
      const rightEmpty = rightEndIdx <= 10 && cells[rightEndIdx] === "E";
      if (leftEmpty || rightEmpty) result.four = 1;
    }

    const checkJumpFour = () => {
      if (cells[CURRENT_INDEX + 1] === "E") {
        let rightP = 0;
        for (let i = CURRENT_INDEX + 2; i <= 10 && cells[i] === "P"; i++) rightP++;
        if (leftConsec + 1 + rightP === 4) {
          const leftEnd = CURRENT_INDEX - leftConsec - 1;
          const jumpEnd = CURRENT_INDEX + 1 + rightP + 1;
          if ((leftEnd >= 0 && cells[leftEnd] === "E") || (jumpEnd <= 10 && cells[jumpEnd] === "E")) return true;
        }
      }

      if (cells[CURRENT_INDEX - 1] === "E") {
        let leftP = 0;
        for (let i = CURRENT_INDEX - 2; i >= 0 && cells[i] === "P"; i--) leftP++;
        if (leftP + 1 + rightConsec === 4) {
          const rightEnd = CURRENT_INDEX + rightConsec + 1;
          const jumpEnd = CURRENT_INDEX - 1 - leftP - 1;
          if ((rightEnd <= 10 && cells[rightEnd] === "E") || (jumpEnd >= 0 && cells[jumpEnd] === "E")) return true;
        }
      }

      for (let gapIdx = CURRENT_INDEX - 2; gapIdx >= CURRENT_INDEX - 4 && gapIdx >= 0; gapIdx--) {
        if (cells[gapIdx] !== "E") continue;
        let leftP = 0;
        for (let i = gapIdx - 1; i >= 0 && cells[i] === "P"; i--) leftP++;
        let middleP = 0;
        for (let i = gapIdx + 1; i < CURRENT_INDEX && cells[i] === "P"; i++) middleP++;
        if (leftP + middleP + 1 + rightConsec === 4) {
          const leftEnd = gapIdx - leftP - 1;
          const rightEnd = CURRENT_INDEX + rightConsec + 1;
          if ((leftEnd >= 0 && cells[leftEnd] === "E") || (rightEnd <= 10 && cells[rightEnd] === "E")) return true;
        }
      }

      for (let gapIdx = CURRENT_INDEX + 2; gapIdx <= CURRENT_INDEX + 4 && gapIdx <= 10; gapIdx++) {
        if (cells[gapIdx] !== "E") continue;
        let rightP = 0;
        for (let i = gapIdx + 1; i <= 10 && cells[i] === "P"; i++) rightP++;
        let middleP = 0;
        for (let i = gapIdx - 1; i > CURRENT_INDEX && cells[i] === "P"; i--) middleP++;
        if (leftConsec + 1 + middleP + rightP === 4) {
          const leftEnd = CURRENT_INDEX - leftConsec - 1;
          const rightEnd = gapIdx + rightP + 1;
          if ((leftEnd >= 0 && cells[leftEnd] === "E") || (rightEnd <= 10 && cells[rightEnd] === "E")) return true;
        }
      }
      return false;
    };
    if (result.four === 0 && checkJumpFour()) result.four = 1;

    if (totalConsec === 3) {
      const leftEndIdx = CURRENT_INDEX - leftConsec - 1;
      const rightEndIdx = CURRENT_INDEX + rightConsec + 1;
      if (leftEndIdx >= 0 && cells[leftEndIdx] === "E" && rightEndIdx <= 10 && cells[rightEndIdx] === "E") result.liveThree = 1;
    }

    const checkJumpLiveThree = () => {
      if (cells[CURRENT_INDEX + 1] === "P" && cells[CURRENT_INDEX + 2] === "E" && cells[CURRENT_INDEX + 3] === "P") {
        const leftEnd = CURRENT_INDEX - leftConsec - 1;
        const rightEnd = CURRENT_INDEX + 4;
        if (leftEnd >= 0 && cells[leftEnd] === "E" && rightEnd <= 10 && cells[rightEnd] === "E") return true;
      }
      if (cells[CURRENT_INDEX - 1] === "E" && cells[CURRENT_INDEX - 2] === "P" && cells[CURRENT_INDEX + 1] === "P") {
        const leftEnd = CURRENT_INDEX - 3;
        const rightEnd = CURRENT_INDEX + rightConsec + 2;
        if (leftEnd >= 0 && cells[leftEnd] === "E" && rightEnd <= 10 && cells[rightEnd] === "E") return true;
      }
      if (cells[CURRENT_INDEX + 1] === "E" && cells[CURRENT_INDEX + 2] === "P" && cells[CURRENT_INDEX + 3] === "P") {
        const leftEnd = CURRENT_INDEX - leftConsec - 1;
        const rightEnd = CURRENT_INDEX + 4;
        if (leftEnd >= 0 && cells[leftEnd] === "E" && rightEnd <= 10 && cells[rightEnd] === "E") return true;
      }
      if (cells[CURRENT_INDEX - 1] === "E" && cells[CURRENT_INDEX - 2] === "P" && cells[CURRENT_INDEX - 3] === "P") {
        const leftEnd = CURRENT_INDEX - 4;
        const rightEnd = CURRENT_INDEX + rightConsec + 1;
        if (leftEnd >= 0 && cells[leftEnd] === "E" && rightEnd <= 10 && cells[rightEnd] === "E") return true;
      }
      return false;
    };
    if (result.liveThree === 0 && checkJumpLiveThree()) result.liveThree = 1;

    return result;
  }

  function checkForbiddenAt(r, c, player = "B") {
    const state = getState();
    if (player !== "B") return null;

    const dirs = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 },
      { dr: 1, dc: 1 },
      { dr: 1, dc: -1 },
    ];

    let totalLiveThree = 0;
    let totalFour = 0;
    let hasOverline = false;
    let hasFive = false;

    for (const { dr, dc } of dirs) {
      const patterns = countPatternsInDirection(r, c, dr, dc, "B");
      totalLiveThree += patterns.liveThree;
      totalFour += patterns.four;
      if (patterns.overline) hasOverline = true;
    }

    const board = state.board;
    board[r][c] = "B";
    for (const { dr, dc } of dirs) {
      let count = 1;
      for (let k = 1; k <= 4; k++) {
        const rr = r + dr * k,
          cc = c + dc * k;
        if (!inBounds(rr, cc) || board[rr][cc] !== "B") break;
        count++;
      }
      for (let k = 1; k <= 4; k++) {
        const rr = r - dr * k,
          cc = c - dc * k;
        if (!inBounds(rr, cc) || board[rr][cc] !== "B") break;
        count++;
      }
      if (count === 5) {
        hasFive = true;
        break;
      }
    }
    board[r][c] = null;

    if (hasOverline) return "长连禁手";
    if (hasFive) return null;
    if (totalFour >= 2) return "四四禁手";
    if (totalLiveThree >= 2) return "三三禁手";
    return null;
  }

  function draw() {
    renderer.draw({ checkForbiddenAt });
  }

  function resetGame({ size } = {}) {
    const prev = getState();
    const nextSize = size ?? prev.size;
    const gameMode = gameModeEl?.value ?? "PVP";
    const first = "B";

    if (gameMode === "ONLINE" && prev.network.role) {
      const networkState = prev.network;
      const hostSide = prev.network.hostSide || "B";
      const next = createState(nextSize, first);
      next.network = networkState;
      next.network.hostSide = hostSide;
      // 联机模式下也必须保留禁手/显示等本地状态，否则 resetGame 会把禁手意外清零导致“该禁手但可落子”
      next.forbidden = !!prev.forbidden;
      next.showCoords = !!prev.showCoords;
      next.showHints = !!prev.showHints;

      if (next.network.role === "host") {
        next.human = hostSide;
        if (humanSideEl) humanSideEl.value = hostSide;
      } else if (next.network.role === "guest") {
        next.human = hostSide === "B" ? "W" : "B";
        if (humanSideEl) humanSideEl.value = next.human;
      } else if (next.network.role === "spectator") {
        next.human = null;
      }
      next.mode = gameMode;
      setState(next);
    } else {
      const next = createState(nextSize, first);
      next.showCoords = !!toggleCoordsEl?.checked;
      next.showHints = !!toggleHintsEl?.checked;
      next.forbidden = !!toggleForbiddenEl?.checked;
      next.mode = gameMode;
      next.human = humanSideEl?.value ?? "B";
      next.aiLevel = Number(aiLevelEl?.value ?? 1);
      setState(next);
    }

    const st = getState();
    st.mode = gameMode;
    updateSubtitle();
    updateUI();
    draw();

    if (st.mode === "AI" && typeof maybeAIMove === "function") {
      maybeAIMove();
    }
  }

  function placeInternal(r, c) {
    const state = getState();
    if (state.winner) return false;
    if (state.board[r][c]) return false;
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
    return true;
  }

  function placeRemote(r, c, playerSide) {
    const state = getState();
    if (!playerSide) return false;
    if (state.winner) return false;
    if (state.board[r][c]) return false;

    const p = playerSide;
    state.board[r][c] = p;
    state.moves.push({ r, c, p });
    const winLine = checkWinFrom(r, c, p);
    if (winLine) {
      state.winner = p;
      state.winningLine = winLine;
    } else {
      state.turn = nextPlayer(p);
    }
    updateUI();
    draw();
    return true;
  }

  function place(r, c) {
    const state = getState();
    if (state.mode === "AI" && state.turn !== state.human) return;
    if (state.aiThinking) return;

    if (state.mode === "ONLINE") {
      if (!state.network.connected) {
        alert("未连接到对手，无法落子");
        return;
      }
      if (state.network.role === "spectator") return;
      if (state.turn !== state.human) return;
    }

    if (state.forbidden && state.turn === "B") {
      const forbidden = checkForbiddenAt(r, c, "B");
      if (forbidden) return;
    }

    const placedSide = state.turn;
    const ok = placeInternal(r, c);
    if (!ok) return;

    if (state.mode === "ONLINE" && state.network.connected && network) {
      // playerSide 语义：刚落子的一方（后续 align-rules 也会覆盖校验）
      network.sendMove(r, c, placedSide);
    }

    if (state.mode === "AI" && typeof maybeAIMove === "function") {
      maybeAIMove();
    }
  }

  return {
    updateSubtitle,
    updateUI,
    updateGameModeUI,
    resetGame,
    draw,
    place,
    placeInternal,
    placeRemote,
    checkForbiddenAt,
    checkWinFrom,
  };
}

