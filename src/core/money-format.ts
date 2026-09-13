import Decimal from 'decimal.js';
import type { Tone } from './calc-models';

/**
 * 全局唯一的小数配置。
 *
 * 安卓版用 java.math.BigDecimal，除法显式指定 scale=16、HALF_UP。
 * 这里把 decimal.js 的全局精度设得足够高（40 位有效数字），
 * 再在每处按需 toDecimalPlaces(scale) —— 与 Kotlin 的 `divide(x, 16, HALF_UP)` 等价。
 *
 * toExpNeg / toExpPos 设成极端值，让 toString() 永不使用指数形式，
 * 等价于 Kotlin 的 toPlainString()。
 */
Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

/** 除法精度：与安卓版 DIVISION_SCALE 一致 */
export const DIVISION_SCALE = 16;
export const NAV_SCALE = 8;
export const PERCENT_SCALE = 2;

/** 按 scale 位小数四舍五入（HALF_UP），并补足末尾的 0。 */
export function scale(value: Decimal, places: number): Decimal {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
}

/**
 * 金额格式化：千分位 + 固定 2 位小数 + 负号。
 * 对应 MoneyFormat.amount()。
 */
export function amount(value: Decimal): string {
  const scaled = scale(value, 2);
  const plain = scaled.abs().toFixed(2);
  const [intPart, decPart = ''] = plain.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = scaled.isNeg() ? '-' : '';
  return `${sign}${grouped}.${decPart}`;
}

export function amountWithUnit(value: Decimal): string {
  return `${amount(value)} 元`;
}

/** 净值：固定 8 位小数。对应 MoneyFormat.nav()。 */
export function nav(value: Decimal): string {
  return scale(value, NAV_SCALE).toFixed(NAV_SCALE);
}

/** 比率 → 百分比文案。对应 MoneyFormat.ratioPercent()。 */
export function ratioPercent(value: Decimal, places = PERCENT_SCALE): string {
  const pct = scale(value.mul(100), places);
  const sign = pct.isNeg() ? '' : '+';
  return `${sign}${pct.toFixed(places)}%`;
}

/**
 * Double 版百分比。对应 MoneyFormat.doublePercent()。
 *
 * 安卓版的实现刻意复刻了原版网页的 `(v * 100).toFixed(decimals)`：
 * 先做 IEEE754 乘法（**这个 ×100 不能省**，也不能改成精确十进制乘法），
 * 再对**精确数学值**四舍五入。JS 的 toFixed 原生就是这个语义，所以这里直接用。
 *
 * 非有限值必须显式拦截：安卓版对 NaN 返回「无法计算」、对 ±∞ 返回「±∞%」，
 * 而 JS 的 toFixed 会返回字符串 "Infinity" —— 两端会显示不一致，所以不依赖它。
 *
 * 已知且有意保留的差异：|百分比| ≥ 1e21 时，ECMA-262 规定 toFixed 退化为指数形式
 * （如 "1.0000000000000001e+304"），而安卓版打印完整数字。这种量级（10^19 倍收益）
 * 不可能真实出现，与安卓版 spec 里记录的同类差异保持一致。
 */
export function doublePercent(value: number, places = PERCENT_SCALE): string {
  if (Number.isNaN(value)) return '无法计算';
  if (!Number.isFinite(value)) return value > 0 ? '+∞%' : '-∞%';
  const sign = value >= 0 ? '+' : '';
  // ×100 必须在 IEEE754 里做：原版 JS 就是 `(v * 100).toFixed(n)`。
  // 漏掉它会让所有百分比小 100 倍（parity 测试会立刻抓到）。
  return `${sign}${(value * 100).toFixed(places)}%`;
}

/** BigDecimal 版的语义色。对应 MoneyFormat.toneOf()。 */
export function toneOf(value: Decimal): Tone {
  return value.isNeg() ? 'LOSS' : 'GAIN';
}

/**
 * Double 版的语义色。对应 MoneyFormat.toneOfDouble()。
 * 不能写成 toneOf(new Decimal(v)) —— 上溢得到 Infinity 时那里会抛异常。
 * NaN 归为 NEUTRAL，与 doublePercent 返回「无法计算」保持一致。
 */
export function toneOfDouble(value: number): Tone {
  if (Number.isNaN(value)) return 'NEUTRAL';
  return value < 0 ? 'LOSS' : 'GAIN';
}

export { Decimal };
