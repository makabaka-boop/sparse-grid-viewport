import { describe, expect, it } from "vitest";
import {
  METRICS as M,
  maxScrollLeft,
  maxScrollTop,
  scrollCellIntoView,
  totalHeight,
  totalWidth,
  visibleBodyRange,
} from "../viewport";

// M: rowHeight=28, colWidth=120, frozenRows=1, frozenCols=2
// 冻结区 240×28；总尺寸 24000×2800000
const view = { width: 1000, height: 700 };

describe("可见区计算", () => {
  it("总尺寸与最大滚动量", () => {
    expect(totalWidth(M)).toBe(24_000);
    expect(totalHeight(M)).toBe(2_800_000);
    expect(maxScrollLeft(M, view)).toBe(23_000);
    expect(maxScrollTop(M, view)).toBe(2_799_300);
  });

  it("滚动为 0 时正文窗口从冻结条之后开始", () => {
    expect(visibleBodyRange(M, { top: 0, left: 0 }, view)).toEqual({
      r0: 1,
      r1: 25,
      c0: 2,
      c1: 9,
    });
  });

  it("滚动后窗口按像素映射到逻辑行列", () => {
    expect(visibleBodyRange(M, { top: 3000, left: 5000 }, view)).toEqual({
      r0: 107,
      r1: 133,
      c0: 42,
      c1: 50,
    });
  });

  it("滚动到底/右时窗口钳制在表格末尾", () => {
    const range = visibleBodyRange(
      M,
      { top: maxScrollTop(M, view), left: maxScrollLeft(M, view) },
      view
    );
    expect(range.r1).toBe(99_999);
    expect(range.c1).toBe(199);
    expect(range.r0).toBe(99_975);
    expect(range.c0).toBe(192);
  });
});

describe("滚动跟随（键盘导航）", () => {
  it("已在可视区内的单元格不改变滚动", () => {
    expect(scrollCellIntoView(M, { top: 0, left: 0 }, view, { r: 10, c: 5 }))
      .toEqual({ top: 0, left: 0 });
  });

  it("向右越界时向右滚动", () => {
    // c=20 → x1=2520 > 1000 → left=1520
    expect(scrollCellIntoView(M, { top: 0, left: 0 }, view, { r: 10, c: 20 }))
      .toEqual({ top: 0, left: 1520 });
  });

  it("向左回退时考虑冻结列宽度", () => {
    // c=3 → x0=360 < 1520+240 → left=360-240=120
    expect(
      scrollCellIntoView(M, { top: 0, left: 1520 }, view, { r: 10, c: 3 })
    ).toEqual({ top: 0, left: 120 });
  });

  it("冻结行/列内的单元格不触发对应轴滚动", () => {
    const s = { top: 5000, left: 5000 };
    expect(scrollCellIntoView(M, s, view, { r: 0, c: 1 })).toEqual(s);
    // 冻结行 + 正文列：只调水平轴
    expect(scrollCellIntoView(M, s, view, { r: 0, c: 50 })).toEqual({
      top: 5000,
      left: 5120,
    });
  });

  it("末行末列钳制在最大滚动量", () => {
    expect(
      scrollCellIntoView(M, { top: 0, left: 0 }, view, { r: 99_999, c: 199 })
    ).toEqual({ top: 2_799_300, left: 23_000 });
  });

  it("从底部跳回顶部附近时钳制到 0", () => {
    expect(
      scrollCellIntoView(
        M,
        { top: 2_799_300, left: 23_000 },
        view,
        { r: 1, c: 2 }
      )
    ).toEqual({ top: 0, left: 0 });
  });
});
