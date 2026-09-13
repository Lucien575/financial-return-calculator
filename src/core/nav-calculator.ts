import {
  Decimal,
  doublePercent,
  nav,
  ratioPercent,
  toneOf,
  toneOfDouble,
  DIVISION_SCALE,
  NAV_SCALE,
} from './money-format';
import type { CalcResult, DaysSource, Metric } from './calc-models';

/**
 * 净值计算法。与安卓版 NavCalculator.kt 逐行等价。
 *
 * 区间收益率 = (当前净值 - 买入净值) / 买入净值
 * 年化收益率 = (1 + r) ^ (365 / n) - 1
 */

const DAYS_BASE = 365;

export function buildNavResult(
  buyNav: Decimal,
  currentNav: Decimal,
  days: number,
  daysSource: DaysSource,
): CalcResult {
  const rate = currentNav
    .sub(buyNav)
    .div(buyNav)
    .toDecimalPlaces(DIVISION_SCALE, Decimal.ROUND_HALF_UP);

  const annual = Math.pow(1 + rate.toNumber(), DAYS_BASE / days) - 1;

  const rateText = ratioPercent(rate);
  const annualText = doublePercent(annual);
  const buyNavText = nav(buyNav);
  const currentNavText = nav(currentNav);
  const ratePlain = rate.toDecimalPlaces(NAV_SCALE, Decimal.ROUND_HALF_UP).toFixed(NAV_SCALE);

  const metrics: Metric[] = [
    { label: '买入净值', value: buyNavText },
    { label: '当前净值', value: currentNavText },
    { label: '持有天数', value: `${days} 天` },
    { label: '区间收益率', value: rateText, tone: toneOf(rate) },
  ];

  const steps = [
    `区间收益率 = (${currentNavText} - ${buyNavText}) ÷ ${buyNavText} = ${rateText}`,
    `年化收益率 = (1 + ${ratePlain})^(365 ÷ ${days}) - 1 = ${annualText}`,
  ];

  return {
    mode: 'NAV',
    days,
    daysSource,
    primaryAnnual: annualText,
    primaryTone: toneOfDouble(annual),
    metrics,
    steps,
    compoundAnnual: null,
  };
}
