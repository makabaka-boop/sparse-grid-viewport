/**
 * Grid 组件
 * ---------
 * 渲染与交互层。只做两件事：
 *  1. 把 core 模块算出的逻辑坐标映射成四个窗格（角/表头行/冻结列/主体）的 DOM；
 *  2. 把键盘、鼠标、剪贴板事件翻译成 Editor 调用。
 * 所有数据修改都经过 Editor 原子提交，本组件不直接写存储。
 *
 * 焦点三态（active/anchor/selection）合并为单个状态并镜像到 ref：
 * 事件处理器永远读取最新逻辑坐标，不受 React 批量更新影响。
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from 'react';
import {
  COLS,
  FULL_RANGE,
  FROZEN_COLS,
  FROZEN_ROWS,
  ROWS,
  cellName,
  clampRef,
  colName,
  containsRef,
  intersectRange,
  normalizeRange,
  rangeCellCount,
  rangeCols,
  rangeRows,
  type CellRange,
  type CellRef,
} from '../core/coords';
import { COL_WIDTH, OVERSCAN, ROW_HEIGHT, computeVisibleRange, scrollToReveal } from '../core/viewport';
import { Editor } from '../core/editor';

const BODY_ROWS = ROWS - FROZEN_ROWS; // 可滚动区域的行数
const BODY_COLS = COLS - FROZEN_COLS; // 可滚动区域的列数
const CONTENT_W = BODY_COLS * COL_WIDTH;
const CONTENT_H = BODY_ROWS * ROW_HEIGHT;
const FROZEN_W = FROZEN_COLS * COL_WIDTH;
const FROZEN_H = FROZEN_ROWS * ROW_HEIGHT;

/** 四个窗格各自的逻辑坐标范围。 */
const BODY_PANE: CellRange = { r1: FROZEN_ROWS, c1: FROZEN_COLS, r2: ROWS - 1, c2: COLS - 1 };
const TOP_PANE: CellRange = { r1: 0, c1: FROZEN_COLS, r2: FROZEN_ROWS - 1, c2: COLS - 1 };
const LEFT_PANE: CellRange = { r1: FROZEN_ROWS, c1: 0, r2: ROWS - 1, c2: FROZEN_COLS - 1 };
const CORNER_PANE: CellRange = { r1: 0, c1: 0, r2: FROZEN_ROWS - 1, c2: FROZEN_COLS - 1 };

/** 复制上限：防止全选 2000 万格时序列化卡死页面。 */
const MAX_COPY_CELLS = 1_000_000;

const REASON_TEXT: Record<string, string> = {
  empty: '内容为空',
  'too-large': '超过 10,000 格上限',
  'out-of-bounds': '超出表格边界',
};

const ORIGIN: CellRef = { row: 0, col: 0 };

const single = (cell: CellRef): CellRange => ({ r1: cell.row, c1: cell.col, r2: cell.row, c2: cell.col });

interface FocusState {
  active: CellRef;
  anchor: CellRef;
  selection: CellRange;
}

