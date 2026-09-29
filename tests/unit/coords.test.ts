import { describe, expect, it } from 'vitest';
import {
  COLS,
  FROZEN_COLS,
  FROZEN_ROWS,
  ROWS,
  cellName,
  clampRef,
  colName,
  containsRef,
  intersectRange,
  normalizeRange,
  rangeCellCount,
} from '../../src/core/coords';

describe('坐标模型', () => {
  it('逻辑规模与冻结参数符合规格', () => {
    expect(ROWS).toBe(100_000);
    expect(COLS).toBe(200);
    expect(FROZEN_ROWS).toBe(1);
    expect(FROZEN_COLS).toBe(2);
  });

  it('colName 使用双射 26 进制', () => {
    expect(colName(0)).toBe('A');
    expect(colName(25)).toBe('Z');
    expect(colName(26)).toBe('AA');
    expect(colName(51)).toBe('AZ');
    expect(colName(52)).toBe('BA');
    expect(colName(199)).toBe('GR');
  });

  it('cellName 输出 A1 风格坐标', () => {
    expect(cellName({ row: 0, col: 0 })).toBe('A1');
    expect(cellName({ row: 9, col: 2 })).toBe('C10');
    expect(cellName({ row: 99_999, col: 199 })).toBe('GR100000');
  });

  it('clampRef 把坐标钳制进逻辑边界', () => {
    expect(clampRef({ row: -5, col: -1 })).toEqual({ row: 0, col: 0 });
    expect(clampRef({ row: 1_000_000, col: 999 })).toEqual({ row: ROWS - 1, col: COLS - 1 });
    expect(clampRef({ row: 3, col: 4 })).toEqual({ row: 3, col: 4 });
  });

  it('normalizeRange 规范化任意对角点', () => {
    expect(normalizeRange({ row: 5, col: 7 }, { row: 2, col: 3 })).toEqual({ r1: 2, c1: 3, r2: 5, c2: 7 });
    expect(normalizeRange({ row: 1, col: 1 }, { row: 1, col: 1 })).toEqual({ r1: 1, c1: 1, r2: 1, c2: 1 });
  });

  it('intersectRange 求交，相邻或相离返回 null', () => {
    const a = { r1: 0, c1: 0, r2: 3, c2: 3 };
    expect(intersectRange(a, { r1: 2, c1: 2, r2: 9, c2: 9 })).toEqual({ r1: 2, c1: 2, r2: 3, c2: 3 });
    expect(intersectRange(a, { r1: 4, c1: 0, r2: 5, c2: 1 })).toBeNull();
    expect(intersectRange(a, { r1: 0, c1: 4, r2: 1, c2: 5 })).toBeNull();
  });

  it('containsRef 与 rangeCellCount', () => {
    const range = { r1: 1, c1: 2, r2: 3, c2: 4 };
    expect(containsRef(range, { row: 1, col: 2 })).toBe(true);
    expect(containsRef(range, { row: 3, col: 4 })).toBe(true);
    expect(containsRef(range, { row: 0, col: 2 })).toBe(false);
    expect(rangeCellCount(range)).toBe(9);
  });
});
