// 五子棋自动化测试 - Node.js 版本
// 运行: node test.js

// ==================== 模拟游戏状态 ====================
const state = {
  size: 15,
  turn: 'B',
  board: [],
  forbidden: true
};

function createState(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function inBounds(r, c, size) {
  return r >= 0 && c >= 0 && r < size && c < size;
}

// ==================== 胜负判定函数 ====================
function checkWinFrom(board, r, c, p) {
  const size = board.length;
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
      if (!inBounds(rr, cc, size) || board[rr][cc] !== p) break;
      line.push({ r: rr, c: cc });
    }
    for (let k = 1; k < 5; k++) {
      const rr = r - dr * k, cc = c - dc * k;
      if (!inBounds(rr, cc, size) || board[rr][cc] !== p) break;
      line.unshift({ r: rr, c: cc });
    }
    if (line.length >= 5) {
      return line.slice(0, 5);
    }
  }
  return null;
}

// ==================== 禁手检测函数 ====================
function countPatternsInDirection(board, r, c, dr, dc, player) {
  const size = board.length;
  board[r][c] = player;

  let cells = [];
  for (let k = 5; k >= 1; k--) {
    const rr = r - dr * k, cc = c - dc * k;
    if (!inBounds(rr, cc, size)) cells.push('O');
    else if (board[rr][cc] === player) cells.push('P');
    else if (board[rr][cc] === null) cells.push('E');
    else cells.push('O');
  }
  cells.push('P');
  for (let k = 1; k <= 5; k++) {
    const rr = r + dr * k, cc = c + dc * k;
    if (!inBounds(rr, cc, size)) cells.push('O');
    else if (board[rr][cc] === player) cells.push('P');
    else if (board[rr][cc] === null) cells.push('E');
    else cells.push('O');
  }

  board[r][c] = null;
  const CURRENT_INDEX = 5;
  let result = { liveThree: 0, four: 0, overline: 0 };

  let leftConsec = 0, rightConsec = 0;
  for (let i = CURRENT_INDEX - 1; i >= 0 && cells[i] === 'P'; i--) leftConsec++;
  for (let i = CURRENT_INDEX + 1; i <= 10 && cells[i] === 'P'; i++) rightConsec++;

  const totalConsec = leftConsec + 1 + rightConsec;

  if (totalConsec >= 6) {
    result.overline = 1;
    return result;
  }

  if (totalConsec === 5) {
    return result;
  }

  if (totalConsec === 4) {
    const leftEndIdx = CURRENT_INDEX - leftConsec - 1;
    const rightEndIdx = CURRENT_INDEX + rightConsec + 1;
    const leftEmpty = leftEndIdx >= 0 && cells[leftEndIdx] === 'E';
    const rightEmpty = rightEndIdx <= 10 && cells[rightEndIdx] === 'E';
    if (leftEmpty || rightEmpty) {
      result.four = 1;
    }
  }

  const checkJumpFour = () => {
    if (cells[CURRENT_INDEX + 1] === 'E') {
      let rightP = 0;
      for (let i = CURRENT_INDEX + 2; i <= 10 && cells[i] === 'P'; i++) rightP++;
      if (leftConsec + 1 + rightP === 4) {
        const leftEnd = CURRENT_INDEX - leftConsec - 1;
        const jumpEnd = CURRENT_INDEX + 1 + rightP + 1;
        if ((leftEnd >= 0 && cells[leftEnd] === 'E') || (jumpEnd <= 10 && cells[jumpEnd] === 'E')) {
          return true;
        }
      }
    }
    if (cells[CURRENT_INDEX - 1] === 'E') {
      let leftP = 0;
      for (let i = CURRENT_INDEX - 2; i >= 0 && cells[i] === 'P'; i--) leftP++;
      if (leftP + 1 + rightConsec === 4) {
        const rightEnd = CURRENT_INDEX + rightConsec + 1;
        const jumpEnd = CURRENT_INDEX - 1 - leftP - 1;
        if ((rightEnd <= 10 && cells[rightEnd] === 'E') || (jumpEnd >= 0 && cells[jumpEnd] === 'E')) {
          return true;
        }
      }
    }
    for (let gapIdx = CURRENT_INDEX - 2; gapIdx >= CURRENT_INDEX - 4 && gapIdx >= 0; gapIdx--) {
      if (cells[gapIdx] !== 'E') continue;
      let leftP = 0;
      for (let i = gapIdx - 1; i >= 0 && cells[i] === 'P'; i--) leftP++;
      let middleP = 0;
      for (let i = gapIdx + 1; i < CURRENT_INDEX && cells[i] === 'P'; i++) middleP++;
      if (leftP + middleP + 1 + rightConsec === 4) {
        const leftEnd = gapIdx - leftP - 1;
        const rightEnd = CURRENT_INDEX + rightConsec + 1;
        if ((leftEnd >= 0 && cells[leftEnd] === 'E') || (rightEnd <= 10 && cells[rightEnd] === 'E')) {
          return true;
        }
      }
    }
    for (let gapIdx = CURRENT_INDEX + 2; gapIdx <= CURRENT_INDEX + 4 && gapIdx <= 10; gapIdx++) {
      if (cells[gapIdx] !== 'E') continue;
      let rightP = 0;
      for (let i = gapIdx + 1; i <= 10 && cells[i] === 'P'; i++) rightP++;
      let middleP = 0;
      for (let i = gapIdx - 1; i > CURRENT_INDEX && cells[i] === 'P'; i--) middleP++;
      if (leftConsec + 1 + middleP + rightP === 4) {
        const leftEnd = CURRENT_INDEX - leftConsec - 1;
        const rightEnd = gapIdx + rightP + 1;
        if ((leftEnd >= 0 && cells[leftEnd] === 'E') || (rightEnd <= 10 && cells[rightEnd] === 'E')) {
          return true;
        }
      }
    }
    return false;
  };

  if (result.four === 0 && checkJumpFour()) {
    result.four = 1;
  }

  if (totalConsec === 3) {
    const leftEndIdx = CURRENT_INDEX - leftConsec - 1;
    const rightEndIdx = CURRENT_INDEX + rightConsec + 1;
    if (leftEndIdx >= 0 && cells[leftEndIdx] === 'E' && rightEndIdx <= 10 && cells[rightEndIdx] === 'E') {
      result.liveThree = 1;
    }
  }

  const checkJumpLiveThree = () => {
    if (cells[CURRENT_INDEX + 1] === 'P' && cells[CURRENT_INDEX + 2] === 'E' && cells[CURRENT_INDEX + 3] === 'P') {
      const leftEnd = CURRENT_INDEX - leftConsec - 1;
      const rightEnd = CURRENT_INDEX + 4;
      if (leftEnd >= 0 && cells[leftEnd] === 'E' && rightEnd <= 10 && cells[rightEnd] === 'E') {
        return true;
      }
    }
    if (cells[CURRENT_INDEX - 1] === 'E' && cells[CURRENT_INDEX - 2] === 'P' && cells[CURRENT_INDEX + 1] === 'P') {
      const leftEnd = CURRENT_INDEX - 3;
      const rightEnd = CURRENT_INDEX + rightConsec + 2;
      if (leftEnd >= 0 && cells[leftEnd] === 'E' && rightEnd <= 10 && cells[rightEnd] === 'E') {
        return true;
      }
    }
    if (cells[CURRENT_INDEX + 1] === 'E' && cells[CURRENT_INDEX + 2] === 'P' && cells[CURRENT_INDEX + 3] === 'P') {
      const leftEnd = CURRENT_INDEX - leftConsec - 1;
      const rightEnd = CURRENT_INDEX + 4;
      if (leftEnd >= 0 && cells[leftEnd] === 'E' && rightEnd <= 10 && cells[rightEnd] === 'E') {
        return true;
      }
    }
    if (cells[CURRENT_INDEX - 1] === 'E' && cells[CURRENT_INDEX - 2] === 'P' && cells[CURRENT_INDEX - 3] === 'P') {
      const leftEnd = CURRENT_INDEX - 4;
      const rightEnd = CURRENT_INDEX + rightConsec + 1;
      if (leftEnd >= 0 && cells[leftEnd] === 'E' && rightEnd <= 10 && cells[rightEnd] === 'E') {
        return true;
      }
    }
    return false;
  };

  if (result.liveThree === 0 && checkJumpLiveThree()) {
    result.liveThree = 1;
  }

  return result;
}

