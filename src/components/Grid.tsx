import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type UIEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  COLS,
  ROWS,
  clampCell,
  colOf,
  inRect,
  normRect,
  rowOf,
  type CellAddr,
  type Rect,
} from "../grid/coords";
import {
  METRICS,
  frozenHeight,
  scrollCellIntoView,
  totalHeight,
  totalWidth,
  visibleBodyRange,
  type Scroll,
  type Size,
} from "../grid/viewport";
import { History } from "../grid/history";
import {
  applyGroup,
  getCell,
  makeChange,
  type CellChange,
  type CellMap,
} from "../grid/store";
import { parseTSV, planPaste, selectionToTSV } from "../grid/tsv";

const M = METRICS;
const UNDO_CAPACITY = 20;

type Layer = "corner" | "row" | "col" | "body";

const layerOf = (r: number, c: number): Layer =>
  r < M.frozenRows
    ? c < M.frozenCols
      ? "corner"
      : "row"
    : c < M.frozenCols
      ? "col"
      : "body";

const LAYER_Z: Record<Layer, number> = { body: 1, col: 2, row: 2, corner: 3 };

interface EditingState extends CellAddr {
  value: string;
}

export function Grid() {
  const [cells, setCells] = useState<CellMap>(() => new Map());
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  // 历史实例不可变，内部栈可变；bump 用于在栈变化后触发重渲染
  const [history] = useState(() => new History<CellChange[]>(UNDO_CAPACITY));
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const [anchor, setAnchor] = useState<CellAddr>({ r: 0, c: 0 });
  const [active, setActive] = useState<CellAddr>({ r: 0, c: 0 });
  const [scroll, setScroll] = useState<Scroll>({ top: 0, left: 0 });
  const [view, setView] = useState<Size>({ width: 0, height: 0 });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [message, setMessage] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const sel: Rect = normRect(anchor, active);

  // ---------- 编辑历史：一组修改 = 一步 ----------
  const commitGroup = (changes: CellChange[]) => {
    const real = changes.filter((ch) => ch.prev !== ch.next);
    if (real.length === 0) return;
    setCells((prev) => applyGroup(prev, real, "next"));
    history.push(real);
    setMessage("");
    bump();
  };

  const doUndo = () => {
    const g = history.undo();
    if (!g) {
      setMessage("没有可撤销的操作");
      return;
    }
    setCells((prev) => applyGroup(prev, g, "prev"));
    setMessage("");
    bump();
  };

  const doRedo = () => {
    const g = history.redo();
    if (!g) {
      setMessage("没有可重做的操作");
      return;
    }
    setCells((prev) => applyGroup(prev, g, "next"));
    setMessage("");
    bump();
  };

  // ---------- 视口尺寸 ----------
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () =>
      setView({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const up = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // 退出编辑后把焦点还给网格，保证键盘导航连续
  useEffect(() => {
    if (!editing) rootRef.current?.focus();
  }, [editing]);

  const scrollToCell = (cell: CellAddr) => {
    const el = viewportRef.current;
    if (!el) return;
    const ns = scrollCellIntoView(
      M,
      { top: el.scrollTop, left: el.scrollLeft },
      { width: el.clientWidth, height: el.clientHeight },
      cell
    );
    if (ns.top !== el.scrollTop) el.scrollTop = ns.top;
    if (ns.left !== el.scrollLeft) el.scrollLeft = ns.left;
  };

  const scrollTo = (top: number | null, left: number | null) => {
    const el = viewportRef.current;
    if (!el) return;
    if (top !== null) el.scrollTop = top;
    if (left !== null) el.scrollLeft = left;
  };

  const jumpTo = (t: CellAddr, extend: boolean) => {
    setActive(t);
    if (!extend) setAnchor(t);
    scrollToCell(t);
  };

  const moveActive = (dr: number, dc: number, extend: boolean) => {
    jumpTo(clampCell({ r: active.r + dr, c: active.c + dc }), extend);
  };

  const pageRows = () =>
    Math.max(1, Math.floor((view.height - frozenHeight(M)) / M.rowHeight));

  const clearSelection = () => {
    // 稀疏存储：只为已存在的单元格生成清除修改，与选区大小无关
    const changes: CellChange[] = [];
    cellsRef.current.forEach((v, key) => {
      if (inRect(sel, rowOf(key), colOf(key)))
        changes.push({ key, prev: v, next: undefined });
    });
    commitGroup(changes);
  };

  // ---------- 键盘 ----------
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (editing) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta) {
      switch (e.key.toLowerCase()) {
        case "z":
          e.preventDefault();
          if (e.shiftKey) doRedo();
          else doUndo();
          return;
        case "y":
          e.preventDefault();
          doRedo();
          return;
        case "home":
          e.preventDefault();
          jumpTo({ r: 0, c: 0 }, e.shiftKey);
          scrollTo(0, 0);
          return;
        case "end":
          e.preventDefault();
          jumpTo({ r: ROWS - 1, c: COLS - 1 }, e.shiftKey);
          return;
        default:
          return; // Ctrl+C / Ctrl+V 等交给 copy / paste 事件
      }
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1, 0, e.shiftKey);
        return;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1, 0, e.shiftKey);
        return;
      case "ArrowRight":
        e.preventDefault();
        moveActive(0, 1, e.shiftKey);
        return;
      case "ArrowLeft":
        e.preventDefault();
        moveActive(0, -1, e.shiftKey);
        return;
      case "PageDown":
        e.preventDefault();
        moveActive(pageRows(), 0, e.shiftKey);
        return;
      case "PageUp":
        e.preventDefault();
        moveActive(-pageRows(), 0, e.shiftKey);
        return;
      case "Tab":
        e.preventDefault();
        moveActive(0, e.shiftKey ? -1 : 1, false);
        return;
      case "Enter":
        e.preventDefault();
        moveActive(e.shiftKey ? -1 : 1, 0, false);
        return;
      case "Home":
        e.preventDefault();
        jumpTo({ r: active.r, c: 0 }, e.shiftKey);
        scrollTo(null, 0);
        return;
      case "End":
        e.preventDefault();
        jumpTo({ r: active.r, c: COLS - 1 }, e.shiftKey);
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        clearSelection();
        return;
      case "F2":
        e.preventDefault();
        setEditing({
          ...active,
          value: getCell(cellsRef.current, active.r, active.c),
        });
        return;
      default:
        if (e.key.length === 1 && !e.altKey) {
          e.preventDefault();
          setEditing({ ...active, value: e.key });
        }
    }
  };

  // ---------- 剪贴板 ----------
  const onCopy = (e: ReactClipboardEvent) => {
    if (editing) return;
    e.preventDefault();
    e.clipboardData.setData(
      "text/plain",
      selectionToTSV(cellsRef.current, sel)
    );
  };

  const onPaste = (e: ReactClipboardEvent) => {
    if (editing) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const res = planPaste(cellsRef.current, active, parseTSV(text));
    if (!res.ok) {
      setMessage(`粘贴被拒绝：${res.reason}`);
      return;
    }
    commitGroup(res.changes);
    const end = { r: active.r + res.rows - 1, c: active.c + res.cols - 1 };
    setAnchor(active);
    setActive(end);
    setMessage(`已粘贴 ${res.rows} 行 × ${res.cols} 列`);
  };

  // ---------- 鼠标 ----------
  const cellHandlers = (r: number, c: number) => ({
    onMouseDown: (e: ReactMouseEvent) => {
      e.preventDefault();
      rootRef.current?.focus();
      if (e.shiftKey) setActive({ r, c });
      else {
        setAnchor({ r, c });
        setActive({ r, c });
      }
      draggingRef.current = true;
    },
    onMouseEnter: () => {
      if (draggingRef.current) setActive({ r, c });
    },
    onDoubleClick: () =>
      setEditing({ r, c, value: getCell(cellsRef.current, r, c) }),
  });

  const onWheel = (e: ReactWheelEvent) => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop += e.deltaY;
    el.scrollLeft += e.deltaX;
  };

  // ---------- 渲染：只挂载可见窗口 + 冻结条 ----------
  const range = visibleBodyRange(M, scroll, view);
  const nodes: ReactNode[] = [];
  const pushCell = (r: number, c: number, layer: Layer) => {
    const x =
      layer === "corner" || layer === "col"
        ? c * M.colWidth
        : c * M.colWidth - scroll.left;
    const y =
      layer === "corner" || layer === "row"
        ? r * M.rowHeight
        : r * M.rowHeight - scroll.top;
    const selected = inRect(sel, r, c);
    const isActive = active.r === r && active.c === c;
    const cls = ["cell"];
    if (layer !== "body") cls.push("cell-frozen");
    if (selected) cls.push("cell-sel");
    if (isActive) cls.push("cell-active");
    nodes.push(
      <div
        key={`${r}:${c}`}
        data-cell=""
        data-r={r}
        data-c={c}
        data-layer={layer}
        data-selected={selected ? "" : undefined}
        data-active={isActive ? "" : undefined}
        className={cls.join(" ")}
        style={{
          transform: `translate(${x}px, ${y}px)`,
          width: M.colWidth,
          height: M.rowHeight,
          zIndex: LAYER_Z[layer],
        }}
        {...cellHandlers(r, c)}
      >
        {getCell(cells, r, c)}
      </div>
    );
  };

  for (let r = range.r0; r <= range.r1; r++)
    for (let c = range.c0; c <= range.c1; c++) pushCell(r, c, "body");
  for (let r = range.r0; r <= range.r1; r++)
    for (let c = 0; c < M.frozenCols; c++) pushCell(r, c, "col");
  for (let r = 0; r < M.frozenRows; r++)
    for (let c = range.c0; c <= range.c1; c++) pushCell(r, c, "row");
  for (let r = 0; r < M.frozenRows; r++)
    for (let c = 0; c < M.frozenCols; c++) pushCell(r, c, "corner");

  let editorNode: ReactNode = null;
  if (editing) {
    const layer = layerOf(editing.r, editing.c);
    const x =
      layer === "corner" || layer === "col"
        ? editing.c * M.colWidth
        : editing.c * M.colWidth - scroll.left;
    const y =
      layer === "corner" || layer === "row"
        ? editing.r * M.rowHeight
        : editing.r * M.rowHeight - scroll.top;
    editorNode = (
      <CellEditor
        x={x}
        y={y}
        initial={editing.value}
        onCommit={(value, move) => {
          const ch = makeChange(cellsRef.current, editing.r, editing.c, value);
          setEditing(null);
          if (ch.prev !== ch.next) commitGroup([ch]);
          if (move === "down") moveActive(1, 0, false);
          else if (move === "right") moveActive(0, 1, false);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div
      id="grid"
      data-testid="grid"
      className="grid"
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onPaste={onPaste}
    >
      <div className="grid-main" data-testid="main" onWheel={onWheel}>
        <div
          className="grid-viewport"
          data-testid="viewport"
          ref={viewportRef}
          onScroll={(e: UIEvent<HTMLDivElement>) => {
            const el = e.currentTarget;
            setScroll({ top: el.scrollTop, left: el.scrollLeft });
          }}
        >
          <div
            className="grid-spacer"
            style={{ width: totalWidth(M), height: totalHeight(M) }}
          />
        </div>
        <div className="grid-layer">
          {nodes}
          {editorNode}
        </div>
      </div>
      <div className="grid-status">
        <span data-testid="active-addr">{`R${active.r} C${active.c}`}</span>
        <span data-testid="sel-size">{`选区 ${sel.r1 - sel.r0 + 1} × ${sel.c1 - sel.c0 + 1}`}</span>
        <button
          type="button"
          data-testid="undo-btn"
          disabled={!history.canUndo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={doUndo}
        >
          撤销
        </button>
        <button
          type="button"
          data-testid="redo-btn"
          disabled={!history.canRedo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={doRedo}
        >
          重做
        </button>
        <span className="msg" data-testid="message">
          {message}
        </span>
      </div>
    </div>
  );
}

interface CellEditorProps {
  x: number;
  y: number;
  initial: string;
  onCommit: (value: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
}

function CellEditor({ x, y, initial, onCommit, onCancel }: CellEditorProps) {
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);
  const commit = (move: "down" | "right" | "none") => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(value, move);
  };
  return (
    <input
      data-testid="cell-editor"
      className="cell-editor"
      style={{
        transform: `translate(${x}px, ${y}px)`,
        width: M.colWidth,
        height: M.rowHeight,
      }}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit("none")}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit("down");
        } else if (e.key === "Escape") {
          e.preventDefault();
          doneRef.current = true;
          onCancel();
        } else if (e.key === "Tab") {
          e.preventDefault();
          commit("right");
        }
      }}
    />
  );
}
