import { describe, expect, it } from 'vitest';
import { Editor } from '../../src/core/editor';
import { HISTORY_LIMIT } from '../../src/core/history';
import { COLS, ROWS } from '../../src/core/coords';

/** 确定性伪随机数（LCG）。 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('编辑器：单元编辑与撤销重做', () => {
  it('setCell 产生一组历史，可撤销重做', () => {
    const ed = new Editor();
    ed.setCell({ row: 0, col: 0 }, 'hello');
    expect(ed.store.get(0, 0)).toBe('hello');
    expect(ed.history.undoCount).toBe(1);

    expect(ed.undo()).toBe(true);
    expect(ed.store.get(0, 0)).toBeUndefined();
    expect(ed.store.size).toBe(0);

    expect(ed.redo()).toBe(true);
    expect(ed.store.get(0, 0)).toBe('hello');
  });

  it('写入相同值是 no-op，不产生历史', () => {
    const ed = new Editor();
    ed.setCell({ row: 0, col: 0 }, 'x');
    ed.setCell({ row: 0, col: 0 }, 'x');
    ed.setCell({ row: 1, col: 1 }, ''); // 空写空
    expect(ed.history.undoCount).toBe(1);
  });

  it('clearRange 成组：一次撤销恢复整片', () => {
    const ed = new Editor();
    ed.setCell({ row: 0, col: 0 }, 'a');
    ed.setCell({ row: 0, col: 1 }, 'b');
    ed.setCell({ row: 1, col: 0 }, 'c');
    const before = ed.history.undoCount;

    ed.clearRange({ r1: 0, c1: 0, r2: 1, c2: 1 });
    expect(ed.store.size).toBe(0);
    expect(ed.history.undoCount).toBe(before + 1);

    ed.undo();
    expect(ed.store.get(0, 0)).toBe('a');
    expect(ed.store.get(0, 1)).toBe('b');
    expect(ed.store.get(1, 0)).toBe('c');
  });

  it('历史上限 20 组：超出后最旧的不可撤销', () => {
    const ed = new Editor();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) ed.setCell({ row: 0, col: i }, `v${i}`);
    expect(ed.history.undoCount).toBe(HISTORY_LIMIT);

    for (let i = 0; i < HISTORY_LIMIT; i++) expect(ed.undo()).toBe(true);
    expect(ed.undo()).toBe(false);
    // 最旧的 5 次编辑已不可撤销，保留下来
    for (let i = 0; i < 5; i++) expect(ed.store.get(0, i)).toBe(`v${i}`);
    for (let i = 5; i < HISTORY_LIMIT + 5; i++) expect(ed.store.get(0, i)).toBeUndefined();

    for (let i = 0; i < HISTORY_LIMIT; i++) expect(ed.redo()).toBe(true);
    for (let i = 5; i < HISTORY_LIMIT + 5; i++) expect(ed.store.get(0, i)).toBe(`v${i}`);
  });
});

describe('编辑器：粘贴的原子性', () => {
  it('超过 10,000 格整体拒绝，不留部分修改', () => {
    const ed = new Editor();
    ed.setCell({ row: 0, col: 0 }, 'keep');
    const version = ed.getVersion();
    const undoCount = ed.history.undoCount;
    const big = Array.from({ length: 101 }, () => new Array(100).fill('v').join('\t')).join('\n');

    const res = ed.paste({ row: 0, col: 0 }, big);
    expect(res).toEqual({ ok: false, reason: 'too-large' });
    expect(ed.store.size).toBe(1);
    expect(ed.store.get(0, 0)).toBe('keep');
    expect(ed.store.get(1, 0)).toBeUndefined();
    expect(ed.history.undoCount).toBe(undoCount); // 没有产生新的历史组
    expect(ed.getVersion()).toBe(version); // 没有发出任何变更通知
  });

  it('越界整体拒绝，不留部分修改', () => {
    const ed = new Editor();
    const res = ed.paste({ row: ROWS - 1, col: COLS - 1 }, 'a\tb\nc\td');
    expect(res).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(ed.store.size).toBe(0);
    expect(ed.history.undoCount).toBe(0);
  });

  it('合法粘贴是一组历史：一次撤销全部回滚', () => {
    const ed = new Editor();
    ed.setCell({ row: 5, col: 5 }, 'old');
    const res = ed.paste({ row: 5, col: 5 }, 'a\tb\nc\td');
    expect(res).toEqual({ ok: true, cells: 4 });
    expect(ed.store.get(5, 5)).toBe('a');
    expect(ed.store.get(6, 6)).toBe('d');
    expect(ed.history.undoCount).toBe(2);

    ed.undo();
    expect(ed.store.get(5, 5)).toBe('old'); // prev 被正确恢复
    expect(ed.store.get(5, 6)).toBeUndefined();
    expect(ed.store.get(6, 6)).toBeUndefined();

    ed.redo();
    expect(ed.store.get(5, 5)).toBe('a');
    expect(ed.store.get(6, 6)).toBe('d');
  });

  it('恰好 10,000 格可以粘贴并整体撤销', () => {
    const ed = new Editor();
    const exact = Array.from({ length: 100 }, () => new Array(100).fill('v').join('\t')).join('\n');
    expect(ed.paste({ row: 0, col: 0 }, exact)).toEqual({ ok: true, cells: 10_000 });
    expect(ed.store.size).toBe(10_000);
    ed.undo();
    expect(ed.store.size).toBe(0);
  });
});

describe('编辑器：随机操作对拍参考模型', () => {
  it('800 次随机 set/undo/redo 后与朴素参考模型完全一致', () => {
    const rng = lcg(20260929);
    const ed = new Editor();

    // 参考模型：完整 Map + 同样 20 组上限的手写历史栈
    const model = new Map<string, string>();
    type Snap = Array<[string, string | undefined, string | undefined]>;
    const undoStack: Snap[] = [];
    const redoStack: Snap[] = [];
    const key = (r: number, c: number) => `${r}:${c}`;
    const norm = (v: string) => (v === '' ? undefined : v);

    const modelSet = (r: number, c: number, v: string) => {
      const k = key(r, c);
      const prev = model.get(k);
      const next = norm(v);
      if (prev === next) return;
      undoStack.push([[k, prev, next]]);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
      if (next === undefined) model.delete(k);
      else model.set(k, next);
    };
    const apply = (g: Snap, side: 1 | 2) => {
      for (const [k, prev, next] of g) {
        const v = side === 1 ? prev : next;
        if (v === undefined) model.delete(k);
        else model.set(k, v);
      }
    };
    const modelUndo = () => {
      const g = undoStack.pop();
      if (!g) return;
      redoStack.push(g);
      apply(g, 1);
    };
    const modelRedo = () => {
      const g = redoStack.pop();
      if (!g) return;
      undoStack.push(g);
      apply(g, 2);
    };

    for (let i = 0; i < 800; i++) {
      const op = Math.floor(rng() * 10);
      if (op < 5) {
        const r = Math.floor(rng() * 40);
        const c = Math.floor(rng() * 8);
        const v = `v${Math.floor(rng() * 50)}`;
        ed.setCell({ row: r, col: c }, v);
        modelSet(r, c, v);
      } else if (op < 6) {
        const r = Math.floor(rng() * 40);
        const c = Math.floor(rng() * 8);
        ed.setCell({ row: r, col: c }, '');
        modelSet(r, c, '');
      } else if (op < 8) {
        ed.undo();
        modelUndo();
      } else {
        ed.redo();
        modelRedo();
      }
      expect(ed.history.undoCount).toBe(undoStack.length);
      expect(ed.history.redoCount).toBe(redoStack.length);
      expect(ed.store.size).toBe(model.size);
    }

    for (let r = 0; r < 40; r++) {
      for (let c = 0; c < 8; c++) {
        expect(ed.store.get(r, c)).toBe(model.get(key(r, c)));
      }
    }
  });
});
