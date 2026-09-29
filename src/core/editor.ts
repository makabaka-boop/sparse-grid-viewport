/**
 * 编辑器控制器（editor）
 * ----------------------
 * 组合 store / history / tsv / coords 的唯一入口：
 * 所有修改都收敛为“一组 CellEdit 的原子提交”——
 * 校验通过才应用，应用即入历史；校验失败则什么都不发生。
 * UI 通过 subscribe/getVersion 感知变化。
 */

import { containsRef, type CellRange, type CellRef } from './coords';
import { EditHistory } from './history';
import { CellStore, type CellEdit } from './store';
import { planPaste, serializeRange, type PasteRejection } from './tsv';

const normalize = (v: string | undefined): string | undefined =>
  v === undefined || v === '' ? undefined : v;

export type PasteResult = { ok: true; cells: number } | { ok: false; reason: PasteRejection };

export class Editor {
  readonly store: CellStore;
  readonly history: EditHistory;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(store: CellStore = new CellStore(), history: EditHistory = new EditHistory()) {
    this.store = store;
    this.history = history;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

  private emit(): void {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  /**
   * 原子提交：过滤 no-op 后一次性应用并入栈为一组。
   * 全部 no-op 时不产生任何副作用（不动存储、不入历史、不发通知）。
   */
  private commit(raw: ReadonlyArray<{ row: number; col: number; next: string | undefined }>): CellEdit[] {
    const edits: CellEdit[] = [];
    for (const { row, col, next } of raw) {
      const prev = this.store.get(row, col);
      const normalized = normalize(next);
      if (prev === normalized) continue;
      edits.push({ row, col, prev, next: normalized });
    }
    if (edits.length > 0) {
      this.store.applyEdits(edits);
      this.history.push(edits);
      this.emit();
    }
    return edits;
  }

  setCell(cell: CellRef, value: string): void {
    this.commit([{ row: cell.row, col: cell.col, next: value }]);
  }

  /** 清空区域：只遍历已分配单元格，复杂度与选区大小无关。 */
  clearRange(range: CellRange): void {
    const raw: Array<{ row: number; col: number; next: undefined }> = [];
    for (const { row, col } of this.store.entries()) {
      if (containsRef(range, { row, col })) raw.push({ row, col, next: undefined });
    }
    this.commit(raw);
  }

  copyRange(range: CellRange): string {
    return serializeRange(this.store, range);
  }

  /** 粘贴：planPaste 先整体校验，失败则原样返回、不做任何修改。 */
  paste(anchor: CellRef, text: string): PasteResult {
    const plan = planPaste(anchor, text);
    if (!plan.ok) return { ok: false, reason: plan.reason };
    const edits = this.commit(plan.cells.map((c) => ({ row: c.row, col: c.col, next: c.value })));
    return { ok: true, cells: edits.length };
  }

  undo(): boolean {
    const group = this.history.undo();
    if (!group) return false;
    this.store.revertEdits(group);
    this.emit();
    return true;
  }

  redo(): boolean {
    const group = this.history.redo();
    if (!group) return false;
    this.store.applyEdits(group);
    this.emit();
    return true;
  }
}
