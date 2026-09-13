/**
 * 计算内核的值模型。与安卓版 core/CalcModels.kt 一一对应。
 */

export type CalcMode = 'AMOUNT' | 'NAV';

export type DaysSource = 'MANUAL' | 'DERIVED';

/** 语义色调。NEUTRAL 用于非涨跌含义的指标。 */
export type Tone = 'NEUTRAL' | 'GAIN' | 'LOSS';

/**
 * 校验错误码。顺序即校验顺序，保证提示稳定可预期。
 * 与安卓版 CalcError 完全一致（8 个）。
 */
export type CalcError =
  | 'INVALID_BUY_AMOUNT'
  | 'INVALID_EARN_AMOUNT'
  | 'INVALID_BUY_NAV'
  | 'INVALID_CURRENT_NAV'
  | 'INVALID_DAYS'
  | 'DATE_ORDER'
  | 'ZERO_DAYS'
  | 'MISSING_PERIOD';

export interface Metric {
  label: string;
  value: string;
  tone?: Tone;
}

export interface CalcResult {
  mode: CalcMode;
  days: number;
  daysSource: DaysSource;
  /** 折合年化收益率，已格式化，如 "+2.05%" */
  primaryAnnual: string;
  primaryTone: Tone;
  metrics: Metric[];
  /** 计算过程，公式代入数值后的可读文本 */
  steps: string[];
  /** 仅金额法有；净值法为 null */
  compoundAnnual: string | null;
}

export interface AmountInput {
  kind: 'amount';
  buyAmount: string;
  earnAmount: string;
  buyDate: string | null;
  currentDate: string | null;
  daysInput: string;
}

export interface NavInput {
  kind: 'nav';
  buyNav: string;
  currentNav: string;
  buyDate: string | null;
  currentDate: string | null;
  daysInput: string;
}

export type CalcInput = AmountInput | NavInput;

export type CalcOutcome =
  | { ok: true; result: CalcResult }
  | { ok: false; error: CalcError };

export type PeriodOutcome =
  | { ok: true; days: number; source: DaysSource }
  | { ok: false; error: CalcError };
