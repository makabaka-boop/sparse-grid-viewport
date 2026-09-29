/**
 * 可见区计算（viewport）
 * ----------------------
 * 纯函数的滚动/可见窗口数学。输入滚动偏移与视口尺寸，输出需要渲染的
 * 行列区间（半开区间，end 不含）。与坐标模型、渲染层完全解耦，
 * 单元测试用暴力参考实现做对拍。
 */

import { COLS, ROWS } from './coords';

export const ROW_HEIGHT = 28;
export const COL_WIDTH = 110;
export const OVERSCAN = 2;

export interface VisibleRangeInput {
  scrollTop: number;
  scrollLeft: number;
  viewportHeight: number;
  viewportWidth: number;
  rowCount?: number;
  colCount?: number;
  rowHeight?: number;
  colWidth?: number;
  /** 视口外多渲染的行列数，默认 0。 */
  overscan?: number;
}

export interface VisibleWindow {
  startRow: number;
  endRow: number; // 不含
  startCol: number;
  endCol: number; // 不含
}

const clampTo = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** 内容尺寸与视口尺寸决定的最大滚动偏移。 */
export function maxScrollOffset(contentSize: number, viewportSize: number): number {
  return Math.max(0, contentSize - viewportSize);
}

/**
 * 计算可见窗口。滚动偏移先被钳制到 [0, max]，再换算成行列区间；
 * overscan 向外扩展后再钳制到 [0, count]。
 */
export function computeVisibleRange(input: VisibleRangeInput): VisibleWindow {
  const rowCount = input.rowCount ?? ROWS;
  const colCount = input.colCount ?? COLS;
  const rowHeight = input.rowHeight ?? ROW_HEIGHT;
  const colWidth = input.colWidth ?? COL_WIDTH;
  const overscan = input.overscan ?? 0;

  const top = clampTo(input.scrollTop, 0, maxScrollOffset(rowCount * rowHeight, input.viewportHeight));
  const left = clampTo(input.scrollLeft, 0, maxScrollOffset(colCount * colWidth, input.viewportWidth));

  const startRow = clampTo(Math.floor(top / rowHeight) - overscan, 0, rowCount);
  const startCol = clampTo(Math.floor(left / colWidth) - overscan, 0, colCount);
  const endRow = clampTo(Math.ceil((top + input.viewportHeight) / rowHeight) + overscan, startRow, rowCount);
  const endCol = clampTo(Math.ceil((left + input.viewportWidth) / colWidth) + overscan, startCol, colCount);

  return { startRow, endRow, startCol, endCol };
}

/**
 * “滚动到可见”：给定某轴上单元格偏移 offset、尺寸 size、视口尺寸与当前滚动值，
 * 返回让该单元格完全可见所需的新滚动值；已可见则保持不变。
 */
export function scrollToReveal(offset: number, size: number, viewportSize: number, scroll: number): number {
  if (offset < scroll) return offset;
  if (offset + size > scroll + viewportSize) return offset + size - viewportSize;
  return scroll;
}
