/**
 * 编辑历史（history）
 * -------------------
 * 成组的撤销/重做栈，最多保留 HISTORY_LIMIT（20）组。
 * 只管理 EditGroup 的堆栈语义，不知道单元格如何应用——
 * 应用/回滚由 store 完成，组合由 editor 完成。
 */

import type { CellEdit } from './store';

export const HISTORY_LIMIT = 20;

export type EditGroup = readonly CellEdit[];

export class EditHistory {
  private readonly undoStack: CellEdit[][] = [];
  private readonly redoStack: CellEdit[][] = [];

  constructor(private readonly limit: number = HISTORY_LIMIT) {}

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 推入一组编辑；超出上限时丢弃最旧的一组；新操作会清空重做栈。 */
  push(group: EditGroup): void {
    if (group.length === 0) return;
    this.undoStack.push([...group]);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** 弹出最近一组（调用方负责 revert），并移入重做栈。 */
  undo(): CellEdit[] | undefined {
    const group = this.undoStack.pop();
    if (group) this.redoStack.push(group);
    return group;
  }

  /** 弹出最近撤销的一组（调用方负责 apply），并移回撤销栈。 */
  redo(): CellEdit[] | undefined {
    const group = this.redoStack.pop();
    if (group) this.undoStack.push(group);
    return group;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
