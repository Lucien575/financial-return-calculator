import { describe, it, expect } from 'vitest';
import { applyKey, NUMBER_KEYS } from '../src/core/keypad-reducer';

/** 移植自安卓版 KeypadReducerTest.kt */
describe('KeypadReducer', () => {
  it('数字追加', () => {
    expect(applyKey('1', '2', 2)).toBe('12');
    expect(applyKey('', '2', 2)).toBe('2');
  });

  it('只允许一个小数点', () => {
    expect(applyKey('1.', '2', 2)).toBe('1.2');
    expect(applyKey('1.2', '.', 2)).toBe('1.2');
  });

  it('小数位按字段上限截断', () => {
    expect(applyKey('1.23', '4', 2)).toBe('1.23');
    expect(applyKey('1.234567', '8', 8)).toBe('1.2345678');
  });

  it('开头的小数点补 0', () => {
    expect(applyKey('', '.', 2)).toBe('0.');
  });

  it('退格', () => {
    expect(applyKey('123', 'DEL', 2)).toBe('12');
    expect(applyKey('', 'DEL', 2)).toBe('');
  });

  it('清零', () => {
    expect(applyKey('123.45', 'C', 2)).toBe('');
  });

  it('+1000 快捷键保留两位小数', () => {
    expect(applyKey('10000', '+1000', 2)).toBe('11000.00');
    expect(applyKey('', '+1000', 2)).toBe('1000.00');
    expect(applyKey('abc', '+1000', 2)).toBe('1000.00');
  });

  it('± 取反 —— 没有它用户就填不了亏损', () => {
    expect(applyKey('500', '±', 2)).toBe('-500');
    expect(applyKey('-500', '±', 2)).toBe('500');
    expect(applyKey('', '±', 2)).toBe(''); // 空值不产生孤立负号
    expect(applyKey('0.5', '±', 8)).toBe('-0.5');
  });

  it('取反后的值仍可继续编辑，且校验能正确识别', () => {
    let v = applyKey('429.60', '±', 2);
    expect(v).toBe('-429.60');
    v = applyKey(v, 'DEL', 2);
    expect(v).toBe('-429.6');
    v = applyKey(v, '±', 2);
    expect(v).toBe('429.6');
  });

  it('完成不改值', () => {
    expect(applyKey('123', 'DONE', 2)).toBe('123');
  });

  it('天数字段完全忽略小数点', () => {
    expect(applyKey('19', '.', 0)).toBe('19');
    expect(applyKey('191', '1', 0)).toBe('1911');
  });

  it('键盘布局是 4×4 共 16 键', () => {
    expect(NUMBER_KEYS).toHaveLength(16);
    expect(NUMBER_KEYS).toContain('DONE');
    expect(NUMBER_KEYS).toContain('±');
    expect(NUMBER_KEYS).toContain('DEL');
  });
});
