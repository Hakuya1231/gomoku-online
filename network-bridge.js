import { getState, setState } from "./state.js";

export function createNetworkBridge({ elements, game, network } = {}) {
  if (!elements) throw new Error("createNetworkBridge: missing elements");
  if (!game) throw new Error("createNetworkBridge: missing game");
  if (!network) throw new Error("createNetworkBridge: missing network");

  const {
    gameModeEl,
    connectSection,
    linkSection,
    shareLinkInput,
    btnCopyLink,
    btnDisconnect,
    roomIdDisplayEl,
    opponentInfoEl,
    connectionStatusEl,
    boardSizeEl,
    toggleForbiddenEl,
    humanSideEl,
  } = elements;

  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    let room = params.get("room") || params.get("ROOM");
    if (!room) return null;

    if (room.includes("://") || room.includes("?")) {
      try {
        const url = new URL(room.startsWith("http") ? room : "https://" + room);
        const innerRoom = url.searchParams.get("room") || url.searchParams.get("ROOM");
        if (innerRoom) room = innerRoom;
      } catch {
        const match = room.match(/room=([A-Za-z0-9]+)/i);
        if (match) room = match[1];
      }
    }

    room = room.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return room.length >= 4 ? room : null;
  }

  function generateShareLink(roomId) {
    const baseUrl = window.location.href.split("?")[0];
    return `${baseUrl}?room=${roomId}`;
  }

  function copyShareLink() {
    const link = shareLinkInput?.value;
    if (!link) return;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        if (!btnCopyLink) return;
        const prev = btnCopyLink.textContent;
        btnCopyLink.textContent = "已复制!";
        setTimeout(() => {
          btnCopyLink.textContent = prev ?? "复制";
        }, 2000);
      })
      .catch((err) => {
        console.error("复制失败:", err);
        alert("复制失败，请手动复制链接");
      });
  }

  function autoJoinRoom(roomId) {
    if (!roomId) return;
    if (gameModeEl?.value !== "ONLINE") {
      gameModeEl.value = "ONLINE";
      game.updateGameModeUI();
    }
    if (connectSection) connectSection.style.display = "none";
    if (connectionStatusEl) connectionStatusEl.textContent = "正在连接...";
    network.joinRoom(roomId);
  }

  function handleCreateRoom() {
    network.createRoom();
  }

  function handleDisconnectClick() {
    network.disconnect();

    const state = getState();
    state.network.connected = false;
    state.network.role = null;
    state.network.roomId = null;

    if (btnDisconnect) btnDisconnect.style.display = "none";
    if (roomIdDisplayEl) roomIdDisplayEl.textContent = "-";
    if (opponentInfoEl) opponentInfoEl.textContent = "-";
    if (linkSection) linkSection.style.display = "none";
    if (connectSection) connectSection.style.display = "block";

    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (gameModeEl?.value === "ONLINE") {
      gameModeEl.value = "PVP";
      game.updateGameModeUI();
      game.resetGame();
    }
  }

  function initNetwork() {
    network.init({
      onMove: (r, c) => {
        const state = getState();
        if (!state.network.connected) return;
        // 对战/观战统一：收到落子就渲染
        game.placeInternal(r, c);
      },
      onReset: (size) => {
        const state = getState();
        if (!state.network.connected) return;
        game.resetGame({ size });
      },
      onBoardStateRequest: () => {
        const state = getState();
        if (state.network.role === "host") {
          network.sendBoardState(
            state.board,
            state.moves,
            state.turn,
            state.winner,
            state.winningLine,
          );
        }
      },
      onBoardState: (board, moves, turn, winner, winningLine) => {
        const state = getState();

        let boardArray = board;
        if (board && !Array.isArray(board)) {
          const size = state.size;
          boardArray = [];
          for (let r = 0; r < size; r++) {
            boardArray[r] = [];
            const row = board[r];
            for (let c = 0; c < size; c++) {
              boardArray[r][c] = row && row[c] ? row[c] : null;
            }
          }
        }

        let movesArray = moves;
        if (moves && !Array.isArray(moves)) movesArray = Object.values(moves);

        let winningLineArray = winningLine;
        if (winningLine && !Array.isArray(winningLine)) winningLineArray = Object.values(winningLine);

        state.board = boardArray ?? state.board;
        state.moves = movesArray || [];
        state.turn = turn;
        state.winner = winner;
        state.winningLine = winningLineArray;

        game.updateUI();
        game.draw();
      },
      onConnectionChange: (connected) => {
        const state = getState();
        state.network.connected = connected;
        if (connected) {
          // 先写入 role/roomId，再刷新 UI（否则 subtitle 可能用旧 role 渲染成“联机对战”而非“观战模式”）
          state.network.role = network.role;
          state.network.roomId = network.getRoomId();
        }

        game.updateGameModeUI();
        game.updateUI();

        if (connected) {

          if (btnDisconnect) btnDisconnect.style.display = "block";
          if (roomIdDisplayEl) roomIdDisplayEl.textContent = state.network.roomId;

          if (state.network.role === "host") {
            state.network.hostSide = humanSideEl?.value || "B";
            network.sendGameConfig(state.size, state.forbidden, state.network.hostSide);
            game.resetGame();
          } else if (state.network.role === "spectator") {
            // 观战只看，不重开
            game.updateUI();
          }
        } else {
          if (btnDisconnect) btnDisconnect.style.display = "none";
          if (state.network.role === "host") {
            if (linkSection) linkSection.style.display = "block";
          } else {
            if (connectSection) connectSection.style.display = "block";
          }
        }
      },
      onGameConfig: (size, forbidden, hostSide) => {
        const state = getState();
        if (state.network.role !== "guest") return;

        if (boardSizeEl) boardSizeEl.value = String(size);
        if (toggleForbiddenEl) toggleForbiddenEl.checked = !!forbidden;

        state.network.hostSide = hostSide || "B";

        game.resetGame({ size });
        state.forbidden = !!forbidden;
        game.updateGameModeUI();
        game.updateUI();
        game.draw();
      },
      onRoomCreated: (roomId) => {
        const state = getState();
        state.network.roomId = roomId;
        state.network.role = "host";
        state.network.hostSide = humanSideEl?.value || "B";

        const shareLink = generateShareLink(roomId);
        if (shareLinkInput) shareLinkInput.value = shareLink;
        if (linkSection) linkSection.style.display = "block";
        if (connectSection) connectSection.style.display = "none";
        game.updateUI();
      },
      onError: (err) => {
        console.error("网络错误:", err);
        alert("网络错误: " + (err?.message || err?.type || err));
      },
      statusEl: connectionStatusEl,
      roomIdDisplayEl,
      opponentInfoEl,
    });
  }

  return {
    parseUrlParams,
    generateShareLink,
    copyShareLink,
    autoJoinRoom,
    handleCreateRoom,
    handleDisconnectClick,
    initNetwork,
  };
}

