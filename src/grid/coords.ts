/**
 * 坐标模型：逻辑行/列地址、单元格 key 编解码、选区矩形与边界钳制。
 * 全表 100,000 行 × 200 列，所有模块共用这一套坐标定义。
 */

export const ROWS = 100_000;
export const COLS = 200;

export interface CellAddr {
  r: number;
  c: number;
}

/** 归一化矩形，行列均为闭区间 */
export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export const keyOf = (r: number, c: number): number => r * COLS + c;
export const rowOf = (key: number): number => Math.floor(key / COLS);
export const colOf = (key: number): number => key % COLS;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const clampCell = (a: CellAddr): CellAddr => ({
  r: clamp(a.r, 0, ROWS - 1),
  c: clamp(a.c, 0, COLS - 1),
});

/** 由锚点与焦点两个地址得到归一化选区 */
export const normRect = (a: CellAddr, b: CellAddr): Rect => ({
  r0: Math.min(a.r, b.r),
  c0: Math.min(a.c, b.c),
  r1: Math.max(a.r, b.r),
  c1: Math.max(a.c, b.c),
});

export const inRect = (rc: Rect, r: number, c: number): boolean =>
  r >= rc.r0 && r <= rc.r1 && c >= rc.c0 && c <= rc.c1;

export const rectCells = (rc: Rect): number =>
  (rc.r1 - rc.r0 + 1) * (rc.c1 - rc.c0 + 1);
