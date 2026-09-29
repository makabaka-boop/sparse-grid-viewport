import { expect, test, type Page } from "@playwright/test";

// 与 src/grid/viewport.ts 的 METRICS 对应
const COL_W = 120;
const ROW_H = 28;
const FROZEN_W = 240; // 前两列
const FROZEN_H = 28; // 首行

/** 元素相对网格主区域的坐标 */
async function rel(page: Page, selector: string) {
  const main = await page.getByTestId("main").boundingBox();
  const box = await page.locator(selector).boundingBox();
  if (!main || !box) throw new Error(`无法测量 ${selector}`);
  return { x: Math.round(box.x - main.x), y: Math.round(box.y - main.y) };
}

async function dispatchClipboard(page: Page, type: "copy" | "paste", text?: string) {
  return page.evaluate(
    ([t, payload]) => {
      const dt = new DataTransfer();
      if (payload !== undefined) dt.setData("text/plain", payload);
      document
        .getElementById("grid")!
        .dispatchEvent(
          new ClipboardEvent(t, { clipboardData: dt, bubbles: true, cancelable: true })
        );
      return dt.getData("text/plain");
    },
    [type, text] as const
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("冻结区交界：滚动时首行与前两列位置固定，正文从下方滑过", async ({ page }) => {
  const viewport = page.getByTestId("viewport");
  await viewport.evaluate((el) => {
    el.scrollLeft = 5000;
    el.scrollTop = 3000;
  });
  // 等待重渲染出目标单元格
  await expect(page.locator('[data-r="108"][data-c="44"]')).toBeVisible();

  // 角（首行 × 前两列）钉在 (0,0) 与 (120,0)
  expect(await rel(page, '[data-r="0"][data-c="0"]')).toEqual({ x: 0, y: 0 });
  expect(await rel(page, '[data-r="0"][data-c="1"]')).toEqual({ x: 120, y: 0 });
  // 冻结行：y 固定为 0，x 随滚动 → 44*120-5000=280
  expect(await rel(page, '[data-r="0"][data-c="44"]')).toEqual({ x: 280, y: 0 });
  // 冻结列：x 固定为 0/120，y 随滚动 → 108*28-3000=24
  expect(await rel(page, '[data-r="108"][data-c="0"]')).toEqual({ x: 0, y: 24 });
  expect(await rel(page, '[data-r="108"][data-c="1"]')).toEqual({ x: 120, y: 24 });
  // 正文单元格：两个方向都随滚动
  expect(await rel(page, '[data-r="108"][data-c="44"]')).toEqual({ x: 280, y: 24 });

  // 交界：冻结列右缘在 240px；第 43 列左缘 160px 被压在冻结层之下
  expect((await rel(page, '[data-r="108"][data-c="43"]')).x).toBe(160);
  const zFrozen = await page
    .locator('[data-r="108"][data-c="1"]')
    .evaluate((el) => Number(getComputedStyle(el).zIndex));
  const zBody = await page
    .locator('[data-r="108"][data-c="43"]')
    .evaluate((el) => Number(getComputedStyle(el).zIndex));
  expect(zFrozen).toBeGreaterThan(zBody);
});

test("键盘移动、选区扩展与滚动跟随", async ({ page }) => {
  const main = page.getByTestId("main");
  const box = (await main.boundingBox())!;

  // 点击单元格 (2,2)：x∈[240,360)，y∈[56,84)
  await page.mouse.click(box.x + 300, box.y + 70);
  await expect(page.getByTestId("active-addr")).toHaveText("R2 C2");

  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("active-addr")).toHaveText("R3 C2");
  await expect(page.locator("[data-active]")).toHaveAttribute("data-r", "3");

  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByTestId("active-addr")).toHaveText("R3 C3");
  await expect(page.locator("[data-selected]")).toHaveCount(2);

  // Ctrl+End 跳到末单元格：滚动跟随，活动格真实渲染且在可视区内
  await page.keyboard.press("Control+End");
  await expect(page.getByTestId("active-addr")).toHaveText("R99999 C199");
  const scroll = await page
    .getByTestId("viewport")
    .evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }));
  expect(scroll.top).toBeGreaterThan(2_000_000);
  expect(scroll.left).toBeGreaterThan(20_000);
  const active = page.locator("[data-active]");
  await expect(active).toHaveAttribute("data-r", "99999");
  await expect(active).toHaveAttribute("data-c", "199");
  const mainBox = (await main.boundingBox())!;
  const aBox = (await active.boundingBox())!;
  expect(aBox.x).toBeGreaterThanOrEqual(mainBox.x + FROZEN_W);
  expect(aBox.y).toBeGreaterThanOrEqual(mainBox.y + FROZEN_H);
  expect(aBox.x + aBox.width).toBeLessThanOrEqual(mainBox.x + mainBox.width);
  expect(aBox.y + aBox.height).toBeLessThanOrEqual(mainBox.y + mainBox.height);

  // Ctrl+Home 回到起点并复位滚动
  await page.keyboard.press("Control+Home");
  await expect(page.getByTestId("active-addr")).toHaveText("R0 C0");
  const scroll2 = await page
    .getByTestId("viewport")
    .evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }));
  expect(scroll2).toEqual({ top: 0, left: 0 });
});

