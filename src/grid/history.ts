/**
 * 编辑历史：容量有限的成组撤销/重做栈。
 * 一个条目 = 一组原子修改（例如一次粘贴、一次清除），
 * 与具体数据类型无关，由调用方负责应用/回滚。
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly capacity: number = 20) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoDepth(): number {
    return this.past.length;
  }

  get redoDepth(): number {
    return this.future.length;
  }

  /** 推入新一步；超出容量丢弃最旧的一步，并清空重做栈 */
  push(entry: T): void {
    this.past.push(entry);
    if (this.past.length > this.capacity) this.past.shift();
    this.future.length = 0;
  }

  undo(): T | undefined {
    const e = this.past.pop();
    if (e === undefined) return undefined;
    this.future.push(e);
    return e;
  }

  redo(): T | undefined {
    const e = this.future.pop();
    if (e === undefined) return undefined;
    this.past.push(e);
    return e;
  }
}
