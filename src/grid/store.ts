/**
 * 稀疏单元格存储：只有被编辑过的单元格才有条目，空值即删除 key，
 * 不为未编辑单元格分配任何数据对象。
 */
import { keyOf } from "./coords";

export type CellMap = ReadonlyMap<number, string>;

/** 一处单元格修改；prev/next 为 undefined 表示该格无值（空） */
export interface CellChange {
  key: number;
  prev: string | undefined;
  next: string | undefined;
}

export const getCell = (map: CellMap, r: number, c: number): string =>
  map.get(keyOf(r, c)) ?? "";

/** 把一组修改应用（dir="next"）或回滚（dir="prev"）到存储，返回新 Map */
export function applyGroup(
  map: CellMap,
  group: CellChange[],
  dir: "next" | "prev"
): CellMap {
  const next: Map<number, string> = new Map(map);
  for (const ch of group) {
    const v = dir === "next" ? ch.next : ch.prev;
    if (v === undefined || v === "") next.delete(ch.key);
    else next.set(ch.key, v);
  }
  return next;
}

/** 构造单格修改；空字符串归一化为“无值” */
export function makeChange(
  map: CellMap,
  r: number,
  c: number,
  value: string
): CellChange {
  const key = keyOf(r, c);
  const prev = map.get(key);
  const next = value === "" ? undefined : value;
  return { key, prev, next };
}