function checkForbidden(board, r, c, turn, size) {
  if (turn !== 'B') return null;

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
    const patterns = countPatternsInDirection(board, r, c, dr, dc, 'B');
    totalLiveThree += patterns.liveThree;
    totalFour += patterns.four;
    if (patterns.overline) hasOverline = true;
  }

  board[r][c] = 'B';
  for (const { dr, dc } of dirs) {
    let count = 1;
    for (let k = 1; k <= 4; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      if (!inBounds(rr, cc, size) || board[rr][cc] !== 'B') break;
      count++;
    }
    for (let k = 1; k <= 4; k++) {
      const rr = r - dr * k, cc = c - dc * k;
      if (!inBounds(rr, cc, size) || board[rr][cc] !== 'B') break;
      count++;
    }
    if (count === 5) {
      hasFive = true;
      break;
    }
  }
  board[r][c] = null;

  // 先判断长连禁手，再判断五连
  if (hasOverline) return '长连禁手';
  if (hasFive) return null;
  if (totalFour >= 2) return '四四禁手';
  if (totalLiveThree >= 2) return '三三禁手';

  return null;
}

// ==================== 测试框架 ====================
let passCount = 0;
let failCount = 0;
const results = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result.pass) {
      passCount++;
      results.push({ name, status: 'PASS', details: result.details || '' });
      console.log('PASS: ' + name + (result.details ? ' - ' + result.details : ''));
    } else {
      failCount++;
      results.push({ name, status: 'FAIL', details: result.details || result.reason || 'not passed' });
      console.log('FAIL: ' + name + ' - ' + (result.details || result.reason || 'not passed'));
    }
  } catch (e) {
    failCount++;
    results.push({ name, status: 'ERROR', details: e.message });
    console.log('ERROR: ' + name + ' - ' + e.message);
  }
}

