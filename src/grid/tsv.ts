/**
 * TSV 解析/导出与粘贴规划。
 * 粘贴先做完整校验：目标区域越界或超过 MAX_PASTE_CELLS 格时整次拒绝，
 * 返回失败原因，不产生任何修改（调用方拿不到 changes，也就不会落盘）。
 */
import { COLS, ROWS, keyOf, type CellAddr, type Rect } from "./coords";
import type { CellChange, CellMap } from "./store";

export const MAX_PASTE_CELLS = 10_000;

export function parseTSV(text: string): string[][] {
  const norm = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const body = norm.endsWith("\n") ? norm.slice(0, -1) : norm;
  return body.split("\n").map((line) => line.split("\t"));
}

export function selectionToTSV(map: CellMap, rect: Rect): string {
  const rows: string[] = [];
  for (let r = rect.r0; r <= rect.r1; r++) {
    const cols: string[] = [];
    for (let c = rect.c0; c <= rect.c1; c++) {
      cols.push(map.get(keyOf(r, c)) ?? "");
    }
    rows.push(cols.join("\t"));
  }
  return rows.join("\n");
}

export type PasteResult =
  | { ok: true; changes: CellChange[]; rows: number; cols: number }
  | { ok: false; reason: string };

export function planPaste(
  map: CellMap,
  anchor: CellAddr,
  data: string[][]
): PasteResult {
  const rows = data.length;
  const cols = data.reduce((m, row) => Math.max(m, row.length), 0);
  if (rows === 0 || cols === 0) {
    return { ok: false, reason: "剪贴板内容为空" };
  }
  if (rows * cols > MAX_PASTE_CELLS) {
    return {
      ok: false,
      reason: `粘贴区域 ${rows * cols} 格超过 ${MAX_PASTE_CELLS} 格上限`,
    };
  }
  if (anchor.r + rows > ROWS || anchor.c + cols > COLS) {
    return { ok: false, reason: "粘贴区域超出表格边界" };
  }
  const changes: CellChange[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const value = data[i][j] ?? ""; // 参差行按空单元格补齐
      const key = keyOf(anchor.r + i, anchor.c + j);
      const prev = map.get(key);
      const next = value === "" ? undefined : value;
      if (prev !== next) changes.push({ key, prev, next });
    }
  }
  return { ok: true, changes, rows, cols };
}
