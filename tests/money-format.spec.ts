import { describe, it, expect } from 'vitest';
import {
  Decimal,
  amount,
  amountWithUnit,
  nav,
  ratioPercent,
  doublePercent,
  toneOf,
  toneOfDouble,
} from '../src/core/money-format';

/** 移植自安卓版 MoneyFormatTest.kt */
describe('MoneyFormat', () => {
  it('金额加千分位', () => {
    expect(amount(new Decimal('40125.71'))).toBe('40,125.71');
    expect(amount(new Decimal('1234567.89'))).toBe('1,234,567.89');
    expect(amount(new Decimal('999'))).toBe('999.00');
  });

  it('金额保留两位小数并带负号', () => {
    expect(amount(new Decimal('-1234.561'))).toBe('-1,234.56');
    expect(amount(new Decimal(0))).toBe('0.00');
  });

  it('金额是四舍五入（HALF_UP），不是银行家舍入', () => {
    expect(amount(new Decimal('1.005'))).toBe('1.01');
    expect(amount(new Decimal('2.675'))).toBe('2.68');
  });

  it('带单位', () => {
    expect(amountWithUnit(new Decimal('40125.71'))).toBe('40,125.71 元');
  });

  it('净值补足八位小数', () => {
    expect(nav(new Decimal('1.046'))).toBe('1.04600000');
    expect(nav(new Decimal('1.0573'))).toBe('1.05730000');
  });

  it('百分比带显式正负号', () => {
    expect(ratioPercent(new Decimal('0.010706'))).toBe('+1.07%');
    expect(ratioPercent(new Decimal('-0.005'))).toBe('-0.50%');
    expect(ratioPercent(new Decimal(0))).toBe('+0.00%');
  });

  it('doublePercent 与原版 (v*100).toFixed(2) 一致', () => {
    const annual = Math.pow(1 + 429.6 / 40125.71, 365 / 191) - 1;
    expect(doublePercent(annual)).toBe('+2.06%');
  });

  it('doublePercent 必须乘 100（漏掉会让结果小 100 倍）', () => {
    // 一年期翻 50 倍：ratio 49.5 -> 4950%
    expect(doublePercent(49.5)).toBe('+4950.00%');
  });

  it('doublePercent 对上溢/NaN 给出明确标记而不是 "Infinity"', () => {
    expect(doublePercent(Infinity)).toBe('+∞%');
    expect(doublePercent(-Infinity)).toBe('-∞%');
    expect(doublePercent(NaN)).toBe('无法计算');
  });

  it('toneOf 按符号给语义色', () => {
    expect(toneOf(new Decimal('0.01'))).toBe('GAIN');
    expect(toneOf(new Decimal('-0.01'))).toBe('LOSS');
    expect(toneOf(new Decimal(0))).toBe('GAIN');
  });

  it('toneOfDouble 不会因 Infinity 抛异常', () => {
    expect(toneOfDouble(Infinity)).toBe('GAIN');
    expect(toneOfDouble(-Infinity)).toBe('LOSS');
    expect(toneOfDouble(NaN)).toBe('NEUTRAL');
  });
});