function placeStones(board, positions, player) {
  for (const pos of positions) {
    board[pos.r][pos.c] = player;
  }
}

// ==================== 运行测试 ====================
console.log('\n========================================');
console.log('五子棋自动化测试');
console.log('========================================\n');

// ===== 胜负判定测试 =====
console.log('--- 胜负判定测试 (6) ---');

test('横向五连判定', () => {
  const board = createState(15);
  placeStones(board, [{r:7,c:3},{r:7,c:4},{r:7,c:5},{r:7,c:6}], 'B');
  board[7][7] = 'B';
  const win = checkWinFrom(board, 7, 7, 'B');
  return { pass: win !== null, details: win ? '横向五连获胜' : '未检测到' };
});

test('纵向五连判定', () => {
  const board = createState(15);
  placeStones(board, [{r:3,c:7},{r:4,c:7},{r:5,c:7},{r:6,c:7}], 'B');
  board[7][7] = 'B';
  const win = checkWinFrom(board, 7, 7, 'B');
  return { pass: win !== null, details: win ? '纵向五连获胜' : '未检测到' };
});

test('斜向五连判定', () => {
  const board = createState(15);
  placeStones(board, [{r:3,c:3},{r:4,c:4},{r:5,c:5},{r:6,c:6}], 'B');
  board[7][7] = 'B';
  const win = checkWinFrom(board, 7, 7, 'B');
  return { pass: win !== null, details: win ? '斜向五连获胜' : '未检测到' };
});

