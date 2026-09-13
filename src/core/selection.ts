/**
 * 记录多选逻辑。与安卓版 SelectionLogic 完全一致。
 * 最多同时选中 2 条，超出时挤掉最早那条，保证「并排对比」永远可用。
 */

export const MAX_SELECTION = 2;

export function toggleSelection(current: ReadonlySet<number>, id: number): Set<number> {
  if (current.has(id)) {
    const next = new Set(current);
    next.delete(id);
    return next;
  }
  const next = new Set(current);
  next.add(id);
  if (next.size <= MAX_SELECTION) return next;
  // 插入序即迭代序，取最后两个 = 丢掉最早那个
  return new Set([...next].slice(-MAX_SELECTION));
}

export function canCompare(current: ReadonlySet<number>): boolean {
  return current.size === MAX_SELECTION;
}
