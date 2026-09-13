import { Decimal } from './money-format';
import type { CalcInput, CalcOutcome } from './calc-models';
import { resolvePeriod } from './holding-period';
import { buildAmountResult } from './amount-calculator';
import { buildNavResult } from './nav-calculator';

/**
 * 计算内核的唯一入口。UI 层只能通过这里拿结果，不得自行计算任何数字。
 * 与安卓版 AnnualizedCalculator.kt 等价。
 *
 * 校验顺序：字段格式 → 持有天数 → 公式。
 */

/**
 * 允许首尾空格；不接受千分位逗号、货币符号等富文本输入。
 * 与 Kotlin 的 `runCatching { BigDecimal(trimmed) }.getOrNull()` 等价。
 */
export function parseDecimal(raw: string): Decimal | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    const d = new Decimal(trimmed);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export function calculate(input: CalcInput): CalcOutcome {
  return input.kind === 'amount' ? calculateAmount(input) : calculateNav(input);
}

function calculateAmount(input: Extract<CalcInput, { kind: 'amount' }>): CalcOutcome {
  const buy = parseDecimal(input.buyAmount);
  if (buy === null || buy.lte(0)) {
    return { ok: false, error: 'INVALID_BUY_AMOUNT' };
  }

  const earn = parseDecimal(input.earnAmount);
  if (earn === null) {
    return { ok: false, error: 'INVALID_EARN_AMOUNT' };
  }

  const period = resolvePeriod(input.daysInput, input.buyDate, input.currentDate);
  if (!period.ok) return { ok: false, error: period.error };

  return { ok: true, result: buildAmountResult(buy, earn, period.days, period.source) };
}

function calculateNav(input: Extract<CalcInput, { kind: 'nav' }>): CalcOutcome {
  const buy = parseDecimal(input.buyNav);
  if (buy === null || buy.lte(0)) {
    return { ok: false, error: 'INVALID_BUY_NAV' };
  }

  const current = parseDecimal(input.currentNav);
  if (current === null || current.lte(0)) {
    return { ok: false, error: 'INVALID_CURRENT_NAV' };
  }

  const period = resolvePeriod(input.daysInput, input.buyDate, input.currentDate);
  if (!period.ok) return { ok: false, error: period.error };

  return { ok: true, result: buildNavResult(buy, current, period.days, period.source) };
}
