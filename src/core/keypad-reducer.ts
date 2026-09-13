import { Decimal } from './money-format';

/**
 * 金额键盘的纯函数内核：把「当前文本 + 一个按键」映射成「新文本」。
 * 与安卓版 KeypadReducer.kt 完全一致，与 DOM 解耦，可单测。
 */

export const KEY_DELETE = 'DEL';
export const KEY_CLEAR = 'C';
export const KEY_DONE = 'DONE';
export const KEY_PLUS_1000 = '+1000';
/**
 * 取反。**必需功能**：提示里写着「亏损填负数」，但键盘上原本没有负号键，
 * 导致用户根本敲不出负数 —— 亏损这条路径在 UI 上不可达。
 * 它替换掉了原来的 `x2`（便捷键），因为「能填亏损」比「一键翻倍」重要得多。
 */
export const KEY_NEGATE = '±';

const SHORTCUT_SCALE = 2;

export function applyKey(current: string, key: string, maxDecimals: number): string {
  switch (key) {
    case KEY_DELETE:
      return current.slice(0, -1);
    case KEY_CLEAR:
      return '';
    case KEY_DONE:
      return current;
    case KEY_PLUS_1000:
      return shift(current, (d) => d.add(1000));
    case KEY_NEGATE: {
      if (current === '') return current; // 空值取反没有意义，不要变成孤立负号
      return current.startsWith('-') ? current.slice(1) : `-${current}`;
    }
    case '.':
      if (maxDecimals <= 0) return current; // 天数是整数，忽略小数点
      if (current.includes('.')) return current;
      return current === '' ? '0.' : `${current}.`;
    default:
      return appendDigit(current, key, maxDecimals);
  }
}

function appendDigit(current: string, digit: string, maxDecimals: number): string {
  if (current.includes('.') && current.split('.')[1].length >= maxDecimals) {
    return current;
  }
  return current + digit;
}

function shift(current: string, op: (d: Decimal) => Decimal): string {
  let base: Decimal;
  try {
    base = new Decimal(current.trim() === '' ? '0' : current.trim());
    if (!base.isFinite()) base = new Decimal(0);
  } catch {
    base = new Decimal(0);
  }
  return op(base).toDecimalPlaces(SHORTCUT_SCALE, Decimal.ROUND_HALF_UP).toFixed(SHORTCUT_SCALE);
}

/** 数字键盘布局。键序与安卓版 NumberKeys 一致。 */
export const NUMBER_KEYS = [
  '7', '8', '9', KEY_DELETE,
  '4', '5', '6', KEY_CLEAR,
  '1', '2', '3', KEY_PLUS_1000,
  '0', '.', KEY_NEGATE, KEY_DONE,
] as const;
