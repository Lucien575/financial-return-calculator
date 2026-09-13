import { describe, it, expect } from 'vitest';
import { calculate, parseDecimal } from '../src/core/annualized-calculator';
import type { CalcOutcome } from '../src/core/calc-models';

/** 移植自安卓版 AmountCalculatorTest / NavCalculatorTest / AnnualizedCalculatorTest / ExtremeInputTest */

function amountCase(buy: string, earn: string, days: string): CalcOutcome {
  return calculate({
    kind: 'amount',
    buyAmount: buy,
    earnAmount: earn,
    buyDate: null,
    currentDate: null,
    daysInput: days,
  });
}
function navCase(buy: string, current: string, days: string): CalcOutcome {
  return calculate({
    kind: 'nav',
    buyNav: buy,
    currentNav: current,
    buyDate: null,
    currentDate: null,
    daysInput: days,
  });
}
function metricValue(outcome: CalcOutcome, label: string): string {
  if (!outcome.ok) throw new Error(`校验失败: ${outcome.error}`);
  const m = outcome.result.metrics.find((x) => x.label === label);
  if (!m) throw new Error(`找不到指标 ${label}`);
  return m.value;
}

describe('金额计算法', () => {
  it('默认值是 +2.05%，且指标与计算过程都对得上', () => {
    const out = amountCase('40125.71', '429.60', '191');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.result;
    expect(r.primaryAnnual).toBe('+2.05%');
    expect(r.primaryTone).toBe('GAIN');
    expect(r.days).toBe(191);
    expect(r.mode).toBe('AMOUNT');
    expect(r.compoundAnnual).toBe('+2.06%');
    expect(r.metrics).toEqual([
      { label: '买入金额', value: '40,125.71 元' },
      { label: '持有收益', value: '429.60 元', tone: 'GAIN' },
      { label: '当前总额', value: '40,555.31 元' },
      { label: '持有天数', value: '191 天' },
      { label: '区间收益率', value: '+1.07%', tone: 'GAIN' },
    ]);
  });

  it('计算过程把公式代入数值', () => {
    const out = amountCase('40125.71', '429.60', '191');
    if (!out.ok) throw new Error('unreachable');
    expect(out.result.steps).toEqual([
      '当前总额 = 40,125.71 + 429.60 = 40,555.31 元',
      '区间收益率 = 429.60 ÷ 40,125.71 = +1.07%',
      '年化收益率 = +1.07% × (365 ÷ 191) = +2.05%',
      '复利年化（参考）= +2.06%',
    ]);
  });

  it('亏损时是 LOSS 语义色', () => {
    const out = amountCase('10000', '-500', '365');
    if (!out.ok) throw new Error('unreachable');
    expect(out.result.primaryAnnual).toBe('-5.00%');
    expect(out.result.primaryTone).toBe('LOSS');
    expect(metricValue(out, '持有收益')).toBe('-500.00 元');
    expect(metricValue(out, '当前总额')).toBe('9,500.00 元');
  });

  it('持有 1 天时年化放大 365 倍', () => {
    expect((amountCase('10000', '100', '1') as { result: { primaryAnnual: string } }).result.primaryAnnual).toBe('+365.00%');
  });

  it('十年期持有结果稳定', () => {
    const out = amountCase('10000', '5000', '3650');
    expect(metricValue(out, '区间收益率')).toBe('+50.00%');
    expect((out as { result: { primaryAnnual: string } }).result.primaryAnnual).toBe('+5.00%');
  });
});

describe('净值计算法', () => {
  it('默认值是 +2.07%，8 位小数展示', () => {
    const out = navCase('1.046', '1.0573', '191');
    if (!out.ok) throw new Error('unreachable');
    expect(out.result.primaryAnnual).toBe('+2.07%');
    expect(out.result.primaryTone).toBe('GAIN');
    expect(out.result.mode).toBe('NAV');
    expect(out.result.compoundAnnual).toBeNull();
    expect(out.result.metrics).toEqual([
      { label: '买入净值', value: '1.04600000' },
      { label: '当前净值', value: '1.05730000' },
      { label: '持有天数', value: '191 天' },
      { label: '区间收益率', value: '+1.08%', tone: 'GAIN' },
    ]);
  });

  it('净值不变 -> +0.00%', () => {
    const out = navCase('1.046', '1.046', '191');
    expect((out as { result: { primaryAnnual: string } }).result.primaryAnnual).toBe('+0.00%');
  });

  it('净值下跌 -> LOSS', () => {
    const out = navCase('1.5000', '1.3500', '100');
    if (!out.ok) throw new Error('unreachable');
    expect(out.result.primaryTone).toBe('LOSS');
    expect(metricValue(out, '区间收益率')).toBe('-10.00%');
  });

  it('八位小数精度不丢', () => {
    const out = navCase('1.00000001', '1.00000003', '365');
    expect(metricValue(out, '买入净值')).toBe('1.00000001');
    expect(metricValue(out, '当前净值')).toBe('1.00000003');
    expect((out as { result: { primaryAnnual: string } }).result.primaryAnnual).toBe('+0.00%');
  });
});