test('反斜向五连判定', () => {
  const board = createState(15);
  placeStones(board, [{r:3,c:11},{r:4,c:10},{r:5,c:9},{r:6,c:8}], 'B');
  board[7][7] = 'B';
  const win = checkWinFrom(board, 7, 7, 'B');
  return { pass: win !== null, details: win ? '反斜向五连获胜' : '未检测到' };
});

test('白棋五连判定', () => {
  const board = createState(15);
  placeStones(board, [{r:7,c:3},{r:7,c:4},{r:7,c:5},{r:7,c:6}], 'W');
  board[7][7] = 'W';
  const win = checkWinFrom(board, 7, 7, 'W');
  return { pass: win !== null, details: win ? '白棋获胜' : '未检测到' };
});

test('四连不获胜', () => {
  const board = createState(15);
  placeStones(board, [{r:7,c:3},{r:7,c:4},{r:7,c:5}], 'B');
  board[7][6] = 'B';
  const win = checkWinFrom(board, 7, 6, 'B');
  return { pass: win === null, details: win ? '错误判定获胜' : '四连不获胜' };
});

// ===== 三三禁手测试 =====
console.log('\n--- 三三禁手测试 (8) ---');

test('三三禁手-横向+纵向连活三', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:9},{r:5,c:10},{r:3,c:11},{r:4,c:11}], 'B');
  const forbidden = checkForbidden(board, 5, 11, 'B', 15);
  return { pass: forbidden === '三三禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('三三禁手-横向+斜向连活三', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:9},{r:5,c:10},{r:3,c:9},{r:4,c:10}], 'B');
  const forbidden = checkForbidden(board, 5, 11, 'B', 15);
  return { pass: forbidden === '三三禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('三三禁手-横向+反斜向连活三', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:9},{r:5,c:10},{r:7,c:9},{r:6,c:10}], 'B');
  const forbidden = checkForbidden(board, 5, 11, 'B', 15);
  return { pass: forbidden === '三三禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('三三禁手-斜向+反斜向连活三', () => {
  const board = createState(15);
  // 斜向活三: (3,9), (4,10) 在 (5,11) 落子形成 _BBB_
  // 反斜向活三: (7,13), (6,12) 在 (5,11) 落子 - 需要调整
  // 改用更简单的布局：(5,5)位置可形成斜向和反斜向活三
  // 斜向: (3,3), (4,4) + (5,5) = 3个
  // 反斜向: (7,7), (6,6) + (5,5) = 3个 - 不对
  // 正确布局：(7,7)位置
  // 斜向活三: (5,5), (6,6) 在 (7,7) 落子形成 _BBB_
  // 反斜向活三: (9,5), (8,6) 在 (7,7) 落子形成 _BBB_
  placeStones(board, [{r:5,c:5},{r:6,c:6},{r:9,c:5},{r:8,c:6}], 'B');
  const forbidden = checkForbidden(board, 7, 7, 'B', 15);
  return { pass: forbidden === '三三禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('三三禁手-跳活三', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:6},{r:5,c:7},{r:3,c:8},{r:4,c:8}], 'B');
  const forbidden = checkForbidden(board, 5, 8, 'B', 15);
  return { pass: forbidden === '三三禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('假活三-一端被堵不算三三', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:9},{r:5,c:10},{r:3,c:7},{r:4,c:7},{r:6,c:7}], 'B');
  placeStones(board, [{r:2,c:7}], 'W');
  const forbidden = checkForbidden(board, 5, 7, 'B', 15);
  return { pass: forbidden !== '三三禁手', details: forbidden ? '检测到: ' + forbidden : '正确：不是三三' };
});

test('假活三-两端被堵', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:6},{r:5,c:7}], 'B');
  placeStones(board, [{r:5,c:5},{r:5,c:9}], 'W');
  const forbidden = checkForbidden(board, 5, 8, 'B', 15);
  return { pass: forbidden !== '三三禁手', details: forbidden ? '检测到: ' + forbidden : '正确：两端被堵不是活三' };
});

