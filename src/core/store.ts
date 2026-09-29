/**
 * 稀疏单元格存储（store）
 * -----------------------
 * 只为“被编辑过”的单元格分配数据：内部是 Map<线性键, 值>，
 * 未编辑或已清空的单元格不占用任何条目。
 * 存储只认识 CellEdit（同时携带 prev/next），不管理历史栈。
 */

import { COLS } from './coords';

export type CellValue = string;

export interface CellEdit {
  row: number;
  col: number;
  prev: CellValue | undefined;
  next: CellValue | undefined;
}

const normalize = (v: CellValue | undefined): CellValue | undefined =>
  v === undefined || v === '' ? undefined : v;

export class CellStore {
  private readonly cells = new Map<number, CellValue>();

  /** 已分配的单元格数量（用于验证稀疏性）。 */
  get size(): number {
    return this.cells.size;
  }

  get(row: number, col: number): CellValue | undefined {
    return this.cells.get(row * COLS + col);
  }

  /** 遍历已分配的单元格（稀疏，复杂度 O(已分配)）。 */
  *entries(): IterableIterator<{ row: number; col: number; value: CellValue }> {
    for (const [key, value] of this.cells) {
      yield { row: Math.floor(key / COLS), col: key % COLS, value };
    }
  }

  /** 应用一组编辑的 next 侧（执行/重做）。 */
  applyEdits(edits: readonly CellEdit[]): void {
    for (const e of edits) this.write(e.row, e.col, e.next);
  }

  /** 应用一组编辑的 prev 侧（撤销）。 */
  revertEdits(edits: readonly CellEdit[]): void {
    for (const e of edits) this.write(e.row, e.col, e.prev);
  }

  private write(row: number, col: number, value: CellValue | undefined): void {
    const key = row * COLS + col;
    const v = normalize(value);
    if (v === undefined) this.cells.delete(key);
    else this.cells.set(key, v);
  }
}
