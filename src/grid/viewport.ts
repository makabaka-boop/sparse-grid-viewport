/**
 * 可见区计算：把滚动位置与视口尺寸映射为需要渲染的逻辑行列窗口，
 * 以及键盘导航时的滚动跟随。纯函数，不依赖 DOM 与 React。
 *
 * 像素模型：逻辑坐标 (r, c) 的未滚动像素位置为 (c*colWidth, r*rowHeight)。
 * 冻结条占据左上角 frozenCols*colWidth × frozenRows*rowHeight 的区域，
 * 正文单元格随滚动平移并从冻结条下方滑过，冻结单元格不做平移。
 */
import { COLS, ROWS, clamp } from "./coords";

export interface GridMetrics {
  rowHeight: number;
  colWidth: number;
  frozenRows: number;
  frozenCols: number;
  rows: number;
  cols: number;
}

export const METRICS: GridMetrics = {
  rowHeight: 28,
  colWidth: 120,
  frozenRows: 1,
  frozenCols: 2,
  rows: ROWS,
  cols: COLS,
};

export interface Scroll {
  top: number;
  left: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface VisibleRange {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export const totalWidth = (m: GridMetrics): number => m.cols * m.colWidth;
export const totalHeight = (m: GridMetrics): number => m.rows * m.rowHeight;
export const frozenWidth = (m: GridMetrics): number => m.frozenCols * m.colWidth;
export const frozenHeight = (m: GridMetrics): number => m.frozenRows * m.rowHeight;

export const maxScrollLeft = (m: GridMetrics, view: Size): number =>
  Math.max(0, totalWidth(m) - view.width);
export const maxScrollTop = (m: GridMetrics, view: Size): number =>
  Math.max(0, totalHeight(m) - view.height);

/**
 * 正文区（非冻结）需要渲染的行列闭区间，向外扩 overscan 行/列，
 * 保证部分被冻结条遮住的单元格也被挂载（它们被冻结层压住，不可见）。
 */
export function visibleBodyRange(
  m: GridMetrics,
  scroll: Scroll,
  view: Size,
  overscan = 1
): VisibleRange {
  const fw = frozenWidth(m);
  const fh = frozenHeight(m);
  const c0 = clamp(
    Math.floor((scroll.left + fw) / m.colWidth) - overscan,
    m.frozenCols,
    m.cols - 1
  );
  const c1 = clamp(
    Math.ceil((scroll.left + view.width) / m.colWidth) - 1 + overscan,
    m.frozenCols,
    m.cols - 1
  );
  const r0 = clamp(
    Math.floor((scroll.top + fh) / m.rowHeight) - overscan,
    m.frozenRows,
    m.rows - 1
  );
  const r1 = clamp(
    Math.ceil((scroll.top + view.height) / m.rowHeight) - 1 + overscan,
    m.frozenRows,
    m.rows - 1
  );
  return { r0, r1, c0, c1 };
}

/**
 * 让目标单元格进入可视区所需的新滚动位置。
 * 位于冻结行/列内的单元格始终可见，对应轴不滚动。
 */
export function scrollCellIntoView(
  m: GridMetrics,
  scroll: Scroll,
  view: Size,
  cell: { r: number; c: number }
): Scroll {
  let { top, left } = scroll;
  const fw = frozenWidth(m);
  const fh = frozenHeight(m);
  if (cell.c >= m.frozenCols) {
    const x0 = cell.c * m.colWidth;
    const x1 = x0 + m.colWidth;
    if (x0 < left + fw) left = x0 - fw;
    else if (x1 > left + view.width) left = x1 - view.width;
    left = clamp(left, 0, maxScrollLeft(m, view));
  }
  if (cell.r >= m.frozenRows) {
    const y0 = cell.r * m.rowHeight;
    const y1 = y0 + m.rowHeight;
    if (y0 < top + fh) top = y0 - fh;
    else if (y1 > top + view.height) top = y1 - view.height;
    top = clamp(top, 0, maxScrollTop(m, view));
  }
  return { top, left };
}