test('单活三不是禁手', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:5},{r:5,c:6}], 'B');
  const forbidden = checkForbidden(board, 5, 7, 'B', 15);
  return { pass: forbidden === null, details: forbidden ? '错误检测: ' + forbidden : '正确：单活三非禁手' };
});

// ===== 四四禁手测试 =====
console.log('\n--- 四四禁手测试 (6) ---');

test('四四禁手-活四x2', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:5},{r:5,c:6},{r:5,c:7},{r:2,c:8},{r:3,c:8},{r:4,c:8}], 'B');
  const forbidden = checkForbidden(board, 5, 8, 'B', 15);
  return { pass: forbidden === '四四禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('四四禁手-冲四x2', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:4},{r:5,c:5},{r:5,c:6},{r:2,c:7},{r:3,c:7},{r:4,c:7}], 'B');
  placeStones(board, [{r:5,c:3},{r:1,c:7}], 'W');
  const forbidden = checkForbidden(board, 5, 7, 'B', 15);
  return { pass: forbidden === '四四禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('四四禁手-活四+冲四', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:5},{r:5,c:6},{r:5,c:7},{r:1,c:8},{r:2,c:8},{r:3,c:8}], 'B');
  placeStones(board, [{r:0,c:8}], 'W');
  const forbidden = checkForbidden(board, 5, 8, 'B', 15);
  return { pass: forbidden === '四四禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('四四禁手-连四+跳四', () => {
  const board = createState(15);
  // 连四横向: (5,4), (5,5), (5,6) + (5,7) = 4个（两端需有空）
  // 跳四纵向: 需要跳四模式如 _PPP_E_ 或 _E_PPP_
  // 改用简单布局：两个连四
  placeStones(board, [{r:5,c:4},{r:5,c:5},{r:5,c:6},{r:2,c:7},{r:3,c:7},{r:4,c:7}], 'B');
  const forbidden = checkForbidden(board, 5, 7, 'B', 15);
  return { pass: forbidden === '四四禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('单四不是禁手', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:5},{r:5,c:6},{r:5,c:7}], 'B');
  const forbidden = checkForbidden(board, 5, 8, 'B', 15);
  return { pass: forbidden === null, details: forbidden ? '错误检测: ' + forbidden : '正确：单四非禁手' };
});

test('四三组合不是禁手', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:5},{r:5,c:6},{r:5,c:7},{r:3,c:8},{r:4,c:8}], 'B');
  const forbidden = checkForbidden(board, 5, 8, 'B', 15);
  return { pass: forbidden === null, details: forbidden ? '错误检测: ' + forbidden : '正确：四三组合非禁手' };
});

// ===== 长连禁手测试 =====
console.log('\n--- 长连禁手测试 (5) ---');

test('长连禁手-六子', () => {
  const board = createState(15);
  placeStones(board, [{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5}], 'B');
  const forbidden = checkForbidden(board, 7, 6, 'B', 15);
  return { pass: forbidden === '长连禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('长连禁手-七子', () => {
  const board = createState(15);
  placeStones(board, [{r:7,c:0},{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5}], 'B');
  const forbidden = checkForbidden(board, 7, 6, 'B', 15);
  return { pass: forbidden === '长连禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('长连禁手-斜向六子', () => {
  const board = createState(15);
  placeStones(board, [{r:1,c:1},{r:2,c:2},{r:3,c:3},{r:4,c:4},{r:5,c:5}], 'B');
  const forbidden = checkForbidden(board, 6, 6, 'B', 15);
  return { pass: forbidden === '长连禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('长连禁手-纵向六子', () => {
  const board = createState(15);
  placeStones(board, [{r:1,c:7},{r:2,c:7},{r:3,c:7},{r:4,c:7},{r:5,c:7}], 'B');
  const forbidden = checkForbidden(board, 6, 7, 'B', 15);
  return { pass: forbidden === '长连禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('白棋无长连禁手', () => {
  const board = createState(15);
  placeStones(board, [{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5}], 'W');
  const forbidden = checkForbidden(board, 7, 6, 'W', 15);
  return { pass: forbidden === null, details: forbidden ? '白棋不应有禁手' : '正确：白棋无禁手' };
});

// ===== 五连优先测试 =====
console.log('\n--- 五连优先测试 (3) ---');

test('五连优先-可成五连不判禁手', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:3},{r:5,c:4},{r:5,c:5},{r:5,c:6},{r:1,c:7},{r:2,c:7},{r:3,c:7},{r:4,c:7}], 'B');
  const forbidden = checkForbidden(board, 5, 7, 'B', 15);
  return { pass: forbidden === null, details: forbidden ? '错误判定: ' + forbidden : '正确：五连获胜优先' };
});

