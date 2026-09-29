import { describe, expect, it } from "vitest";
import { History } from "../history";
import { keyOf } from "../coords";
import { applyGroup, type CellChange, type CellMap } from "../store";

describe("History 栈行为", () => {
  it("push / undo / redo 与标志位", () => {
    const h = new History<string>(20);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    h.push("a");
    h.push("b");
    expect(h.undoDepth).toBe(2);
    expect(h.undo()).toBe("b");
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe("b");
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe("b"); // redo 后回到最新状态，再撤销仍是 b
    expect(h.undo()).toBe("a");
    expect(h.undo()).toBeUndefined();
    expect(h.canUndo).toBe(false);
  });

  it("新 push 清空重做栈", () => {
    const h = new History<number>(20);
    h.push(1);
    h.push(2);
    h.undo();
    h.push(3);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBeUndefined();
  });

  it("容量 20：超出丢弃最旧一步", () => {
    const h = new History<number>(20);
    for (let i = 1; i <= 25; i++) h.push(i);
    expect(h.undoDepth).toBe(20);
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) seen.push(h.undo()!);
    expect(seen[0]).toBe(25);
    expect(seen[19]).toBe(6); // 1..5 已被挤出
    expect(h.canUndo).toBe(false);
  });
});

describe("成组撤销与稀疏存储", () => {
  it("一组多处修改作为一步撤销/重做", () => {
    let map: CellMap = new Map();
    const h = new History<CellChange[]>(20);
    const group: CellChange[] = [
      { key: keyOf(0, 0), prev: undefined, next: "a" },
      { key: keyOf(0, 1), prev: undefined, next: "b" },
      { key: keyOf(1, 0), prev: undefined, next: "c" },
    ];
    map = applyGroup(map, group, "next");
    h.push(group);
    expect(map.size).toBe(3);

    map = applyGroup(map, h.undo()!, "prev");
    expect(map.size).toBe(0);

    map = applyGroup(map, h.redo()!, "next");
    expect(map.get(keyOf(0, 1))).toBe("b");
  });

  it("清空单元格撤销后恢复原值；空值不留对象", () => {
    let map: CellMap = new Map([[keyOf(5, 5), "old"]]);
    const g: CellChange[] = [{ key: keyOf(5, 5), prev: "old", next: undefined }];
    map = applyGroup(map, g, "next");
    expect(map.has(keyOf(5, 5))).toBe(false);
    map = applyGroup(map, g, "prev");
    expect(map.get(keyOf(5, 5))).toBe("old");
  });

  it("20 步成组历史：逐步回滚，最旧一步被挤出后不可撤销", () => {
    let map: CellMap = new Map();
    const h = new History<CellChange[]>(20);
    for (let step = 0; step < 20; step++) {
      const g: CellChange[] = [
        { key: keyOf(step, 0), prev: undefined, next: `s${step}a` },
        { key: keyOf(step, 1), prev: undefined, next: `s${step}b` },
      ];
      map = applyGroup(map, g, "next");
      h.push(g);
    }
    expect(map.size).toBe(40);

    // 第 21 步挤出最旧的 step 0
    const g21: CellChange[] = [{ key: keyOf(20, 0), prev: undefined, next: "x" }];
    map = applyGroup(map, g21, "next");
    h.push(g21);
    expect(h.undoDepth).toBe(20);

    let g: CellChange[] | undefined;
    while ((g = h.undo())) map = applyGroup(map, g, "prev");

    // step 0 的两格已无法回滚，其余全部还原
    expect(map.get(keyOf(0, 0))).toBe("s0a");
    expect(map.get(keyOf(0, 1))).toBe("s0b");
    expect(map.size).toBe(2);
  });
});
