import { expect, test, type Page } from '@playwright/test';

const ROW_H = 28;
const COL_W = 110;
const FROZEN_W = 220; // 前两列
const FROZEN_H = 28; // 首行

async function dispatchPaste(page: Page, text: string) {
  await page.locator('[data-testid="hidden-input"]').evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

async function dispatchCopy(page: Page): Promise<string> {
  return page.locator('[data-testid="hidden-input"]').evaluate((el) => {
    const dt = new DataTransfer();
    el.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    return dt.getData('text/plain');
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-cell="0:0"]')).toBeVisible();
});

test('虚拟化：DOM 数量有界，滚动区域覆盖 100,000 × 200', async ({ page }) => {
  const cells = page.locator('[data-cell]');
  const count = await cells.count();
  expect(count).toBeGreaterThan(50);
  expect(count).toBeLessThan(2000); // 绝不渲染整张表（2000 万格）

  const main = page.locator('[data-testid="main-pane"]');
  const dims = await main.evaluate((el) => ({ w: el.scrollWidth, h: el.scrollHeight }));
  expect(dims.h).toBe((100_000 - 1) * ROW_H);
  expect(dims.w).toBe((200 - 2) * COL_W);

  // 直接滚到右下角，最后一格应被渲染出来
  await main.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = el.scrollWidth;
  });
  await expect(page.locator('[data-cell="99999:199"]')).toBeVisible();
  await expect(page.locator('[data-cell="0:0"]')).toBeVisible(); // 冻结角仍在
  expect(await cells.count()).toBeLessThan(2000);
});

test('冻结区交界：表头与冻结列在滚动时与主体保持同一逻辑坐标', async ({ page }) => {
  // 未编辑时表头行显示列名、首列显示行号（占位符，与逻辑坐标一致）
  await expect(page.locator('[data-cell="0:5"]')).toHaveText('F');
  await expect(page.locator('[data-cell="7:0"]')).toHaveText('8');

  const main = page.locator('[data-testid="main-pane"]');
  const root = page.locator('[data-testid="grid-root"]');
  const rootBox = (await root.boundingBox())!;
  const cornerBefore = (await page.locator('[data-cell="0:0"]').boundingBox())!;

  await main.evaluate((el) => {
    el.scrollTop = 120;
    el.scrollLeft = 250;
  });

  // 等待 React 同步冻结窗格：表头格与主体格同列对齐
  await expect
    .poll(async () => {
      const h = await page.locator('[data-cell="0:8"]').boundingBox();
      const b = await page.locator('[data-cell="5:8"]').boundingBox();
      return h && b ? Math.round(h.x) - Math.round(b.x) : null;
    })
    .toBe(0);

  const header = (await page.locator('[data-cell="0:8"]').boundingBox())!;
  const body = (await page.locator('[data-cell="5:8"]').boundingBox())!;
  const left = (await page.locator('[data-cell="5:0"]').boundingBox())!;
  const corner = (await page.locator('[data-cell="0:0"]').boundingBox())!;

  // 冻结角不随滚动移动
  expect(Math.round(corner.x)).toBe(Math.round(cornerBefore.x));
  expect(Math.round(corner.y)).toBe(Math.round(cornerBefore.y));

  // 表头行钉在顶部条带内，且与主体同列对齐
  expect(header.y).toBeLessThan(rootBox.y + FROZEN_H);
  expect(Math.round(header.x)).toBe(Math.round(body.x));

  // 冻结列钉在左侧条带内，且与主体同行对齐
  expect(left.x).toBeLessThan(rootBox.x + FROZEN_W);
  expect(Math.round(left.y)).toBe(Math.round(body.y));

  // 冻结交界线位置精确
  const topPane = (await page.locator('[data-testid="top-pane"]').boundingBox())!;
  expect(Math.round(topPane.y + topPane.height - rootBox.y)).toBe(FROZEN_H);
  const leftPane = (await page.locator('[data-testid="left-pane"]').boundingBox())!;
  expect(Math.round(leftPane.x + leftPane.width - rootBox.x)).toBe(FROZEN_W);

  // 主体格位置 = 逻辑坐标换算 - 滚动量
  expect(Math.round(body.x)).toBe(Math.round(rootBox.x + FROZEN_W + 6 * COL_W - 250));
  expect(Math.round(body.y)).toBe(Math.round(rootBox.y + FROZEN_H + 4 * ROW_H - 120));
});

