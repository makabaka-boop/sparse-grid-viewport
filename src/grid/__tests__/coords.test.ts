import { describe, expect, it } from "vitest";
import {
  COLS,
  ROWS,
  clampCell,
  colOf,
  inRect,
  keyOf,
  normRect,
  rectCells,
  rowOf,
} from "../coords";

describe("坐标模型", () => {
  it("key 编解码互逆", () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [1, 199],
      [99999, 199],
      [54321, 87],
    ];
    for (const [r, c] of cases) {
      const k = keyOf(r, c);
      expect(rowOf(k)).toBe(r);
      expect(colOf(k)).toBe(c);
    }
  });

  it("clampCell 把地址限制在表格内", () => {
    expect(clampCell({ r: -5, c: 300 })).toEqual({ r: 0, c: COLS - 1 });
    expect(clampCell({ r: ROWS + 10, c: -1 })).toEqual({ r: ROWS - 1, c: 0 });
    expect(clampCell({ r: 7, c: 8 })).toEqual({ r: 7, c: 8 });
  });

  it("normRect 归一化反向锚点", () => {
    expect(normRect({ r: 5, c: 7 }, { r: 2, c: 3 })).toEqual({
      r0: 2,
      c0: 3,
      r1: 5,
      c1: 7,
    });
  });

  it("inRect / rectCells", () => {
    const rc = { r0: 2, c0: 3, r1: 5, c1: 7 };
    expect(inRect(rc, 2, 3)).toBe(true);
    expect(inRect(rc, 5, 7)).toBe(true);
    expect(inRect(rc, 6, 3)).toBe(false);
    expect(inRect(rc, 2, 8)).toBe(false);
    expect(rectCells(rc)).toBe(4 * 5);
  });
});
