import { describe, expect, it } from 'vitest';
import { EditHistory, HISTORY_LIMIT } from '../../src/core/history';
import type { CellEdit } from '../../src/core/store';

const edit = (row: number, next = 'x'): CellEdit => ({ row, col: 0, prev: undefined, next });

describe('编辑历史', () => {
  it('初始为空，不能撤销/重做', () => {
    const h = new EditHistory();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBeUndefined();
  });

  it('按 LIFO 弹出，撤销后可重做', () => {
    const h = new EditHistory();
    h.push([edit(1)]);
    h.push([edit(2)]);
    h.push([edit(3)]);
    expect(h.undoCount).toBe(3);

    expect(h.undo()?.[0].row).toBe(3);
    expect(h.redoCount).toBe(1);
    expect(h.undo()?.[0].row).toBe(2);
    expect(h.redo()?.[0].row).toBe(2);
    expect(h.redo()?.[0].row).toBe(3);
    expect(h.canRedo).toBe(false);
    expect(h.undoCount).toBe(3);
  });

  it('新操作清空重做栈', () => {
    const h = new EditHistory();
    h.push([edit(1)]);
    h.push([edit(2)]);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push([edit(9)]);
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBeUndefined();
  });

  it('撤销栈上限为 20 组，最旧的被丢弃', () => {
    const h = new EditHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h.push([edit(i, `v${i}`)]);
    expect(h.undoCount).toBe(HISTORY_LIMIT);

    const drained: number[] = [];
    let g: CellEdit[] | undefined;
    while ((g = h.undo())) drained.push(g[0].row);

    expect(drained).toHaveLength(HISTORY_LIMIT);
    expect(drained[0]).toBe(HISTORY_LIMIT + 5 - 1); // 最新的一组先弹出
    expect(drained[drained.length - 1]).toBe(5); // 最旧的 0..4 已被丢弃
    expect(h.canUndo).toBe(false);
  });

  it('空组不入栈', () => {
    const h = new EditHistory();
    h.push([]);
    expect(h.undoCount).toBe(0);
  });

  it('自定义上限生效', () => {
    const h = new EditHistory(3);
    for (let i = 0; i < 5; i++) h.push([edit(i)]);
    expect(h.undoCount).toBe(3);
  });
});
