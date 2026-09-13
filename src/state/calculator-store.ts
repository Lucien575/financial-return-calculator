import { calculate } from '../core/annualized-calculator';
import type {
  CalcError,
  CalcInput,
  CalcMode,
  CalcOutcome,
  CalcResult,
  DaysSource,
} from '../core/calc-models';

/**
 * 计算器状态。与安卓版 CalculatorViewModel 行为一一对应：
 *
 * - 所有字段默认为空：每次打开都是白纸，不预填示例数字，也不带回上次算到一半的输入
 * - 输入即算，没有"计算"按钮
 * - 校验失败时保留上一次有效结果（isStale），不清空
 * - isPristine（空态）必须和"填错了"分开：空态不报错，给引导
 */

export type ActiveField =
  | 'BUY_AMOUNT'
  | 'EARN_AMOUNT'
  | 'BUY_NAV'
  | 'CURRENT_NAV'
  | 'BUY_DATE'
  | 'CURRENT_DATE'
  | 'DAYS';

export interface AmountFields {
  buyAmount: string;
  earnAmount: string;
  buyDate: string | null;
  currentDate: string | null;
  daysInput: string;
}
export interface NavFields {
  buyNav: string;
  currentNav: string;
  buyDate: string | null;
  currentDate: string | null;
  daysInput: string;
}

export interface CalcState {
  mode: CalcMode;
  amount: AmountFields;
  nav: NavFields;
  outcome: CalcOutcome | null;
  lastValidResult: CalcResult | null;
  activeField: ActiveField | null;
}

export interface FieldError {
  field: ActiveField;
  message: string;
}

const emptyAmount = (): AmountFields => ({
  buyAmount: '',
  earnAmount: '',
  buyDate: null,
  currentDate: null,
  daysInput: '',
});
const emptyNav = (): NavFields => ({
  buyNav: '',
  currentNav: '',
  buyDate: null,
  currentDate: null,
  daysInput: '',
});

export function initialState(): CalcState {
  const s: CalcState = {
    mode: 'AMOUNT',
    amount: emptyAmount(),
    nav: emptyNav(),
    outcome: null,
    lastValidResult: null,
    activeField: null,
  };
  s.outcome = computeOne(s);
  return s;
}

/** 空态：当前模式下所有输入都为空。空态不报错，显示引导。 */
export function isPristine(s: CalcState): boolean {
  if (s.mode === 'AMOUNT') {
    const f = s.amount;
    return (
      f.buyAmount.trim() === '' &&
      f.earnAmount.trim() === '' &&
      f.daysInput.trim() === '' &&
      f.buyDate === null &&
      f.currentDate === null
    );
  }
  const f = s.nav;
  return (
    f.buyNav.trim() === '' &&
    f.currentNav.trim() === '' &&
    f.daysInput.trim() === '' &&
    f.buyDate === null &&
    f.currentDate === null
  );
}

/** 校验失败时为 true：结果卡要置灰保留上一次有效结果。 */
export function isStale(s: CalcState): boolean {
  return !isPristine(s) && s.outcome !== null && !s.outcome.ok;
}

export function currentResult(s: CalcState): CalcResult | null {
  return s.lastValidResult;
}

export function currentInput(s: CalcState): CalcInput {
  if (s.mode === 'AMOUNT') {
    return {
      kind: 'amount',
      buyAmount: s.amount.buyAmount,
      earnAmount: s.amount.earnAmount,
      buyDate: s.amount.buyDate,
      currentDate: s.amount.currentDate,
      daysInput: s.amount.daysInput,
    };
  }
  return {
    kind: 'nav',
    buyNav: s.nav.buyNav,
    currentNav: s.nav.currentNav,
    buyDate: s.nav.buyDate,
    currentDate: s.nav.currentDate,
    daysInput: s.nav.daysInput,
  };
}

function computeOne(s: CalcState): CalcOutcome {
  return calculate(currentInput(s));
}

