/**
 * 坐标模型（coords）
 * ------------------
 * 只描述逻辑坐标：单元格引用、矩形区域及其运算。
 * 不关心渲染、滚动、存储或历史，其它模块以这里的类型为准。
 */

export const ROWS = 100_000;
export const COLS = 200;
export const FROZEN_ROWS = 1; // 首行冻结
export const FROZEN_COLS = 2; // 前两列冻结

/** 逻辑单元格坐标，0 基。 */
export interface CellRef {
  readonly row: number;
  readonly col: number;
}

/** 闭区间矩形区域（含 r2/c2）。 */
export interface CellRange {
  readonly r1: number;
  readonly c1: number;
  readonly r2: number;
  readonly c2: number;
}

export const FULL_RANGE: CellRange = { r1: 0, c1: 0, r2: ROWS - 1, c2: COLS - 1 };

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** 把坐标钳制到合法逻辑范围内。 */
export function clampRef(cell: CellRef): CellRef {
  return { row: clamp(cell.row, 0, ROWS - 1), col: clamp(cell.col, 0, COLS - 1) };
}

/** 由两个对角点构造规范化区域（r1<=r2, c1<=c2）。 */
export function normalizeRange(a: CellRef, b: CellRef): CellRange {
  return {
    r1: Math.min(a.row, b.row),
    c1: Math.min(a.col, b.col),
    r2: Math.max(a.row, b.row),
    c2: Math.max(a.col, b.col),
  };
}

export function rangeRows(range: CellRange): number {
  return range.r2 - range.r1 + 1;
}

export function rangeCols(range: CellRange): number {
  return range.c2 - range.c1 + 1;
}

export function rangeCellCount(range: CellRange): number {
  return rangeRows(range) * rangeCols(range);
}

export function containsRef(range: CellRange, cell: CellRef): boolean {
  return cell.row >= range.r1 && cell.row <= range.r2 && cell.col >= range.c1 && cell.col <= range.c2;
}

/** 两个区域的交集；不相交返回 null。 */
export function intersectRange(a: CellRange, b: CellRange): CellRange | null {
  const r1 = Math.max(a.r1, b.r1);
  const c1 = Math.max(a.c1, b.c1);
  const r2 = Math.min(a.r2, b.r2);
  const c2 = Math.min(a.c2, b.c2);
  return r1 <= r2 && c1 <= c2 ? { r1, c1, r2, c2 } : null;
}

/** 列号 -> 列名（0 -> A, 25 -> Z, 26 -> AA, 199 -> GR）。 */
export function colName(col: number): string {
  let n = col + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** A1 风格坐标名，如 {row:0,col:0} -> "A1"。 */
export function cellName(cell: CellRef): string {
  return `${colName(cell.col)}${cell.row + 1}`;
}
