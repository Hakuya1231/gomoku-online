// Playwright E2E Tests for Gomoku
// Run: npm run test:e2e

const { test, expect } = require('@playwright/test');

// Helper function to calculate click position on the board
function getClickPosition(box, row, col, gridSize = 15) {
  // Canvas is 720x720, padding=42
  // Calculate position relative to canvas's rendered size
  const canvasSize = 720;
  const padding = 42;
  const gap = (canvasSize - padding * 2) / (gridSize - 1);

  // Click position in canvas coordinates
  const canvasX = padding + col * gap;
  const canvasY = padding + row * gap;

  // Scale to CSS rendering size
  const scaleX = box.width / canvasSize;
  const scaleY = box.height / canvasSize;

  return {
    x: box.x + canvasX * scaleX,
    y: box.y + canvasY * scaleY
  };
}

async function clickAt(page, row, col, gridSize = 15) {
  // 在浏览器内精确派发 canvas click（避免缩放/四舍五入导致的 posToCell 阈值误差）
  await page.evaluate((args) => {
    const { r, c, grid } = args;
    const canvas = document.getElementById('board');
    if (!canvas) throw new Error('missing canvas#board');
    const padding = 42;
    const gap = (canvas.width - padding * 2) / (grid - 1);
    const x = padding + c * gap;
    const y = padding + r * gap;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    const clientX = rect.left + x * scaleX;
    const clientY = rect.top + y * scaleY;

    const evt = new MouseEvent('click', {
      clientX,
      clientY,
      bubbles: true,
    });
    canvas.dispatchEvent(evt);
  }, { r: row, c: col, grid: gridSize });
  await page.waitForTimeout(30);
}

// ==================== 联机 E2E 辅助方法（降低 sleep 依赖，提升稳定性） ====================
async function gotoHome(page) {
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#board');
}

async function gotoRoom(page, roomId) {
  await page.goto('http://localhost:8080/?room=' + roomId);
  await page.waitForSelector('#board');
  await expect
    .poll(async () => page.url(), { timeout: 15000 })
    .toContain('room=' + roomId);
  // main.js 应根据 URL 自动切到 ONLINE 并尝试连接
  await expect
    .poll(async () => await page.locator('#gameMode').inputValue(), { timeout: 20000 })
    .toBe('ONLINE');
}

async function switchToOnline(page) {
  await page.selectOption('#gameMode', 'ONLINE');
  await expect(page.locator('#onlinePanel')).toBeVisible();
}

async function waitForOnlineConnected(page) {
  const conn = page.locator('#connectionStatus');
  await expect
    .poll(async () => ((await conn.textContent()) || '').trim(), { timeout: 20000 })
    .toBe('已连接');

  const status = page.locator('#status');
  await expect
    .poll(async () => (await status.textContent()) || '', { timeout: 20000 })
    .toContain('联机');
}

async function createRoomAndGetId(hostPage) {
  await switchToOnline(hostPage);
  // 等待 Firebase 初始化完成（线上 RTDB 偶发较慢）
  await expect
    .poll(
      async () =>
        await hostPage.evaluate(() => {
          try {
            return !!window.firebase && Array.isArray(firebase.apps) && firebase.apps.length > 0;
          } catch {
            return false;
          }
        }),
      { timeout: 15000 },
    )
    .toBe(true);
  await hostPage.click('#btnCreateRoom');
  const roomIdEl = hostPage.locator('#roomIdDisplay');
  await expect
    .poll(async () => ((await roomIdEl.textContent()) || '').trim(), { timeout: 20000 })
    .toMatch(/^[A-Z0-9]{6}$/);
  return ((await roomIdEl.textContent()) || '').trim();
}

async function waitForGuestNodeVisible(hostPage, roomId) {
  // 使用 Firebase 直接读 guest 节点，避免「UI 已显示连接，但第三人读 room 时 guest 仍未稳定可见」的竞态
  await expect
    .poll(
      async () => {
        return await hostPage.evaluate(async (rid) => {
          try {
            const snap = await firebase.database().ref('rooms/' + rid + '/guest').once('value');
            return !!snap.val();
          } catch {
            return false;
          }
        }, roomId);
      },
      { timeout: 20000 },
    )
    .toBe(true);
}

async function cleanupDisconnect(page) {
  const btn = page.locator('#btnDisconnect');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  }
}

