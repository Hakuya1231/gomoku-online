import { createAI } from "./ai.js";
import { createGame } from "./game.js";
import { createNetworkBridge } from "./network-bridge.js";
import { createGomokuNetwork } from "./network.js";
import { createRenderer } from "./renderer.js";
import { getState } from "./state.js";

const $ = (id) => document.getElementById(id);

function canvasPoint(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((evt.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

function buildElements() {
  return {
    canvas: $("board"),
    statusEl: $("status"),
    subtitleEl: $("subtitle"),
    btnRestart: $("btnRestart"),
    moveCountEl: $("moveCount"),
    lastMoveEl: $("lastMove"),
    winnerEl: $("winner"),
    boardSizeEl: $("boardSize"),
    toggleCoordsEl: $("toggleCoords"),
    toggleHintsEl: $("toggleHints"),
    toggleForbiddenEl: $("toggleForbidden"),
    gameModeEl: $("gameMode"),
    humanSideEl: $("humanSide"),
    aiLevelEl: $("aiLevel"),

    onlinePanel: $("onlinePanel"),
    linkSection: $("linkSection"),
    shareLinkInput: $("shareLinkInput"),
    btnCopyLink: $("btnCopyLink"),
    connectSection: $("connectSection"),
    btnCreateRoom: $("btnCreateRoom"),
    btnDisconnect: $("btnDisconnect"),
    connectionStatusEl: $("connectionStatus"),
    roomIdDisplayEl: $("roomIdDisplay"),
    opponentInfoEl: $("opponentInfo"),
  };
}

function init() {
  const elements = buildElements();
  const { canvas } = elements;
  if (!canvas) throw new Error("missing #board canvas");

  const renderer = createRenderer(canvas);

  const network = createGomokuNetwork();

  let ai = null;
  const game = createGame({
    elements,
    renderer,
    network,
    maybeAIMove: () => ai?.maybeAIMove(),
  });
  ai = createAI({ game });

  const bridge = createNetworkBridge({ elements, game, network });

  // 初始化默认 UI 值
  if (elements.toggleCoordsEl) elements.toggleCoordsEl.checked = true;
  if (elements.toggleHintsEl) elements.toggleHintsEl.checked = true;
  if (elements.toggleForbiddenEl) elements.toggleForbiddenEl.checked = false;
  if (elements.boardSizeEl) elements.boardSizeEl.value = "15";
  if (elements.gameModeEl) elements.gameModeEl.value = "PVP";
  if (elements.humanSideEl) elements.humanSideEl.value = "B";
  if (elements.aiLevelEl) elements.aiLevelEl.value = "1";

  // 绑定棋盘事件
  canvas.addEventListener("mousemove", (evt) => {
    const { x, y } = canvasPoint(canvas, evt);
    const cell = renderer.posToCell(x, y);
    const state = getState();
    state.hover = cell;
    game.draw();
  });
  canvas.addEventListener("mouseleave", () => {
    const state = getState();
    state.hover = null;
    game.draw();
  });
  canvas.addEventListener("click", (evt) => {
    const { x, y } = canvasPoint(canvas, evt);
    const cell = renderer.posToCell(x, y);
    if (cell) game.place(cell.r, cell.c);
  });

  // 重开
  elements.btnRestart?.addEventListener("click", () => {
    const state = getState();
    if (state.mode === "ONLINE" && state.network.connected) {
      if (state.network.role !== "host") {
        alert("只有主机可以重新开始游戏");
        return;
      }
      network.sendReset(state.size);
    }
    game.resetGame();
  });

  // 设置项
  elements.boardSizeEl?.addEventListener("change", () => {
    game.resetGame({ size: Number(elements.boardSizeEl.value) });
  });
  elements.gameModeEl?.addEventListener("change", () => {
    game.updateGameModeUI();
    game.resetGame();
  });
  elements.humanSideEl?.addEventListener("change", () => game.resetGame());
  elements.aiLevelEl?.addEventListener("change", () => {
    const state = getState();
    state.aiLevel = Number(elements.aiLevelEl.value);
    game.updateUI();
  });
  elements.toggleCoordsEl?.addEventListener("change", () => {
    const state = getState();
    state.showCoords = !!elements.toggleCoordsEl.checked;
    game.draw();
  });
  elements.toggleHintsEl?.addEventListener("change", () => {
    const state = getState();
    state.showHints = !!elements.toggleHintsEl.checked;
    game.draw();
  });
  elements.toggleForbiddenEl?.addEventListener("change", () => {
    const state = getState();
    state.forbidden = !!elements.toggleForbiddenEl.checked;
  });

  // 联机面板
  elements.btnCreateRoom?.addEventListener("click", () => bridge.handleCreateRoom());
  elements.btnCopyLink?.addEventListener("click", () => bridge.copyShareLink());
  elements.btnDisconnect?.addEventListener("click", () => bridge.handleDisconnectClick());

  // 键盘快捷键：R 重开
  window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") game.resetGame();
  });

  // 初始化网络
  bridge.initNetwork();
  game.updateGameModeUI();

  // URL 自动加入
  const roomId = bridge.parseUrlParams();
  if (roomId) bridge.autoJoinRoom(roomId);
  else game.resetGame({ size: 15 });
}

init();