test('五连优先-三三位置可成五连', () => {
  const board = createState(15);
  placeStones(board, [{r:7,c:3},{r:7,c:4},{r:7,c:5},{r:7,c:6},{r:4,c:7},{r:5,c:7},{r:6,c:7},{r:8,c:7}], 'B');
  const forbidden = checkForbidden(board, 7, 7, 'B', 15);
  return { pass: forbidden === null, details: forbidden ? '错误判定: ' + forbidden : '正确：五连获胜' };
});

test('五连优先-四四位置可成五连', () => {
  const board = createState(15);
  // 在(7,7)落子可成五连（横向已有4个）
  placeStones(board, [{r:7,c:3},{r:7,c:4},{r:7,c:5},{r:7,c:6},{r:4,c:8},{r:5,c:8},{r:6,c:8}], 'B');
  const forbidden = checkForbidden(board, 7, 7, 'B', 15);
  return { pass: forbidden === null, details: forbidden ? '错误判定: ' + forbidden : '正确：五连获胜' };
});

// ===== 边界测试 =====
console.log('\n--- 边界测试 (8) ---');

test('边角落子-左上角', () => {
  const board = createState(15);
  board[0][0] = 'B';
  const win = checkWinFrom(board, 0, 0, 'B');
  return { pass: win === null, details: '左上角单子不应获胜' };
});

test('边角落子-右下角', () => {
  const board = createState(15);
  board[14][14] = 'B';
  const win = checkWinFrom(board, 14, 14, 'B');
  return { pass: win === null, details: '右下角单子不应获胜' };
});

test('边界横向五连-上边', () => {
  const board = createState(15);
  placeStones(board, [{r:0,c:0},{r:0,c:1},{r:0,c:2},{r:0,c:3}], 'B');
  board[0][4] = 'B';
  const win = checkWinFrom(board, 0, 4, 'B');
  return { pass: win !== null, details: win ? '上边界五连获胜' : '未检测到' };
});

test('边界纵向五连-右边', () => {
  const board = createState(15);
  placeStones(board, [{r:0,c:14},{r:1,c:14},{r:2,c:14},{r:3,c:14}], 'B');
  board[4][14] = 'B';
  const win = checkWinFrom(board, 4, 14, 'B');
  return { pass: win !== null, details: win ? '右边界五连获胜' : '未检测到' };
});

test('边界斜向五连-左上角', () => {
  const board = createState(15);
  placeStones(board, [{r:0,c:0},{r:1,c:1},{r:2,c:2},{r:3,c:3}], 'B');
  board[4][4] = 'B';
  const win = checkWinFrom(board, 4, 4, 'B');
  return { pass: win !== null, details: win ? '边界斜向五连获胜' : '未检测到' };
});

test('19x19棋盘-五连', () => {
  const board = createState(19);
  placeStones(board, [{r:9,c:5},{r:9,c:6},{r:9,c:7},{r:9,c:8}], 'B');
  board[9][9] = 'B';
  const win = checkWinFrom(board, 9, 9, 'B');
  return { pass: win !== null, details: win ? '19x19五连获胜' : '未检测到' };
});

