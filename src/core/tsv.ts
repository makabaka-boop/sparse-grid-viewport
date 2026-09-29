/**
 * TSV 序列化 / 解析 / 粘贴规划（tsv）
 * -----------------------------------
 * 纯函数：把选区序列化为 TSV、把剪贴板文本解析为矩阵，
 * 并对粘贴做完整预校验（越界 / 超上限整体拒绝，不产生任何编辑）。
 */

import { COLS, ROWS, type CellRange, type CellRef } from './coords';
import type { CellStore } from './store';

export const MAX_PASTE_CELLS = 10_000;

/** 解析 TSV 文本为矩阵；兼容 CRLF，丢弃末尾一个空行（电子表格惯例）。 */
export function parseTSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => line.split('\t'));
}

/** 把区域内单元格序列化为 TSV（未编辑单元格输出空字段）。 */
export function serializeRange(store: CellStore, range: CellRange): string {
  const rows: string[] = [];
  for (let r = range.r1; r <= range.r2; r++) {
    const cols: string[] = [];
    for (let c = range.c1; c <= range.c2; c++) cols.push(store.get(r, c) ?? '');
    rows.push(cols.join('\t'));
  }
  return rows.join('\n');
}

export type PasteRejection = 'empty' | 'too-large' | 'out-of-bounds';

export interface PasteCell {
  row: number;
  col: number;
  value: string;
}

export type PastePlan =
  | { ok: true; cells: PasteCell[]; rows: number; cols: number }
  | { ok: false; reason: PasteRejection };

/**
 * 粘贴规划：先完整校验，再产出目标单元格列表。
 * - 空内容：拒绝；
 * - 外接矩形超过 MAX_PASTE_CELLS 格：整体拒绝；
 * - 超出逻辑边界：整体拒绝。
 * 返回 ok:false 时不产生任何 PasteCell，调用方不得修改存储。
 */
export function planPaste(
  anchor: CellRef,
  text: string,
  rowCount: number = ROWS,
  colCount: number = COLS,
): PastePlan {
  const matrix = parseTSV(text);
  if (matrix.length === 0 || (matrix.length === 1 && matrix[0].length === 1 && matrix[0][0] === '')) {
    return { ok: false, reason: 'empty' };
  }
  const rows = matrix.length;
  const cols = Math.max(...matrix.map((r) => r.length));
  if (rows * cols > MAX_PASTE_CELLS) return { ok: false, reason: 'too-large' };
  if (anchor.row < 0 || anchor.col < 0 || anchor.row + rows > rowCount || anchor.col + cols > colCount) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  const cells: PasteCell[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      cells.push({ row: anchor.row + i, col: anchor.col + j, value: matrix[i][j] });
    }
  }
  return { ok: true, cells, rows, cols };
}
