import {
  Decimal,
  amount,
  amountWithUnit,
  doublePercent,
  ratioPercent,
  toneOf,
  DIVISION_SCALE,
} from './money-format';
import type { CalcResult, DaysSource, Metric } from './calc-models';

/**
 * 金额计算法。与安卓版 AmountCalculator.kt 逐行等价。
 *
 * 简单年化 = r × 365 / n
 * 复利年化 = (1 + r) ^ (365 / n) - 1   ← 幂运算走 double，对齐原版 JS Math.pow
 */

const DAYS_BASE = 365;

export function buildAmountResult(
  buyAmount: Decimal,
  earnAmount: Decimal,
  days: number,
  daysSource: DaysSource,
): CalcResult {
  const total = buyAmount.add(earnAmount);
  const rate = earnAmount.div(buyAmount).toDecimalPlaces(DIVISION_SCALE, Decimal.ROUND_HALF_UP);

  const annualSimple = rate
    .mul(DAYS_BASE)
    .div(days)
    .toDecimalPlaces(DIVISION_SCALE, Decimal.ROUND_HALF_UP);

  const compound = Math.pow(1 + rate.toNumber(), DAYS_BASE / days) - 1;

  const rateText = ratioPercent(rate);
  const annualText = ratioPercent(annualSimple);
  const compoundText = doublePercent(compound);

  const metrics: Metric[] = [
    { label: '买入金额', value: amountWithUnit(buyAmount) },
    { label: '持有收益', value: amountWithUnit(earnAmount), tone: toneOf(earnAmount) },
    { label: '当前总额', value: amountWithUnit(total) },
    { label: '持有天数', value: `${days} 天` },
    { label: '区间收益率', value: rateText, tone: toneOf(rate) },
  ];

  const steps = [
    `当前总额 = ${amount(buyAmount)} + ${amount(earnAmount)} = ${amount(total)} 元`,
    `区间收益率 = ${amount(earnAmount)} ÷ ${amount(buyAmount)} = ${rateText}`,
    `年化收益率 = ${rateText} × (365 ÷ ${days}) = ${annualText}`,
    `复利年化（参考）= ${compoundText}`,
  ];

  return {
    mode: 'AMOUNT',
    days,
    daysSource,
    primaryAnnual: annualText,
    primaryTone: toneOf(annualSimple),
    metrics,
    steps,
    compoundAnnual: compoundText,
  };
}