export function Grid() {
  const editorRef = useRef<Editor | null>(null);
  if (editorRef.current === null) editorRef.current = new Editor();
  const editor = editorRef.current;
  const version = useSyncExternalStore(editor.subscribe, editor.getVersion);

  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [focus, setFocus] = useState<FocusState>({ active: ORIGIN, anchor: ORIGIN, selection: single(ORIGIN) });
  const [editing, setEditingState] = useState<CellRef | null>(null);
  const [editInitial, setEditInitial] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const mainRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef<CellRef | null>(null);
  const draggingRef = useRef(false);
  const focusRef = useRef(focus);

  /** 同步更新焦点状态与镜像 ref，随后触发 React 渲染。 */
  const updateFocus = (next: FocusState) => {
    focusRef.current = next;
    setFocus(next);
  };

  const setEditing = (cell: CellRef | null) => {
    editingRef.current = cell;
    setEditingState(cell);
  };

  // ---------- 焦点与滚动 ----------

  const revealCell = (cell: CellRef) => {
    const m = mainRef.current;
    if (!m) return;
    if (cell.row >= FROZEN_ROWS) {
      const next = scrollToReveal((cell.row - FROZEN_ROWS) * ROW_HEIGHT, ROW_HEIGHT, m.clientHeight, m.scrollTop);
      if (next !== m.scrollTop) m.scrollTop = next;
    }
    if (cell.col >= FROZEN_COLS) {
      const next = scrollToReveal((cell.col - FROZEN_COLS) * COL_WIDTH, COL_WIDTH, m.clientWidth, m.scrollLeft);
      if (next !== m.scrollLeft) m.scrollLeft = next;
    }
  };

  const jumpTo = (cell: CellRef) => {
    updateFocus({ active: cell, anchor: cell, selection: single(cell) });
    revealCell(cell);
  };

  const moveActive = (dr: number, dc: number, extend: boolean) => {
    const cur = focusRef.current;
    const next = clampRef({ row: cur.active.row + dr, col: cur.active.col + dc });
    const anchor = extend ? cur.anchor : next;
    updateFocus({ active: next, anchor, selection: normalizeRange(anchor, next) });
    revealCell(next);
  };

  const pageStep = () => Math.max(1, Math.floor((mainRef.current?.clientHeight ?? ROW_HEIGHT) / ROW_HEIGHT));

  // ---------- 编辑 ----------

  const startEdit = (cell: CellRef, initial?: string) => {
    setEditInitial(initial ?? null);
    setEditing({ ...cell });
  };

  const commitEdit = (move: 'stay' | 'down' | 'up') => {
    const cell = editingRef.current;
    if (!cell) return;
    const value = inputRef.current?.value ?? '';
    setEditing(null);
    editor.setCell(cell, value);
    hiddenRef.current?.focus();
    if (move === 'down') moveActive(1, 0, false);
    else if (move === 'up') moveActive(-1, 0, false);
  };

  const cancelEdit = () => {
    if (!editingRef.current) return;
    setEditing(null);
    hiddenRef.current?.focus();
  };

  // ---------- 撤销 / 重做 ----------

  const doUndo = () => setMessage(editor.undo() ? '已撤销' : '没有可撤销的操作');
  const doRedo = () => setMessage(editor.redo() ? '已重做' : '没有可重做的操作');

  // ---------- 键盘 ----------

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (editingRef.current) return; // 编辑器输入框自行处理按键
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;

    if (mod && key === 'Home') {
      e.preventDefault();
      jumpTo(ORIGIN);
      return;
    }
    if (mod && key === 'End') {
      e.preventDefault();
      jumpTo({ row: ROWS - 1, col: COLS - 1 });
      return;
    }
    if (mod) {
      const k = key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        doRedo();
      } else if (k === 'a') {
        e.preventDefault();
        updateFocus({ ...focusRef.current, anchor: ORIGIN, selection: FULL_RANGE });
      }
      // c / x / v 交给 copy / cut / paste 事件处理
      return;
    }

    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1, 0, e.shiftKey);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1, 0, e.shiftKey);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveActive(0, -1, e.shiftKey);
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveActive(0, 1, e.shiftKey);
        break;
      case 'PageUp':
        e.preventDefault();
        moveActive(-pageStep(), 0, e.shiftKey);
        break;
      case 'PageDown':
        e.preventDefault();
        moveActive(pageStep(), 0, e.shiftKey);
        break;
      case 'Home':
        e.preventDefault();
        jumpTo({ row: focusRef.current.active.row, col: 0 });
        break;
      case 'End':
        e.preventDefault();
        jumpTo({ row: focusRef.current.active.row, col: COLS - 1 });
        break;
      case 'Enter':
        e.preventDefault();
        moveActive(e.shiftKey ? -1 : 1, 0, false);
        break;
      case 'Tab':
        e.preventDefault();
        moveActive(0, e.shiftKey ? -1 : 1, false);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        editor.clearRange(focusRef.current.selection);
        setMessage('');
        break;
      case 'F2':
        e.preventDefault();
        startEdit(focusRef.current.active);
        break;
      case 'Escape': {
        const { active } = focusRef.current;
        updateFocus({ active, anchor: active, selection: single(active) });
        break;
      }
      default:
        if (key.length === 1) {
          e.preventDefault();
          startEdit(focusRef.current.active, key);
        }
    }
  };

  // ---------- 剪贴板 ----------

  const writeSelectionToClipboard = (e: ReactClipboardEvent): boolean => {
    const { selection } = focusRef.current;
    if (rangeCellCount(selection) > MAX_COPY_CELLS) {
      setMessage(`选区超过 ${MAX_COPY_CELLS} 格，无法复制`);
      return false;
    }
    e.clipboardData.setData('text/plain', editor.copyRange(selection));
    setMessage(`已复制 ${rangeRows(selection)}×${rangeCols(selection)}`);
    return true;
  };

  const onCopy = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    writeSelectionToClipboard(e);
  };

  const onCut = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    if (writeSelectionToClipboard(e)) editor.clearRange(focusRef.current.selection);
  };

  const onPaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const { selection } = focusRef.current;
    const res = editor.paste({ row: selection.r1, col: selection.c1 }, text);
    setMessage(res.ok ? `已粘贴 ${res.cells} 格` : `粘贴被拒绝：${REASON_TEXT[res.reason]}`);
  };

  // ---------- 鼠标 ----------

  const cellFromEvent = (e: ReactMouseEvent): CellRef | null => {
    const el = (e.target as HTMLElement).closest?.('[data-cell]');
    if (!el) return null;
    const [r, c] = (el.getAttribute('data-cell') ?? '').split(':').map(Number);
    return Number.isInteger(r) && Number.isInteger(c) ? { row: r, col: c } : null;
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest?.('[data-testid="cell-editor"]')) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (editingRef.current) commitEdit('stay');
    e.preventDefault();
    hiddenRef.current?.focus();
    if (e.shiftKey) {
      const { anchor } = focusRef.current;
      updateFocus({ active: cell, anchor, selection: normalizeRange(anchor, cell) });
    } else {
      updateFocus({ active: cell, anchor: cell, selection: single(cell) });
    }
    draggingRef.current = true;
  };

  const onMouseMove = (e: ReactMouseEvent) => {
    if (!draggingRef.current) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    const { anchor } = focusRef.current;
    updateFocus({ active: cell, anchor, selection: normalizeRange(anchor, cell) });
  };

  const endDrag = () => {
    draggingRef.current = false;
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    const cell = cellFromEvent(e);
    if (!cell) return;
    updateFocus({ active: cell, anchor: cell, selection: single(cell) });
    startEdit(cell);
  };

  // 冻结窗格本身不可滚动，把滚轮增量转发给主窗格
  const forwardWheel = (e: ReactWheelEvent) => {
    const m = mainRef.current;
    if (!m) return;
    m.scrollTop += e.deltaY;
    m.scrollLeft += e.deltaX;
  };

  const onMainScroll = () => {
    const m = mainRef.current;
    if (!m) return;
    setScroll({ top: m.scrollTop, left: m.scrollLeft });
  };

  // ---------- 挂载：聚焦隐藏输入框 + 监听主窗格尺寸 ----------

  useEffect(() => {
    hiddenRef.current?.focus();
    const m = mainRef.current;
    if (!m) return;
    const update = () => setViewport({ w: m.clientWidth, h: m.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(m);
    return () => ro.disconnect();
  }, []);

  // ---------- 渲染 ----------

  const { active, selection } = focus;

  const win = computeVisibleRange({
    scrollTop: scroll.top,
    scrollLeft: scroll.left,
    viewportWidth: viewport.w,
    viewportHeight: viewport.h,
    rowCount: BODY_ROWS,
    colCount: BODY_COLS,
    overscan: OVERSCAN,
  });

  const r0 = win.startRow + FROZEN_ROWS;
  const r1 = win.endRow + FROZEN_ROWS;
  const c0 = win.startCol + FROZEN_COLS;
  const c1 = win.endCol + FROZEN_COLS;

  const renderCell = (r: number, c: number, left: number, top: number) => {
    const value = editor.store.get(r, c);
    const cls = ['cell'];
    if (r < FROZEN_ROWS) cls.push('row-header');
    if (c < FROZEN_COLS) cls.push('col-header');
    let content: ReactNode = value ?? null;
    if (value === undefined) {
      // 未编辑单元格：表头行显示列名、首列显示行号作为占位（不产生数据）
      const ph = r < FROZEN_ROWS ? colName(c) : c === 0 ? String(r + 1) : '';
      if (ph) content = <span className="placeholder">{ph}</span>;
    }
    return (
      <div
        key={`${r}:${c}`}
        data-cell={`${r}:${c}`}
        className={cls.join(' ')}
        style={{ left, top, width: COL_WIDTH, height: ROW_HEIGHT }}
      >
        {content}
      </div>
    );
  };

  const bodyCells: ReactNode[] = [];
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      bodyCells.push(renderCell(r, c, (c - FROZEN_COLS) * COL_WIDTH, (r - FROZEN_ROWS) * ROW_HEIGHT));
    }
  }
  const topCells: ReactNode[] = [];
  for (let c = c0; c < c1; c++) {
    topCells.push(renderCell(0, c, (c - FROZEN_COLS) * COL_WIDTH, 0));
  }
  const leftCells: ReactNode[] = [];
  for (let r = r0; r < r1; r++) {
    for (let c = 0; c < FROZEN_COLS; c++) {
      leftCells.push(renderCell(r, c, c * COL_WIDTH, (r - FROZEN_ROWS) * ROW_HEIGHT));
    }
  }
  const cornerCells: ReactNode[] = [];
  for (let c = 0; c < FROZEN_COLS; c++) {
    cornerCells.push(renderCell(0, c, c * COL_WIDTH, 0));
  }

  const selectionOverlay = (pane: CellRange, toLeft: (c: number) => number, toTop: (r: number) => number, testid: string) => {
    const hit = intersectRange(selection, pane);
    if (!hit) return null;
    return (
      <div
        className="selection-overlay"
        data-testid={testid}
        style={{
          left: toLeft(hit.c1),
          top: toTop(hit.r1),
          width: (hit.c2 - hit.c1 + 1) * COL_WIDTH,
          height: (hit.r2 - hit.r1 + 1) * ROW_HEIGHT,
        }}
      />
    );
  };

  const activeOutline = (pane: CellRange, toLeft: (c: number) => number, toTop: (r: number) => number) => {
    if (!containsRef(pane, active)) return null;
    return (
      <div
        className="active-outline"
        data-testid="active-outline"
        style={{ left: toLeft(active.col), top: toTop(active.row), width: COL_WIDTH, height: ROW_HEIGHT }}
      />
    );
  };

  const editorInput = (pane: CellRange, toLeft: (c: number) => number, toTop: (r: number) => number) => {
    if (!editing || !containsRef(pane, editing)) return null;
    return (
      <input
        key={`${editing.row}:${editing.col}:${editInitial ?? 'edit'}`}
        ref={inputRef}
        data-testid="cell-editor"
        className="cell-editor"
        style={{ left: toLeft(editing.col), top: toTop(editing.row), width: COL_WIDTH, height: ROW_HEIGHT }}
        defaultValue={editInitial ?? editor.store.get(editing.row, editing.col) ?? ''}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitEdit(e.shiftKey ? 'up' : 'down');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            commitEdit('stay');
            moveActive(0, e.shiftKey ? -1 : 1, false);
          }
        }}
        onBlur={() => {
          if (editingRef.current) commitEdit('stay');
        }}
      />
    );
  };

  const bodyX = (c: number) => (c - FROZEN_COLS) * COL_WIDTH;
  const bodyY = (r: number) => (r - FROZEN_ROWS) * ROW_HEIGHT;
  const sideX = (c: number) => c * COL_WIDTH;
  const zero = () => 0;

  return (
    <div className="grid-shell">
      <div className="toolbar">
        <button data-testid="undo-btn" onClick={doUndo} disabled={!editor.history.canUndo}>
          撤销
        </button>
        <button data-testid="redo-btn" onClick={doRedo} disabled={!editor.history.canRedo}>
          重做
        </button>
        <span className="toolbar-hint">
          方向键移动 · Shift 扩展选区 · 输入即编辑 · Ctrl+C/V 复制粘贴 · Ctrl+Z/Y 撤销重做
        </span>
      </div>
      <div
        className="grid-root"
        data-testid="grid-root"
        data-version={version}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="pane main-pane"
          data-testid="main-pane"
          ref={mainRef}
          onScroll={onMainScroll}
          style={{ left: FROZEN_W, top: FROZEN_H }}
        >
          <div className="scroll-content" style={{ width: CONTENT_W, height: CONTENT_H }}>
            {bodyCells}
            {selectionOverlay(BODY_PANE, bodyX, bodyY, 'selection-body')}
            {activeOutline(BODY_PANE, bodyX, bodyY)}
            {editorInput(BODY_PANE, bodyX, bodyY)}
          </div>
        </div>
        <div className="pane top-pane" data-testid="top-pane" onWheel={forwardWheel} style={{ left: FROZEN_W, height: FROZEN_H }}>
          <div className="pane-inner" style={{ transform: `translateX(${-scroll.left}px)`, width: CONTENT_W }}>
            {topCells}
            {selectionOverlay(TOP_PANE, bodyX, zero, 'selection-top')}
            {activeOutline(TOP_PANE, bodyX, zero)}
            {editorInput(TOP_PANE, bodyX, zero)}
          </div>
        </div>
        <div className="pane left-pane" data-testid="left-pane" onWheel={forwardWheel} style={{ top: FROZEN_H, width: FROZEN_W }}>
          <div className="pane-inner" style={{ transform: `translateY(${-scroll.top}px)`, height: CONTENT_H }}>
            {leftCells}
            {selectionOverlay(LEFT_PANE, sideX, bodyY, 'selection-left')}
            {activeOutline(LEFT_PANE, sideX, bodyY)}
            {editorInput(LEFT_PANE, sideX, bodyY)}
          </div>
        </div>
        <div className="pane corner-pane" data-testid="corner-pane" onWheel={forwardWheel} style={{ width: FROZEN_W, height: FROZEN_H }}>
          {cornerCells}
          {selectionOverlay(CORNER_PANE, sideX, zero, 'selection-corner')}
          {activeOutline(CORNER_PANE, sideX, zero)}
          {editorInput(CORNER_PANE, sideX, zero)}
        </div>
        <textarea
          ref={hiddenRef}
          data-testid="hidden-input"
          className="hidden-input"
          aria-label="grid keyboard input"
          onKeyDown={onKeyDown}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
          onInput={(e) => {
            e.currentTarget.value = '';
          }}
          autoFocus
        />
      </div>
      <div className="status-bar">
        <span data-testid="status-active">{cellName(active)}</span>
        <span data-testid="status-selection">
          {rangeRows(selection)}×{rangeCols(selection)}
        </span>
        <span data-testid="status-message">{message}</span>
        <span className="status-spacer" />
        <span data-testid="status-history">
          撤销 {editor.history.undoCount} · 重做 {editor.history.redoCount}
        </span>
      </div>
    </div>
  );
}
