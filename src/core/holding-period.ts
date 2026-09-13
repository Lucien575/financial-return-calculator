import type { CalcError, DaysSource, PeriodOutcome } from './calc-models';

/**
 * 持有天数解析。与安卓版 HoldingPeriod.kt 等价。
 *
 * 校验顺序固定为 天数格式 → 日期缺失 → 日期倒挂 → 零天，
 * 保证错误提示稳定可预期。
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 解析 YYYY-MM-DD 为"距 1970-01-01 的天数"。
 * 全程走 UTC，避免本地时区把日期挪一天（安卓版用 LocalDate.toEpochDay()，同样与时区无关）。
 */
export function toEpochDay(iso: string): number | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  // 排除 2026-02-31 这类会被 Date.UTC 自动进位的非法日期
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.round(ms / 86_400_000);
}

export function resolvePeriod(
  daysInput: string,
  buyDate: string | null,
  currentDate: string | null,
): PeriodOutcome {
  const trimmed = daysInput.trim();

  if (trimmed !== '') {
    // 只接受纯整数：parseInt 会把 "191.5" 读成 191，那是不对的
    if (!/^[+-]?\d+$/.test(trimmed)) {
      return { ok: false, error: 'INVALID_DAYS' satisfies CalcError };
    }
    const manual = Number(trimmed);
    if (!Number.isSafeInteger(manual) || manual < 1) {
      return { ok: false, error: 'INVALID_DAYS' };
    }
    return { ok: true, days: manual, source: 'MANUAL' satisfies DaysSource };
  }

  if (!buyDate || !currentDate) {
    return { ok: false, error: 'MISSING_PERIOD' };
  }
  const buy = toEpochDay(buyDate);
  const current = toEpochDay(currentDate);
  if (buy === null || current === null) {
    return { ok: false, error: 'MISSING_PERIOD' };
  }
  if (current < buy) {
    return { ok: false, error: 'DATE_ORDER' };
  }
  const days = current - buy;
  if (days === 0) {
    return { ok: false, error: 'ZERO_DAYS' };
  }
  return { ok: true, days, source: 'DERIVED' };
}
