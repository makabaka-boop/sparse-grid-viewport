import { describe, expect, it } from "vitest";
import { COLS, ROWS, keyOf } from "../coords";
import type { CellMap } from "../store";
import { MAX_PASTE_CELLS, parseTSV, planPaste, selectionToTSV } from "../tsv";

describe("parseTSV", () => {
  it("解析 CRLF / 尾随换行 / 参差行", () => {
    expect(parseTSV("a\tb\r\nc\r\n")).toEqual([["a", "b"], ["c"]]);
    expect(parseTSV("")).toEqual([[""]]);
    expect(parseTSV("a\n\nb")).toEqual([["a"], [""], ["b"]]);
  });
});

describe("planPaste 校验", () => {
  const empty: CellMap = new Map();

  it("越界整次拒绝", () => {
    const r1 = planPaste(empty, { r: ROWS - 1, c: 0 }, parseTSV("a\nb"));
    expect(r1.ok).toBe(false);
    const r2 = planPaste(empty, { r: 0, c: COLS - 1 }, parseTSV("a\tb"));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toContain("边界");
  });

  it("超过 10000 格整次拒绝", () => {
    const cols = 100;
    const rows = MAX_PASTE_CELLS / cols + 1; // 101 → 10100 格
    const data = Array.from({ length: rows }, () => Array(cols).fill("x"));
    const r = planPaste(empty, { r: 0, c: 0 }, data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("上限");
  });

  it("恰好 10000 格允许", () => {
    const data = Array.from({ length: 100 }, () => Array(100).fill("x"));
    const r = planPaste(empty, { r: 0, c: 0 }, data);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.changes).toHaveLength(10_000);
  });

  it("贴着表格右下角允许", () => {
    const r = planPaste(empty, { r: ROWS - 1, c: COLS - 1 }, parseTSV("z"));
    expect(r.ok).toBe(true);
  });

  it("空字符串清除已有值；无变化不产生 change", () => {
    const map: CellMap = new Map([
      [keyOf(0, 0), "old"],
      [keyOf(0, 1), "same"],
    ]);
    const r = planPaste(map, { r: 0, c: 0 }, parseTSV("\tsame"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.changes).toEqual([
        { key: keyOf(0, 0), prev: "old", next: undefined },
      ]);
    }
  });

  it("参差行按最大列数补齐为空", () => {
    const r = planPaste(empty, { r: 3, c: 4 }, parseTSV("a\tb\nc"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toBe(2);
      expect(r.cols).toBe(2);
      // (3,4)=a (3,5)=b (4,4)=c；(4,5) 原本为空，不产生 change
      expect(r.changes).toHaveLength(3);
    }
  });
});

describe("selectionToTSV", () => {
  it("按选区导出，缺失单元格为空", () => {
    const map: CellMap = new Map([
      [keyOf(1, 2), "x"],
      [keyOf(2, 3), "y"],
    ]);
    expect(selectionToTSV(map, { r0: 1, c0: 2, r1: 2, c1: 3 })).toBe(
      "x\t\n\ty"
    );
  });
});