describe('统一入口的校验', () => {
  it('金额法走金额分支、净值法走净值分支', () => {
    expect((amountCase('40125.71', '429.60', '191') as { result: { primaryAnnual: string } }).result.primaryAnnual).toBe('+2.05%');
    expect((navCase('1.046', '1.0573', '191') as { result: { primaryAnnual: string } }).result.primaryAnnual).toBe('+2.07%');
  });

  it('日期推算与手填得到同样的数值（只是 daysSource 不同）', () => {
    const manual = amountCase('40125.71', '429.60', '191');
    const derived = calculate({
      kind: 'amount',
      buyAmount: '40125.71',
      earnAmount: '429.60',
      buyDate: '2026-03-05',
      currentDate: '2026-09-12',
      daysInput: '',
    });
    if (!manual.ok || !derived.ok) throw new Error('unreachable');
    expect(derived.result.primaryAnnual).toBe(manual.result.primaryAnnual);
    expect(derived.result.metrics).toEqual(manual.result.metrics);
    expect(derived.result.steps).toEqual(manual.result.steps);
    expect(manual.result.daysSource).toBe('MANUAL');
    expect(derived.result.daysSource).toBe('DERIVED');
  });

  it('买入金额必须大于 0', () => {
    for (const bad of ['0', 'abc', '-5', '']) {
      expect(amountCase(bad, '429.60', '191'), `买入=${bad}`).toEqual({
        ok: false,
        error: 'INVALID_BUY_AMOUNT',
      });
    }
  });

  it('持有收益允许负数，但不能非数字', () => {
    expect(amountCase('10000', '-500', '365').ok).toBe(true);
    expect(amountCase('10000', '', '365')).toEqual({
      ok: false,
      error: 'INVALID_EARN_AMOUNT',
    });
  });

  it('净值必须大于 0', () => {
    expect(navCase('0', '1.0573', '191')).toEqual({ ok: false, error: 'INVALID_BUY_NAV' });
    expect(navCase('1.046', '0', '191')).toEqual({ ok: false, error: 'INVALID_CURRENT_NAV' });
  });

  it('天数相关错误在校验阶段就返回', () => {
    expect(amountCase('10000', '100', '')).toEqual({ ok: false, error: 'MISSING_PERIOD' });
    expect(amountCase('10000', '100', '0')).toEqual({ ok: false, error: 'INVALID_DAYS' });
  });

  it('parseDecimal 容错与拒绝规则', () => {
    expect(parseDecimal(' 40125.71 ')?.toString()).toBe('40125.71');
    expect(parseDecimal('1,000')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    // 全局关掉了指数形式（等价于 Kotlin 的 toPlainString），所以这里展开成完整数字
    const big = parseDecimal('1e305');
    expect(big).not.toBeNull();
    expect(big!.isFinite()).toBe(true);
    expect(big!.toString().startsWith('1')).toBe(true);
    expect(big!.toString()).not.toContain('e');
  });
});

describe('极端输入不能崩', () => {
  it('一天内暴涨导致复利上溢 -> +∞%', () => {
    const out = amountCase('0.01', '1e305', '1');
    expect(out.ok).toBe(true);
    expect((out as { result: { compoundAnnual: string } }).result.compoundAnnual).toBe('+∞%');
  });

  it('极小金额也给出两个收益率', () => {
    const out = amountCase('0.01', '0.01', '7');
    if (!out.ok) throw new Error('unreachable');
    expect(metricValue(out, '区间收益率')).toBe('+100.00%');
    expect(out.result.primaryAnnual).toBe('+5214.29%');
    // 这一格是与原版逐位比对的关键：精确值是 ...6300，double 乘法舍入到 ...6304
    expect(out.result.compoundAnnual).toBe('+497237712236506304.00%');
  });

  it('超长持有天数仍然有限', () => {
    const out = amountCase('10000', '5000', '36500');
    expect((out as { result: { primaryAnnual: string } }).result.primaryAnnual).toBe('+0.50%');
  });

  it('净值极端比值不抛异常', () => {
    expect(navCase('0.00000001', '99999999', '1').ok).toBe(true);
  });
});