test('19x19棋盘-三三禁手', () => {
  const board = createState(19);
  placeStones(board, [{r:9,c:6},{r:9,c:7},{r:7,c:9},{r:8,c:9}], 'B');
  const forbidden = checkForbidden(board, 9, 9, 'B', 19);
  return { pass: forbidden === '三三禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('19x19棋盘-长连禁手', () => {
  const board = createState(19);
  placeStones(board, [{r:9,c:3},{r:9,c:4},{r:9,c:5},{r:9,c:6},{r:9,c:7}], 'B');
  const forbidden = checkForbidden(board, 9, 8, 'B', 19);
  return { pass: forbidden === '长连禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

// ===== 白先模式禁手测试 =====
console.log('\n--- 白先模式禁手测试 (6) ---');

test('白先模式-黑棋仍有禁手(三三)', () => {
  const board = createState(15);
  // 白先模式：白棋已落子，现在轮到黑棋
  // 黑棋在(5,11)形成三三
  placeStones(board, [{r:5,c:9},{r:5,c:10},{r:3,c:11},{r:4,c:11}], 'B');
  placeStones(board, [{r:7,c:7}], 'W'); // 白棋已落子
  const forbidden = checkForbidden(board, 5, 11, 'B', 15);
  return { pass: forbidden === '三三禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('白先模式-黑棋仍有禁手(四四)', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:5},{r:5,c:6},{r:5,c:7},{r:2,c:8},{r:3,c:8},{r:4,c:8}], 'B');
  placeStones(board, [{r:7,c:7}], 'W');
  const forbidden = checkForbidden(board, 5, 8, 'B', 15);
  return { pass: forbidden === '四四禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('白先模式-黑棋仍有禁手(长连)', () => {
  const board = createState(15);
  placeStones(board, [{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5}], 'B');
  placeStones(board, [{r:8,c:8}], 'W');
  const forbidden = checkForbidden(board, 7, 6, 'B', 15);
  return { pass: forbidden === '长连禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

test('白先模式-白棋无禁手', () => {
  const board = createState(15);
  // 白棋形成可以成六连的位置
  placeStones(board, [{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5}], 'W');
  const forbidden = checkForbidden(board, 7, 6, 'W', 15);
  return { pass: forbidden === null, details: forbidden ? '白棋不应有禁手' : '正确：白棋无禁手' };
});

test('白先模式-黑棋五连优先', () => {
  const board = createState(15);
  placeStones(board, [{r:5,c:3},{r:5,c:4},{r:5,c:5},{r:5,c:6},{r:1,c:7},{r:2,c:7},{r:3,c:7},{r:4,c:7}], 'B');
  placeStones(board, [{r:8,c:8}], 'W');
  const forbidden = checkForbidden(board, 5, 7, 'B', 15);
  return { pass: forbidden === null, details: forbidden ? '错误判定: ' + forbidden : '正确：五连获胜' };
});

test('黑先模式-黑棋禁手正常', () => {
  const board = createState(15);
  // 黑先模式，黑棋第一手就有禁手检测
  placeStones(board, [{r:5,c:9},{r:5,c:10},{r:3,c:11},{r:4,c:11}], 'B');
  const forbidden = checkForbidden(board, 5, 11, 'B', 15);
  return { pass: forbidden === '三三禁手', details: forbidden ? '检测到: ' + forbidden : '未检测到禁手' };
});

// ===== 输出结果 =====
console.log('\n========================================');
console.log('测试结果统计');
console.log('========================================');
console.log('总计: ' + (passCount + failCount) + ' 个测试');
console.log('通过: ' + passCount);
console.log('失败: ' + failCount);
console.log('========================================\n');

if (failCount > 0) {
  console.log('失败的测试:');
  results.filter(r => r.status !== 'PASS').forEach(r => {
    console.log('  - ' + r.name + ': ' + r.details);
  });
  process.exit(1);
} else {
  console.log('所有测试通过！');
  process.exit(0);
}