/** 错误码 -> 显示在哪一行 + 文案（与安卓版 errorFor 完全一致）。 */
export function errorFor(error: CalcError): FieldError {
  switch (error) {
    case 'INVALID_BUY_AMOUNT':
      return { field: 'BUY_AMOUNT', message: '请输入大于 0 的买入金额' };
    case 'INVALID_EARN_AMOUNT':
      return { field: 'EARN_AMOUNT', message: '请输入有效的持有收益（可填负数）' };
    case 'INVALID_BUY_NAV':
      return { field: 'BUY_NAV', message: '请输入大于 0 的净值' };
    case 'INVALID_CURRENT_NAV':
      return { field: 'CURRENT_NAV', message: '请输入大于 0 的净值' };
    case 'INVALID_DAYS':
      return { field: 'DAYS', message: '持有天数需为不小于 1 的整数' };
    case 'DATE_ORDER':
      return { field: 'CURRENT_DATE', message: '当前日期不能早于买入日期' };
    case 'ZERO_DAYS':
      return { field: 'CURRENT_DATE', message: '买入与当前日期不能相同' };
    case 'MISSING_PERIOD':
      return { field: 'DAYS', message: '请填写日期，或直接填持有天数' };
  }
}

/** 极简 store：状态变更后通知订阅者重渲染。 */
export class CalculatorStore {
  private state: CalcState = initialState();
  private listeners = new Set<() => void>();

  get(): CalcState {
    return this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** 改字段后重算，并维护 lastValidResult（失败时沿用上一次）。 */
  private mutateAndRecalc(patch: (s: CalcState) => CalcState): void {
    const next = patch(this.state);
    const outcome = computeOne(next);
    this.state = {
      ...next,
      outcome,
      lastValidResult: outcome.ok ? outcome.result : next.lastValidResult,
    };
    this.emit();
  }

  setMode(mode: CalcMode): void {
    this.mutateAndRecalc((s) => ({ ...s, mode }));
  }

  focus(field: ActiveField): void {
    this.state = { ...this.state, activeField: field };
    this.emit();
  }

  setBuyAmount(v: string): void {
    this.mutateAndRecalc((s) => ({
      ...s,
      amount: { ...s.amount, buyAmount: v },
      activeField: 'BUY_AMOUNT',
    }));
  }

  setEarnAmount(v: string): void {
    this.mutateAndRecalc((s) => ({
      ...s,
      amount: { ...s.amount, earnAmount: v },
      activeField: 'EARN_AMOUNT',
    }));
  }

  setBuyNav(v: string): void {
    this.mutateAndRecalc((s) => ({
      ...s,
      nav: { ...s.nav, buyNav: v },
      activeField: 'BUY_NAV',
    }));
  }

  setCurrentNav(v: string): void {
    this.mutateAndRecalc((s) => ({
      ...s,
      nav: { ...s.nav, currentNav: v },
      activeField: 'CURRENT_NAV',
    }));
  }

  /** 选了日期就清空手填天数（手填始终优先，两个来源不能打架）。 */
  setBuyDate(v: string | null): void {
    this.mutateAndRecalc((s) =>
      s.mode === 'AMOUNT'
        ? { ...s, amount: { ...s.amount, buyDate: v, daysInput: '' }, activeField: 'BUY_DATE' }
        : { ...s, nav: { ...s.nav, buyDate: v, daysInput: '' }, activeField: 'BUY_DATE' },
    );
  }

  setCurrentDate(v: string | null): void {
    this.mutateAndRecalc((s) =>
      s.mode === 'AMOUNT'
        ? {
            ...s,
            amount: { ...s.amount, currentDate: v, daysInput: '' },
            activeField: 'CURRENT_DATE',
          }
        : { ...s, nav: { ...s.nav, currentDate: v, daysInput: '' }, activeField: 'CURRENT_DATE' },
    );
  }

  /** 填了手填天数就清空日期，让"手填优先"这条规则在 UI 上看得见。 */
  setDays(v: string): void {
    this.mutateAndRecalc((s) => {
      const cleared = v.trim() !== '';
      if (s.mode === 'AMOUNT') {
        return {
          ...s,
          amount: {
            ...s.amount,
            daysInput: v,
            buyDate: cleared ? null : s.amount.buyDate,
            currentDate: cleared ? null : s.amount.currentDate,
          },
          activeField: 'DAYS',
        };
      }
      return {
        ...s,
        nav: {
          ...s.nav,
          daysInput: v,
          buyDate: cleared ? null : s.nav.buyDate,
          currentDate: cleared ? null : s.nav.currentDate,
        },
        activeField: 'DAYS',
      };
    });
  }

  /** 回到完全空白的状态（首页「清空」按钮、以及从后台回来时调用）。 */
  clearAll(): void {
    this.state = initialState();
    this.emit();
  }

  /** 天数来自手填还是日期推算（结果卡要据此给出说明）。 */
  daysSource(): DaysSource | null {
    return this.state.lastValidResult?.daysSource ?? null;
  }
}
