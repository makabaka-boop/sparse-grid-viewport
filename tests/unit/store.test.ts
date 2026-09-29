import { describe, expect, it } from 'vitest';
import { CellStore, type CellEdit } from '../../src/core/store';

describe('稀疏单元格存储', () => {
  it('未编辑的单元格不分配数据对象', () => {
    const store = new CellStore();
    expect(store.size).toBe(0);
    expect(store.get(0, 0)).toBeUndefined();
    expect(store.get(99_999, 199)).toBeUndefined();
  });

  it('applyEdits 写入，revertEdits 还原', () => {
    const store = new CellStore();
    const edits: CellEdit[] = [
      { row: 0, col: 0, prev: undefined, next: 'a' },
      { row: 5, col: 3, prev: undefined, next: 'b' },
    ];
    store.applyEdits(edits);
    expect(store.size).toBe(2);
    expect(store.get(0, 0)).toBe('a');
    expect(store.get(5, 3)).toBe('b');

    store.revertEdits(edits);
    expect(store.size).toBe(0);
    expect(store.get(0, 0)).toBeUndefined();
  });

  it('空字符串与 undefined 都视为未分配（保持稀疏）', () => {
    const store = new CellStore();
    store.applyEdits([{ row: 1, col: 1, prev: undefined, next: '' }]);
    expect(store.size).toBe(0);
    store.applyEdits([{ row: 1, col: 1, prev: undefined, next: 'x' }]);
    store.applyEdits([{ row: 1, col: 1, prev: 'x', next: '' }]);
    expect(store.size).toBe(0);
  });

  it('entries 只遍历已分配单元格', () => {
    const store = new CellStore();
    store.applyEdits([
      { row: 10, col: 5, prev: undefined, next: 'v1' },
      { row: 99_999, col: 199, prev: undefined, next: 'v2' },
    ]);
    const all = [...store.entries()];
    expect(all).toHaveLength(2);
    expect(all).toContainEqual({ row: 10, col: 5, value: 'v1' });
    expect(all).toContainEqual({ row: 99_999, col: 199, value: 'v2' });
  });
});
