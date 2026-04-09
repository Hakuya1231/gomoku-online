export function createState(size, first = "B") {
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
    forbidden: false, // 禁手规则
    hover: null,
    mode: "PVP", // 'PVP' | 'AI' | 'ONLINE'
    human: "B",
    aiLevel: 1,
    aiThinking: false,
    network: {
      mode: "offline", // 'offline' | 'online'
      role: null, // 'host' | 'guest' | 'spectator'
      connected: false,
      roomId: null,
      localSide: "B",
      hostSide: "B",
    },
  };
}

let state = createState(15, "B");

export function getState() {
  return state;
}

export function setState(next) {
  state = next;
  return state;
}

export function cellToLabel(r, c) {
  const col = String.fromCharCode("A".charCodeAt(0) + c);
  return `${col}${r + 1}`;
}

export function nextPlayer(p) {
  return p === "B" ? "W" : "B";
}

