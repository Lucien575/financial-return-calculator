import { describe, it, expect } from 'vitest';
import { toggleSelection, canCompare, MAX_SELECTION } from '../src/core/selection';

/** 移植自安卓版 SelectionLogicTest.kt */
describe('记录多选', () => {
  it('选第三条时挤掉最早那条', () => {
    let sel = new Set<number>();
    sel = toggleSelection(sel, 1);
    sel = toggleSelection(sel, 2);
    sel = toggleSelection(sel, 3);
    expect([...sel]).toEqual([2, 3]);
  });

  it('重复点同一条会取消选中', () => {
    let sel = toggleSelection(new Set(), 7);
    expect([...sel]).toEqual([7]);
    sel = toggleSelection(sel, 7);
    expect(sel.size).toBe(0);
  });

  it('只有恰好两条时才能对比', () => {
    expect(canCompare(new Set())).toBe(false);
    expect(canCompare(new Set([1]))).toBe(false);
    expect(canCompare(new Set([1, 2]))).toBe(true);
  });

  it('最多两条', () => {
    expect(MAX_SELECTION).toBe(2);
  });
});