test('键盘移动：焦点、选区与逻辑坐标一致，越界自动滚动', async ({ page }) => {
  await page.locator('[data-cell="2:3"]').click();
  await expect(page.locator('[data-testid="status-active"]')).toHaveText('D3');

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid="status-active"]')).toHaveText('E3');

  // Shift 扩展选区
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator('[data-testid="status-selection"]')).toHaveText('3×1');

  // 普通方向键折叠选区并移动
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-testid="status-active"]')).toHaveText('D5');
  await expect(page.locator('[data-testid="status-selection"]')).toHaveText('1×1');

  const rootBox = (await page.locator('[data-testid="grid-root"]').boundingBox())!;

  // Home 进入冻结列：焦点框位于左侧条带
  await page.keyboard.press('Home');
  await expect(page.locator('[data-testid="status-active"]')).toHaveText('A5');
  const o1 = (await page.locator('[data-testid="active-outline"]').boundingBox())!;
  expect(o1.x).toBeLessThan(rootBox.x + FROZEN_W);
  expect(o1.y).toBeGreaterThan(rootBox.y + FROZEN_H);

  // Ctrl+Home 进入冻结角
  await page.keyboard.press('Control+Home');
  await expect(page.locator('[data-testid="status-active"]')).toHaveText('A1');
  const o2 = (await page.locator('[data-testid="active-outline"]').boundingBox())!;
  expect(o2.x).toBeLessThan(rootBox.x + FROZEN_W);
  expect(o2.y).toBeLessThan(rootBox.y + FROZEN_H);

  // 连续向下越过视口：主窗格自动滚动，焦点框始终可见
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid="status-active"]')).toHaveText('A42');
  const scrollTop = await page.locator('[data-testid="main-pane"]').evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  const o3 = (await page.locator('[data-testid="active-outline"]').boundingBox())!;
  expect(o3.y).toBeGreaterThanOrEqual(rootBox.y + FROZEN_H - 1);
  expect(o3.y + o3.height).toBeLessThanOrEqual(rootBox.y + rootBox.height + 1);

  // Ctrl+End 跳到最后一格：焦点框落在主窗格内
  await page.keyboard.press('Control+End');
  await expect(page.locator('[data-testid="status-active"]')).toHaveText('GR100000');
  await expect(page.locator('[data-cell="99999:199"]')).toBeVisible();
  const o4 = (await page.locator('[data-testid="active-outline"]').boundingBox())!;
  const mainBox = (await page.locator('[data-testid="main-pane"]').boundingBox())!;
  expect(o4.x).toBeGreaterThanOrEqual(mainBox.x - 1);
  expect(o4.x + o4.width).toBeLessThanOrEqual(mainBox.x + mainBox.width + 1);
  expect(o4.y).toBeGreaterThanOrEqual(mainBox.y - 1);
  expect(o4.y + o4.height).toBeLessThanOrEqual(mainBox.y + mainBox.height + 1);
});

test('编辑、TSV 复制粘贴与成组撤销重做', async ({ page }) => {
  // 输入即编辑，Enter 提交并下移
  await page.locator('[data-cell="1:2"]').click();
  await page.keyboard.type('hello');
  await expect(page.locator('[data-testid="cell-editor"]')).toHaveValue('hello');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-cell="1:2"]')).toHaveText('hello');
  await expect(page.locator('[data-testid="status-active"]')).toHaveText('C3');

  // Escape 取消编辑
  await page.keyboard.type('xyz');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-cell="2:2"]')).toHaveText('');

  // 粘贴 2×2
  await page.locator('[data-cell="1:2"]').click();
  await dispatchPaste(page, 'a\tb\nc\td');
  await expect(page.locator('[data-cell="1:2"]')).toHaveText('a');
  await expect(page.locator('[data-cell="1:3"]')).toHaveText('b');
  await expect(page.locator('[data-cell="2:2"]')).toHaveText('c');
  await expect(page.locator('[data-cell="2:3"]')).toHaveText('d');
  await expect(page.locator('[data-testid="status-message"]')).toContainText('已粘贴');

  // 框选 2×2 复制出同样的 TSV
  await page.locator('[data-cell="1:2"]').click();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await dispatchCopy(page)).toBe('a\tb\nc\td');

  // 粘贴到别处
  await page.locator('[data-cell="5:5"]').click();
  await dispatchPaste(page, 'a\tb\nc\td');
  await expect(page.locator('[data-cell="5:5"]')).toHaveText('a');
  await expect(page.locator('[data-cell="6:6"]')).toHaveText('d');

  // 一次撤销回滚整组粘贴，更早的编辑不受影响
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-cell="5:5"]')).toHaveText('');
  await expect(page.locator('[data-cell="6:6"]')).toHaveText('');
  await expect(page.locator('[data-cell="1:2"]')).toHaveText('a');

  // 重做恢复整组
  await page.keyboard.press('Control+y');
  await expect(page.locator('[data-cell="5:5"]')).toHaveText('a');
  await expect(page.locator('[data-cell="6:6"]')).toHaveText('d');
});

test('越界或超过 10,000 格的粘贴被整体拒绝', async ({ page }) => {
  await page.locator('[data-cell="1:2"]').click();
  const big = Array.from({ length: 101 }, () => new Array(100).fill('v').join('\t')).join('\n');
  await dispatchPaste(page, big);
  await expect(page.locator('[data-testid="status-message"]')).toContainText('拒绝');
  await expect(page.locator('[data-cell="1:2"]')).toHaveText('');
  await expect(page.locator('[data-testid="status-history"]')).toContainText('撤销 0');

  // 最后一格粘贴两列 → 越界，目标格保持为空（无部分写入）
  await page.keyboard.press('Control+End');
  await dispatchPaste(page, 'x\ty');
  await expect(page.locator('[data-testid="status-message"]')).toContainText('拒绝');
  await expect(page.locator('[data-cell="99999:199"]')).toHaveText('');
});
