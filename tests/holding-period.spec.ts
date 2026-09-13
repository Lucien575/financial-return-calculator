import { describe, it, expect } from 'vitest';
import { resolvePeriod, toEpochDay } from '../src/core/holding-period';

/** 移植自安卓版 HoldingPeriodTest.kt */
describe('持有天数解析', () => {
  it('手填天数优先于日期', () => {
    expect(resolvePeriod('191', '2026-03-05', '2026-09-12')).toEqual({
      ok: true,
      days: 191,
      source: 'MANUAL',
    });
  });

  it('手填为空时用日期推算', () => {
    expect(resolvePeriod('', '2026-03-05', '2026-09-12')).toEqual({
      ok: true,
      days: 191,
      source: 'DERIVED',
    });
  });

  it('跨闰年精确', () => {
    expect(resolvePeriod('', '2024-02-28', '2024-03-01')).toEqual({
      ok: true,
      days: 2,
      source: 'DERIVED',
    });
  });

  it('与时区无关（不会因本地时区挪一天）', () => {
    expect(resolvePeriod('', '2026-01-01', '2026-01-02')).toEqual({
      ok: true,
      days: 1,
      source: 'DERIVED',
    });
  });

  it('非法手填天数被拒', () => {
    for (const bad of ['0', '-3', '191.5', 'abc', '1e3']) {
      expect(resolvePeriod(bad, null, null), `输入 ${bad}`).toEqual({
        ok: false,
        error: 'INVALID_DAYS',
      });
    }
  });

  it('日期与天数都缺 -> MISSING_PERIOD', () => {
    expect(resolvePeriod('', null, null)).toEqual({ ok: false, error: 'MISSING_PERIOD' });
    expect(resolvePeriod('', '2026-01-01', null)).toEqual({ ok: false, error: 'MISSING_PERIOD' });
  });

  it('当前日期早于买入日期 -> DATE_ORDER', () => {
    expect(resolvePeriod('', '2026-09-12', '2026-03-05')).toEqual({
      ok: false,
      error: 'DATE_ORDER',
    });
  });

  it('同一天 -> ZERO_DAYS', () => {
    expect(resolvePeriod('', '2026-09-12', '2026-09-12')).toEqual({
      ok: false,
      error: 'ZERO_DAYS',
    });
  });

  it('纯空白的天数输入视为留空', () => {
    expect(resolvePeriod('   ', '2026-03-05', '2026-09-12')).toEqual({
      ok: true,
      days: 191,
      source: 'DERIVED',
    });
  });

  it('非法日期（如 2026-02-31）不会被 Date 自动进位成 3 月 3 日', () => {
    expect(toEpochDay('2026-02-31')).toBeNull();
    expect(resolvePeriod('', '2026-02-31', '2026-03-05')).toEqual({
      ok: false,
      error: 'MISSING_PERIOD',
    });
  });

  it('epoch day 基准与 Unix 一致', () => {
    expect(toEpochDay('1970-01-01')).toBe(0);
    expect(toEpochDay('1970-01-02')).toBe(1);
  });
});
