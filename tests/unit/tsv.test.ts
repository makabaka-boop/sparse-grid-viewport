import { describe, expect, it } from 'vitest';
import { MAX_PASTE_CELLS, parseTSV, planPaste, serializeRange } from '../../src/core/tsv';
import { CellStore } from '../../src/core/store';
import { COLS, ROWS } from '../../src/core/coords';

describe('TSV 解析', () => {
  it('按制表符与换行切分', () => {
    expect(parseTSV('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('兼容 CRLF 并丢弃末尾一个空行', () => {
    expect(parseTSV('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseTSV('a\n')).toEqual([['a']]);
  });

  it('保留中间的空行与空字段', () => {
    expect(parseTSV('a\n\nb')).toEqual([['a'], [''], ['b']]);
    expect(parseTSV('a\t\tc')).toEqual([['a', '', 'c']]);
  });
});

describe('TSV 序列化', () => {
  it('未编辑单元格输出空字段，行列对齐', () => {
    const store = new CellStore();
    store.applyEdits([
      { row: 0, col: 0, prev: undefined, next: 'x' },
      { row: 0, col: 2, prev: undefined, next: 'z' },
      { row: 2, col: 1, prev: undefined, next: 'y' },
    ]);
    expect(serializeRange(store, { r1: 0, c1: 0, r2: 2, c2: 2 })).toBe('x\t\tz\n\t\t\n\ty\t');
  });

  it('序列化后再解析可还原矩阵', () => {
    const store = new CellStore();
    store.applyEdits([
      { row: 3, col: 4, prev: undefined, next: 'hello' },
      { row: 5, col: 6, prev: undefined, next: 'world' },
    ]);
    const range = { r1: 3, c1: 4, r2: 5, c2: 6 };
    const matrix = parseTSV(serializeRange(store, range));
    expect(matrix).toEqual([
      ['hello', '', ''],
      ['', '', ''],
      ['', '', 'world'],
    ]);
  });
});

describe('粘贴规划（整体校验，拒绝时不产生任何单元格）', () => {
  it('合法粘贴产出全部目标单元格', () => {
    const plan = planPaste({ row: 2, col: 3 }, 'a\tb\nc');
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.rows).toBe(2);
      expect(plan.cols).toBe(2);
      expect(plan.cells).toEqual([
        { row: 2, col: 3, value: 'a' },
        { row: 2, col: 4, value: 'b' },
        { row: 3, col: 3, value: 'c' },
      ]);
    }
  });

  it('空内容被拒绝', () => {
    expect(planPaste({ row: 0, col: 0 }, '')).toEqual({ ok: false, reason: 'empty' });
    expect(planPaste({ row: 0, col: 0 }, '\n')).toEqual({ ok: false, reason: 'empty' });
  });

  it('超过 10,000 格整体拒绝', () => {
    const big = Array.from({ length: 101 }, () => new Array(100).fill('v').join('\t')).join('\n');
    expect(101 * 100).toBeGreaterThan(MAX_PASTE_CELLS);
    expect(planPaste({ row: 0, col: 0 }, big)).toEqual({ ok: false, reason: 'too-large' });
  });

  it('恰好 10,000 格允许', () => {
    const exact = Array.from({ length: 100 }, () => new Array(100).fill('v').join('\t')).join('\n');
    const plan = planPaste({ row: 0, col: 0 }, exact);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.cells).toHaveLength(10_000);
  });

  it('越界整体拒绝：右、下、负坐标', () => {
    expect(planPaste({ row: 0, col: COLS - 1 }, 'a\tb')).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(planPaste({ row: ROWS - 1, col: 0 }, 'a\nb')).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(planPaste({ row: -1, col: 0 }, 'a')).toEqual({ ok: false, reason: 'out-of-bounds' });
  });

  it('边界角落的单元格可以粘贴', () => {
    expect(planPaste({ row: ROWS - 1, col: COLS - 1 }, 'a').ok).toBe(true);
    expect(planPaste({ row: 0, col: 0 }, 'a').ok).toBe(true);
  });
});