test("大数据下 DOM 单元格数量有界", async ({ page }) => {
  const count0 = await page.locator("[data-cell]").count();
  expect(count0).toBeGreaterThan(50);
  expect(count0).toBeLessThan(500);

  await page.getByTestId("viewport").evaluate((el) => {
    el.scrollLeft = 12_000;
    el.scrollTop = 1_400_000; // 第 50000 行附近
  });
  await page.locator('[data-r="50000"]').first().waitFor();
  const count1 = await page.locator("[data-cell]").count();
  expect(count1).toBeLessThan(500);

  // 逻辑规模仍是 100000×200：spacer 撑出全部滚动范围
  const spacer = await page.getByTestId("viewport").evaluate((el) => {
    const s = el.firstElementChild as HTMLElement;
    return { w: s.offsetWidth, h: s.offsetHeight };
  });
  expect(spacer).toEqual({ w: 200 * COL_W, h: 100_000 * ROW_H });
});

test("编辑、TSV 粘贴/复制、越界与超量拒绝、成组撤销重做", async ({ page }) => {
  const main = page.getByTestId("main");
  const box = (await main.boundingBox())!;

  // 点击 (1,2) 后直接输入进入编辑，Enter 提交并下移
  await page.mouse.click(box.x + 300, box.y + 42);
  await expect(page.getByTestId("active-addr")).toHaveText("R1 C2");
  await page.keyboard.type("hello");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-r="1"][data-c="2"]')).toHaveText("hello");
  await expect(page.getByTestId("active-addr")).toHaveText("R2 C2");

  // 在 (2,2) 粘贴 2×2
  await dispatchClipboard(page, "paste", "a\tb\nc\td");
  await expect(page.locator('[data-r="2"][data-c="2"]')).toHaveText("a");
  await expect(page.locator('[data-r="2"][data-c="3"]')).toHaveText("b");
  await expect(page.locator('[data-r="3"][data-c="2"]')).toHaveText("c");
  await expect(page.locator('[data-r="3"][data-c="3"]')).toHaveText("d");
  await expect(page.locator("[data-selected]")).toHaveCount(4);

  // 选区复制为 TSV
  expect(await dispatchClipboard(page, "copy")).toBe("a\tb\nc\td");

  // 一步撤销回退整组 4 格，更早的编辑不受影响
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-r="2"][data-c="2"]')).toHaveText("");
  await expect(page.locator('[data-r="3"][data-c="3"]')).toHaveText("");
  await expect(page.locator('[data-r="1"][data-c="2"]')).toHaveText("hello");

  // 重做恢复整组
  await page.keyboard.press("Control+y");
  await expect(page.locator('[data-r="2"][data-c="2"]')).toHaveText("a");
  await expect(page.locator('[data-r="3"][data-c="3"]')).toHaveText("d");

  // 越界粘贴：末列 + 2 列数据 → 整次拒绝，不留部分修改
  await page.keyboard.press("Control+End");
  await dispatchClipboard(page, "paste", "p\tq");
  await expect(page.getByTestId("message")).toContainText("拒绝");
  await expect(page.locator('[data-r="99999"][data-c="199"]')).toHaveText("");

  // 超量粘贴：100×101 = 10100 格 → 整次拒绝
  await page.keyboard.press("Control+Home");
  await page.evaluate(() => {
    const row = Array(101).fill("v").join("\t");
    const text = Array(100).fill(row).join("\n");
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    document
      .getElementById("grid")!
      .dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      );
  });
  await expect(page.getByTestId("message")).toContainText("拒绝");
  await expect(page.locator('[data-r="0"][data-c="0"]')).toHaveText("");
});