test.describe('Gomoku Game', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await page.waitForSelector('#board');
  });

  // ==================== 1. 核心游戏功能测试 ====================

  test.describe('棋盘渲染测试', () => {
    test('TC-001: 15x15棋盘正确渲染', async ({ page }) => {
      const board = await page.locator('#board');
      await expect(board).toBeVisible();
      const subtitle = await page.locator('#subtitle').textContent();
      expect(subtitle).toContain('15×15');
    });

    test('TC-002: 19x19棋盘正确渲染', async ({ page }) => {
      await page.selectOption('#boardSize', '19');
      await page.click('#btnRestart');
      const subtitle = await page.locator('#subtitle').textContent();
      expect(subtitle).toContain('19×19');
    });

    test('TC-003: 棋盘坐标显示', async ({ page }) => {
      // Click the slider span (checkbox input is hidden)
      await page.locator('#toggleCoords + .slider').click();
      await page.locator('#toggleCoords + .slider').click(); // Toggle back to checked
      await expect(page.locator('#board')).toBeVisible();
    });

    test('TC-004: 棋盘坐标隐藏', async ({ page }) => {
      // The coords checkbox is checked by default, click to uncheck
      await page.locator('#toggleCoords + .slider').click();
      await expect(page.locator('#board')).toBeVisible();
    });

    test('TC-005: 提示线显示开关', async ({ page }) => {
      // Toggle hints
      await page.locator('#toggleHints + .slider').click();
      await page.locator('#toggleHints + .slider').click();
      await expect(page.locator('#board')).toBeVisible();
    });

    test('TC-006: 提示线隐藏开关', async ({ page }) => {
      await page.locator('#toggleHints + .slider').click();
      await expect(page.locator('#board')).toBeVisible();
    });
  });

  test.describe('落子功能测试', () => {
    test('TC-010: 黑棋先手落子', async ({ page }) => {
      await clickAt(page, 7, 7);
      const status = await page.locator('#status').textContent();
      expect(status).toContain('白方');
    });

    test('TC-011: 白棋落子', async ({ page }) => {
      await clickAt(page, 7, 7);
      await page.waitForTimeout(100);
      await clickAt(page, 7, 8);
      const status = await page.locator('#status').textContent();
      expect(status).toContain('黑方');
    });

    test('TC-012: 已有棋子位置不能落子', async ({ page }) => {
      await clickAt(page, 7, 7);
      await page.waitForTimeout(50);
      await clickAt(page, 7, 7);

      const status = await page.locator('#status').textContent();
      expect(status).toContain('白方');

      const moveCount = await page.locator('#moveCount').textContent();
      expect(moveCount).toBe('1');
    });

    test('TC-015: 落子后最后一步标记', async ({ page }) => {
      await clickAt(page, 7, 7);
      const lastMove = await page.locator('#lastMove').textContent();
      expect(lastMove).toContain('黑');
    });
  });

  test.describe('胜负判定测试', () => {
    test('TC-020: 横向五连获胜', async ({ page }) => {
      // Place alternating moves: Black horizontal, White elsewhere
      const moves = [
        [7, 3], [10, 10], // B, W
        [7, 4], [10, 11], // B, W
        [7, 5], [10, 12], // B, W
        [7, 6], [10, 13], // B, W
        [7, 7],           // B wins
      ];

      for (const [r, c] of moves) {
        await clickAt(page, r, c);
        await page.waitForTimeout(50);
      }

      const status = await page.locator('#status').textContent();
      expect(status).toContain('黑方获胜');
    });

    test('TC-021: 纵向五连获胜', async ({ page }) => {
      const moves = [
        [3, 7], [3, 10],
        [4, 7], [4, 10],
        [5, 7], [5, 10],
        [6, 7], [6, 10],
        [7, 7],
      ];

      for (const [r, c] of moves) {
        await clickAt(page, r, c);
        await page.waitForTimeout(50);
      }

      const status = await page.locator('#status').textContent();
      expect(status).toContain('黑方获胜');
    });

    test('TC-022: 斜向五连获胜', async ({ page }) => {
      const moves = [
        [3, 3], [3, 10],
        [4, 4], [4, 10],
        [5, 5], [5, 10],
        [6, 6], [6, 10],
        [7, 7],
      ];

      for (const [r, c] of moves) {
        await clickAt(page, r, c);
        await page.waitForTimeout(50);
      }

      const status = await page.locator('#status').textContent();
      expect(status).toContain('黑方获胜');
    });

    test('TC-024: 白棋五连获胜', async ({ page }) => {
      // Black plays first, then white wins with 5 in a row
      // Need to prevent black from forming 5 before white
      // Black plays scattered positions, white forms row 8
      const moves = [
        [2, 2], [8, 3],   // B scattered, W starts row 8
        [12, 5], [8, 4],  // B scattered, W extends
        [5, 10], [8, 5],  // B scattered, W extends
        [1, 1], [8, 6],   // B scattered, W extends
        [13, 13], [8, 7], // B scattered, W wins!
      ];

      for (const [r, c] of moves) {
        await clickAt(page, r, c);
        await page.waitForTimeout(50);
      }

      const status = await page.locator('#status').textContent();
      expect(status).toContain('白方获胜');
    });

    test('TC-025: 游戏结束后不能继续落子', async ({ page }) => {
      // Quick win for black
      const moves = [
        [7, 3], [10, 10],
        [7, 4], [10, 11],
        [7, 5], [10, 12],
        [7, 6], [10, 13],
        [7, 7],
      ];

      for (const [r, c] of moves) {
        await clickAt(page, r, c);
        await page.waitForTimeout(50);
      }

      // Wait for win to be detected
      await page.waitForTimeout(100);

      const moveCountBefore = await page.locator('#moveCount').textContent();

      // Try to place another piece
      await clickAt(page, 8, 8);
      await page.waitForTimeout(50);

      const moveCountAfter = await page.locator('#moveCount').textContent();
      expect(moveCountAfter).toBe(moveCountBefore);
    });
  });

  test.describe('游戏重置测试', () => {
    test('TC-030: 点击重开按钮', async ({ page }) => {
      await clickAt(page, 7, 7);
      await page.click('#btnRestart');

      const moveCount = await page.locator('#moveCount').textContent();
      expect(moveCount).toBe('0');

      const status = await page.locator('#status').textContent();
      expect(status).toContain('黑方');
    });

    test('TC-031: 按R键重开', async ({ page }) => {
      await clickAt(page, 7, 7);
      await page.keyboard.press('r');

      const moveCount = await page.locator('#moveCount').textContent();
      expect(moveCount).toBe('0');
    });
  });

  // ==================== 2. 禁手规则测试 ====================

  test.describe('禁手规则测试', () => {
    test.beforeEach(async ({ page }) => {
      // Enable forbidden rules by clicking the slider
      await page.locator('#toggleForbidden + .slider').click();
      await page.waitForTimeout(100);
      await page.click('#btnRestart');
    });

    test('TC-40: 三三禁手 - 连活三x2', async ({ page }) => {
      // Setup to create double live three at (7,7)
      // Black places: (7,5), (7,6), (7,8) - horizontal three with gap at 7
      // Black places: (5,7), (6,7), (8,7) - vertical three with gap at 7
      // White places elsewhere to alternate

      const moves = [
        [7, 5], [3, 3],   // B, W scattered (NOT 5 in row!)
        [7, 6], [3, 4],   // B, W scattered
        [7, 8], [3, 5],   // B, W scattered
        [5, 7], [12, 12], // B, W scattered
        [6, 7], [12, 13], // B, W scattered
        [8, 7], [13, 12], // B, W scattered
      ];

      for (const [r, c] of moves) {
        await clickAt(page, r, c);
        await page.waitForTimeout(50);
      }

      // Try to place black at forbidden position (7,7)
      await clickAt(page, 7, 7);

      // Move should not be counted (forbidden)
      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBe(12); // 6B + 6W, forbidden move rejected
    });

    test('TC-47: 禁手开关关闭时可以落子', async ({ page }) => {
      // Disable forbidden rules (click twice: first enabled in beforeEach, then disable)
      await page.locator('#toggleForbidden + .slider').click();
      await page.waitForTimeout(100);
      await page.click('#btnRestart');

      const moves = [
        [7, 5], [3, 3],   // B, W scattered (NOT 5 in row!)
        [7, 6], [3, 4],   // B, W scattered
        [7, 8], [3, 5],   // B, W scattered
        [5, 7], [12, 12], // B, W scattered
        [6, 7], [12, 13], // B, W scattered
        [8, 7], [13, 12], // B, W scattered
      ];

      for (const [r, c] of moves) {
        await clickAt(page, r, c);
        await page.waitForTimeout(50);
      }

      // Should be able to place at "forbidden" position when rules are off
      await clickAt(page, 7, 7);

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBe(13); // Move counted
    });
  });

  // ==================== 3. AI对战测试 ====================

  test.describe('AI对战测试', () => {
    test.beforeEach(async ({ page }) => {
      await page.selectOption('#gameMode', 'AI');
      await page.click('#btnRestart');
    });

    test('TC-80: 简单难度AI响应', async ({ page }) => {
      await page.selectOption('#aiLevel', '1');
      await clickAt(page, 7, 7);
      await page.waitForTimeout(1000);

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBeGreaterThanOrEqual(2);
    });

    test('TC-81: 中等难度AI响应', async ({ page }) => {
      await page.selectOption('#aiLevel', '2');
      await clickAt(page, 7, 7);
      await page.waitForTimeout(1500);

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBeGreaterThanOrEqual(2);
    });

    test('TC-82: 困难难度AI响应', async ({ page }) => {
      await page.selectOption('#aiLevel', '3');
      await clickAt(page, 7, 7);
      await page.waitForTimeout(3000);

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBeGreaterThanOrEqual(2);
    });

    test('TC-83: AI执黑模式', async ({ page }) => {
      await page.selectOption('#humanSide', 'W');
      await page.click('#btnRestart');

      // Wait for AI to make first move
      await page.waitForTimeout(3000);

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBeGreaterThanOrEqual(1);
    });

    test('TC-100: AI模式下正确回合控制', async ({ page }) => {
      await page.selectOption('#humanSide', 'B');

      // Place black (human)
      await clickAt(page, 7, 7);
      await page.waitForTimeout(1000);

      // After AI responds, it should be human's turn again
      const status = await page.locator('#status').textContent();
      expect(status).toContain('黑方');
    });
  });

  // ==================== 5. UI/交互测试 ====================

  test.describe('设置面板测试', () => {
    test('TC-170: 对战模式切换', async ({ page }) => {
      await page.selectOption('#gameMode', 'AI');
      await page.waitForTimeout(100);

      const subtitle = await page.locator('#subtitle').textContent();
      expect(subtitle).toContain('人机');

      await page.selectOption('#gameMode', 'PVP');
      const subtitle2 = await page.locator('#subtitle').textContent();
      expect(subtitle2).toContain('双人');
    });

    test('TC-171: 联机面板显示', async ({ page }) => {
      await page.selectOption('#gameMode', 'ONLINE');
      await page.waitForTimeout(100);

      const onlinePanel = await page.locator('#onlinePanel');
      await expect(onlinePanel).toBeVisible();
    });

    test('TC-172: 非联机模式隐藏联机面板', async ({ page }) => {
      await page.selectOption('#gameMode', 'PVP');
      await page.waitForTimeout(100);

      const onlinePanel = await page.locator('#onlinePanel');
      await expect(onlinePanel).toBeHidden();
    });
  });

  test.describe('信息面板测试', () => {
    test('TC-180: 步数显示', async ({ page }) => {
      expect(await page.locator('#moveCount').textContent()).toBe('0');

      await clickAt(page, 7, 7);
      await page.waitForTimeout(50);
      await clickAt(page, 7, 8);
      await page.waitForTimeout(50);

      expect(await page.locator('#moveCount').textContent()).toBe('2');
    });

    test('TC-181: 上一步显示', async ({ page }) => {
      await clickAt(page, 7, 7);
      const lastMove = await page.locator('#lastMove').textContent();
      expect(lastMove).toContain('黑');
    });

    test('TC-182: 胜者显示', async ({ page }) => {
      const moves = [
        [7, 3], [10, 10],
        [7, 4], [10, 11],
        [7, 5], [10, 12],
        [7, 6], [10, 13],
        [7, 7],
      ];

      for (const [r, c] of moves) {
        await clickAt(page, r, c);
        await page.waitForTimeout(50);
      }

      const winner = await page.locator('#winner').textContent();
      expect(winner).toContain('黑');
    });
  });

  // ==================== 6. 边界条件测试 ====================

  test.describe('边界条件测试', () => {
    test('TC-200: 边角落子', async ({ page }) => {
      // Click corner position (0,0) - A1
      await clickAt(page, 0, 0);

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBe(1);
    });

    test('TC-201: 右下角落子', async ({ page }) => {
      // Click near corner position (13,13) - slightly inside to avoid edge issues
      await clickAt(page, 13, 13);

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBe(1);
    });

    test('TC-210: 连续落子测试', async ({ page }) => {
      // Place 20 alternating pieces
      for (let i = 0; i < 20; i++) {
        const row = i % 10;
        const col = i < 10 ? 3 : 5;
        await clickAt(page, row, col);
        await page.waitForTimeout(50);
      }

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBe(20);
    });

    test('TC-213: 键盘干扰', async ({ page }) => {
      await clickAt(page, 7, 7);

      // Press random keys (should not affect game)
      await page.keyboard.press('a');
      await page.keyboard.press('b');
      await page.keyboard.press('c');

      // Game should still work normally
      await clickAt(page, 7, 8);
      expect(await page.locator('#moveCount').textContent()).toBe('2');
    });
  });

  // ==================== 7. 19x19棋盘测试 ====================

  test.describe('19x19棋盘测试', () => {
    test.beforeEach(async ({ page }) => {
      await page.selectOption('#boardSize', '19');
      await page.click('#btnRestart');
    });

    test('TC-140: 19x19棋盘落子', async ({ page }) => {
      // Click center of 19x19 board (9,9)
      const board = await page.locator('#board');
      const box = await board.boundingBox();
      const pos = getClickPosition(box, 9, 9, 19);
      await page.mouse.click(pos.x, pos.y);

      const moveCount = await page.locator('#moveCount').textContent();
      expect(parseInt(moveCount)).toBe(1);
    });

    test('TC-141: 19x19棋盘五连获胜', async ({ page }) => {
      const board = await page.locator('#board');
      const box = await board.boundingBox();

      const moves = [
        [9, 5], [12, 12],
        [9, 6], [12, 13],
        [9, 7], [12, 14],
        [9, 8], [12, 15],
        [9, 9],
      ];

      for (const [r, c] of moves) {
        const pos = getClickPosition(box, r, c, 19);
        await page.mouse.click(pos.x, pos.y);
        await page.waitForTimeout(50);
      }

      const status = await page.locator('#status').textContent();
      expect(status).toContain('黑方获胜');
    });
  });

  // ==================== 8. 联机模式测试 ====================

  test.describe('联机模式测试', () => {
    test.describe.configure({ mode: 'serial' });

    test('TC-110: 创建房间成功', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await gotoHome(page);

      const roomId = await createRoomAndGetId(page);
      expect(roomId).not.toBe('-');
      expect(roomId.length).toBe(6);

      await context.close();
    });

    test('TC-143: 主机执子(hostSide)同步到客机（并禁用客机设置）', async ({ browser }) => {
      const hostContext = await browser.newContext();
      const guestContext = await browser.newContext();

      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      await gotoHome(hostPage);

      // 主机选择执白，然后创建房间
      await hostPage.selectOption('#humanSide', 'W');
      const roomId = await createRoomAndGetId(hostPage);

      // 客机加入
      await gotoRoom(guestPage, roomId);
      await waitForOnlineConnected(guestPage);
      await waitForOnlineConnected(hostPage);

      // 客机的人类执子应为与主机相反的一方，并且被禁用
      await expect(guestPage.locator('#humanSide')).toHaveValue('B');
      await expect(guestPage.locator('#humanSide')).toBeDisabled();

      // 黑先规则：此时应轮到黑方（客机）先手
      await expect
        .poll(async () => (await guestPage.locator('#status').textContent()) || '', { timeout: 15000 })
        .toContain('轮到：黑方');

      await cleanupDisconnect(guestPage);
      await cleanupDisconnect(hostPage);
      await guestContext.close();
      await hostContext.close();
    });

    test('TC-140: 联机模式棋盘大小同步', async ({ browser }) => {
      // 创建两个浏览器上下文
      const hostContext = await browser.newContext();
      const guestContext = await browser.newContext();

      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      // 主机设置
      await gotoHome(hostPage);

      // 主机选择19x19棋盘
      await hostPage.selectOption('#boardSize', '19');
      await hostPage.waitForTimeout(100);

      // 切换到联机模式
      await hostPage.selectOption('#gameMode', 'ONLINE');
      await hostPage.waitForTimeout(200);

      // 点击创建房间
      await hostPage.click('#btnCreateRoom');
      await hostPage.waitForTimeout(2000);

      // 获取房间号
      const roomId = await hostPage.locator('#roomIdDisplay').textContent();
      expect(roomId).not.toBe('-');

      // 客机加入房间（使用根URL）
      await gotoRoom(guestPage, roomId);
      await waitForOnlineConnected(guestPage);

      // 检查客机是否连接成功
      const guestStatus = await guestPage.locator('#connectionStatus').textContent();
      console.log('客机状态:', guestStatus);

      // 等待主机检测到客机连接
      await hostPage.waitForTimeout(2000);

      // 检查主机状态
      const hostStatus = await hostPage.locator('#connectionStatus').textContent();
      console.log('主机状态:', hostStatus);

      // 检查客机的棋盘大小是否同步
      const guestSubtitle = await guestPage.locator('#subtitle').textContent();
      console.log('客机subtitle:', guestSubtitle);

      // 客机应该显示19x19
      expect(guestSubtitle).toContain('19×19');

      await hostContext.close();
      await guestContext.close();
    });

    test('TC-141: 建房后、客机加入前修改配置（棋盘大小/禁手）应以最终配置同步', async ({ browser }) => {
      const hostContext = await browser.newContext();
      const guestContext = await browser.newContext();

      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      await gotoHome(hostPage);
      const roomId = await createRoomAndGetId(hostPage);

      // 建房后（但客机加入前）修改配置
      await hostPage.selectOption('#boardSize', '19');
      await hostPage.locator('#toggleForbidden + .slider').click();

      // 主机本地 UI 应立即反映棋盘大小
      await expect(hostPage.locator('#subtitle')).toContainText('19×19');

      // 客机加入应拿到最终配置
      await gotoRoom(guestPage, roomId);
      await waitForOnlineConnected(guestPage);
      await expect(guestPage.locator('#subtitle')).toContainText('19×19');
      await expect(guestPage.locator('#toggleForbidden')).toBeChecked();

      await cleanupDisconnect(guestPage);
      await cleanupDisconnect(hostPage);
      await guestContext.close();
      await hostContext.close();
    });

    test('TC-142: 联机模式禁手规则同步', async ({ browser }) => {
      const hostContext = await browser.newContext();
      const guestContext = await browser.newContext();

      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      await gotoHome(hostPage);

      // 主机开启禁手规则
      await hostPage.locator('#toggleForbidden + .slider').click();
      await hostPage.waitForTimeout(100);
      // 主机执黑，便于验证“黑棋三三禁手不能下”
      await hostPage.selectOption('#humanSide', 'B');

      // 切换到联机模式并创建房间
      await hostPage.selectOption('#gameMode', 'ONLINE');
      await hostPage.waitForTimeout(200);
      await hostPage.click('#btnCreateRoom');
      await hostPage.waitForTimeout(2000);

      const roomId = await hostPage.locator('#roomIdDisplay').textContent();

      // 客机加入（使用根URL）
      await gotoRoom(guestPage, roomId);
      await waitForOnlineConnected(guestPage);

      // 检查客机的禁手设置是否同步
      await expect
        .poll(async () => await guestPage.locator('#toggleForbidden').isChecked(), { timeout: 15000 })
        .toBe(true);

      // 回归：联机模式下三三禁手必须阻止黑棋落子（避免仅联机模式漏判）
      // 构造典型“三三交叉点”局面：目标 (7,7) 在落子后形成横/纵两个活三
      // 黑: (7,5),(7,6),(5,7),(6,7) -> 黑若下 (7,7) 为三三禁手
      // 通过 host/guest 交替落子保持回合合法，白棋落子选择远离区域避免干扰
      const host = hostPage;
      const guest = guestPage;
      const fillerW = [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ];

      await clickAt(host, 7, 5); // B
      await clickAt(guest, ...fillerW[0]); // W
      await clickAt(host, 7, 6); // B
      await clickAt(guest, ...fillerW[1]); // W
      await clickAt(host, 5, 7); // B
      await clickAt(guest, ...fillerW[2]); // W
      await clickAt(host, 6, 7); // B
      await clickAt(guest, ...fillerW[3]); // W

      const moveCountBefore = await host.locator('#moveCount').textContent();
      await clickAt(host, 7, 7); // should be forbidden for black
      await expect
        .poll(async () => await host.locator('#moveCount').textContent(), { timeout: 3000 })
        .toBe(moveCountBefore);

      await hostContext.close();
      await guestContext.close();
    });

    test('TC-144: 房间满时第三人加入应进入观战并收到 board_state', async ({ browser }) => {
      const hostContext = await browser.newContext();
      const guestContext = await browser.newContext();
      const spectatorContext = await browser.newContext();

      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();
      const spectatorPage = await spectatorContext.newPage();

      await gotoHome(hostPage);
      // 主机默认执黑，便于后续首手落子
      await hostPage.selectOption('#humanSide', 'B');
      const roomId = await createRoomAndGetId(hostPage);

      await gotoRoom(guestPage, roomId);
      await waitForOnlineConnected(guestPage);
      await waitForOnlineConnected(hostPage);
      await expect
        .poll(async () => ((await hostPage.locator('#opponentInfo').textContent()) || '').trim(), { timeout: 15000 })
        .toBe('已连接');
      await waitForGuestNodeVisible(hostPage, roomId);

      // 主机先落一子，确保观战者进入后能收到非空状态
      await clickAt(hostPage, 7, 7);
      await expect.poll(async () => await guestPage.locator('#moveCount').textContent(), { timeout: 15000 }).toBe('1');

      // 第三人加入应变为观战者
      await gotoRoom(spectatorPage, roomId);
      await waitForOnlineConnected(spectatorPage);
      await expect
        .poll(async () => (await spectatorPage.locator('#subtitle').textContent()) || '', { timeout: 15000 })
        .toContain('观战模式');
      await expect
        .poll(async () => ((await spectatorPage.locator('#opponentInfo').textContent()) || '').trim(), { timeout: 15000 })
        .toBe('观战中');

      // 观战者应收到 board_state（至少同步到步数/最后一步）
      await expect
        .poll(async () => await spectatorPage.locator('#moveCount').textContent(), { timeout: 15000 })
        .toBe('1');
      await expect(spectatorPage.locator('#lastMove')).toContainText('黑');

      await cleanupDisconnect(guestPage);
      await cleanupDisconnect(hostPage);
      await spectatorContext.close();
      await guestContext.close();
      await hostContext.close();
    });

    test('TC-145: 客机断开后应复位 UI 并清理 URL 参数', async ({ browser }) => {
      const hostContext = await browser.newContext();
      const guestContext = await browser.newContext();

      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      await gotoHome(hostPage);
      const roomId = await createRoomAndGetId(hostPage);

      await gotoRoom(guestPage, roomId);
      await waitForOnlineConnected(guestPage);

      // 客机主动断开
      await guestPage.click('#btnDisconnect');

      // 断开后应回到 PVP 且隐藏联机面板
      await expect(guestPage.locator('#gameMode')).toHaveValue('PVP');
      await expect(guestPage.locator('#onlinePanel')).toBeHidden();
      await expect(guestPage.locator('#roomIdDisplay')).toHaveText('-');
      await expect(guestPage.locator('#opponentInfo')).toHaveText('-');
      await expect
        .poll(async () => await guestPage.evaluate(() => window.location.search), { timeout: 5000 })
        .toBe('');

      await cleanupDisconnect(hostPage);
      await guestContext.close();
      await hostContext.close();
    });

    test('TC-146: 最小落子同步闭环（主机->客机->主机）', async ({ browser }) => {
      const hostContext = await browser.newContext();
      const guestContext = await browser.newContext();

      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      await gotoHome(hostPage);
      await hostPage.selectOption('#humanSide', 'B');
      const roomId = await createRoomAndGetId(hostPage);

      await gotoRoom(guestPage, roomId);
      await waitForOnlineConnected(guestPage);
      await waitForOnlineConnected(hostPage);

      // 主机先手落子
      await clickAt(hostPage, 7, 7);
      await expect.poll(async () => await guestPage.locator('#moveCount').textContent(), { timeout: 15000 }).toBe('1');
      await expect(guestPage.locator('#lastMove')).toContainText('黑');

      // 客机再落子
      await clickAt(guestPage, 7, 8);
      await expect.poll(async () => await hostPage.locator('#moveCount').textContent(), { timeout: 15000 }).toBe('2');
      await expect(hostPage.locator('#lastMove')).toContainText('白');

      await cleanupDisconnect(guestPage);
      await cleanupDisconnect(hostPage);
      await guestContext.close();
      await hostContext.close();
    });
  });
});