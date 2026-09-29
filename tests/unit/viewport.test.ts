import { describe, expect, it } from 'vitest';
import { computeVisibleRange, maxScrollOffset, scrollToReveal } from '../../src/core/viewport';

/** 确定性伪随机数（LCG），保证对拍可复现。 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * 暴力参考实现：逐个索引判断单元格区间 [i*size, (i+1)*size)
 * 是否与 [scroll, scroll+viewport) 相交。与 computeVisibleRange 独立实现。
 */
function refAxis(scroll: number, viewport: number, count: number, size: number): [number, number] {
  const max = Math.max(0, count * size - viewport);
  const s = Math.min(Math.max(scroll, 0), max);
  let start = -1;
  let end = -1;
  for (let i = 0; i < count; i++) {
    const a = i * size;
    if (a + size > s && a < s + viewport) {
      if (start < 0) start = i;
      end = i + 1;
    }
  }
  return start < 0 ? [0, 0] : [start, end];
}

describe('可见区计算（对拍暴力参考）', () => {
  it('随机滚动位置下与暴力参考一致', () => {
    const rng = lcg(1234567);
    for (let iter = 0; iter < 300; iter++) {
      const rowCount = 1 + Math.floor(rng() * 1000);
      const colCount = 1 + Math.floor(rng() * 60);
      const rowHeight = 20 + Math.floor(rng() * 20);
      const colWidth = 60 + Math.floor(rng() * 80);
      const vh = Math.floor(rng() * 1200);
      const vw = Math.floor(rng() * 1600);
      const maxTop = Math.max(0, rowCount * rowHeight - vh);
      const maxLeft = Math.max(0, colCount * colWidth - vw);
      // 故意产生越界滚动值，同时验证钳制逻辑
      const top = Math.floor(rng() * (maxTop + 200)) - 50;
      const left = Math.floor(rng() * (maxLeft + 200)) - 50;

      const win = computeVisibleRange({
        scrollTop: top,
        scrollLeft: left,
        viewportHeight: vh,
        viewportWidth: vw,
        rowCount,
        colCount,
        rowHeight,
        colWidth,
        overscan: 0,
      });
      const [rs, re] = refAxis(top, vh, rowCount, rowHeight);
      const [cs, ce] = refAxis(left, vw, colCount, colWidth);

      expect(win.endRow - win.startRow).toBe(re - rs);
      expect(win.endCol - win.startCol).toBe(ce - cs);
      if (re - rs > 0) expect([win.startRow, win.endRow]).toEqual([rs, re]);
      if (ce - cs > 0) expect([win.startCol, win.endCol]).toEqual([cs, ce]);
    }
  });

  it('完整逻辑规模（100,000 × 200）的边界滚动', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [28, 110],
      [999_999, 3_333],
      [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      [-100, -100],
    ];
    for (const [top, left] of cases) {
      const win = computeVisibleRange({
        scrollTop: top,
        scrollLeft: left,
        viewportHeight: 600,
        viewportWidth: 1000,
        rowCount: 100_000,
        colCount: 200,
        rowHeight: 28,
        colWidth: 110,
        overscan: 0,
      });
      const [rs, re] = refAxis(top, 600, 100_000, 28);
      const [cs, ce] = refAxis(left, 1000, 200, 110);
      expect([win.startRow, win.endRow]).toEqual([rs, re]);
      expect([win.startCol, win.endCol]).toEqual([cs, ce]);
    }
  });

  it('滚动超出最大值时被钳制，末尾完整可见', () => {
    const win = computeVisibleRange({
      scrollTop: 10 ** 9,
      scrollLeft: 10 ** 9,
      viewportHeight: 56,
      viewportWidth: 220,
      rowCount: 10,
      colCount: 5,
      rowHeight: 28,
      colWidth: 110,
      overscan: 0,
    });
    expect(win.endRow).toBe(10);
    expect(win.endCol).toBe(5);
    expect(win.startRow).toBe(8); // 内容 280px，视口 56px → 最大滚动 224 → 起始行 8
    expect(win.startCol).toBe(3);
  });

  it('overscan 向外扩展并钳制到边界', () => {
    const win = computeVisibleRange({
      scrollTop: 0,
      scrollLeft: 0,
      viewportHeight: 100,
      viewportWidth: 200,
      rowCount: 50,
      colCount: 10,
      rowHeight: 20,
      colWidth: 50,
      overscan: 3,
    });
    expect(win.startRow).toBe(0);
    expect(win.startCol).toBe(0);
    expect(win.endRow).toBe(Math.ceil(100 / 20) + 3);
    expect(win.endCol).toBe(Math.ceil(200 / 50) + 3);
  });

  it('maxScrollOffset 不为负', () => {
    expect(maxScrollOffset(100, 600)).toBe(0);
    expect(maxScrollOffset(600, 100)).toBe(500);
  });
});

describe('scrollToReveal', () => {
  it('已可见时保持滚动值不变', () => {
    expect(scrollToReveal(100, 20, 200, 50)).toBe(50);
    expect(scrollToReveal(50, 20, 200, 50)).toBe(50);
    expect(scrollToReveal(230, 20, 200, 50)).toBe(50);
  });

  it('在视口上方时向上对齐', () => {
    expect(scrollToReveal(0, 20, 200, 50)).toBe(0);
    expect(scrollToReveal(30, 20, 200, 50)).toBe(30);
  });

  it('在视口下方时滚动到刚好露出', () => {
    expect(scrollToReveal(300, 20, 200, 50)).toBe(120);
    expect(scrollToReveal(251, 20, 200, 50)).toBe(71);
  });
});
