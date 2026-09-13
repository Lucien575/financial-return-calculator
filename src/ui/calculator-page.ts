import { h, clear, toneClass, haptic } from './dom';
import { icons } from './icons';
import { applyKey, NUMBER_KEYS, KEY_DONE } from '../core/keypad-reducer';
import {
  type CalculatorStore,
  type ActiveField,
  isPristine,
  isStale,
  currentResult,
  errorFor,
} from '../state/calculator-store';
import type { CalcInput, CalcResult, Metric } from '../core/calc-models';

/**
 * 计算器页。
 *
 * 结构只构建一次，之后按需定点更新文本与样式 —— 整页重渲染会把滚动位置重置到顶部，
 * 输入时体验很差。
 */

interface Row {
  root: HTMLElement;
  icon: HTMLElement;
  label: HTMLElement;
  value: HTMLElement;
  unit: HTMLElement;
  divider: HTMLElement;
  msg: HTMLElement;
  dateInput: HTMLInputElement | null;
}

function makeRow(opts: { withDate?: boolean }): Row {
  const icon = h('span', { html: '' });
  const label = h('span', { class: 'field-label' });
  const value = h('span', { class: 'field-value' });
  const unit = h('span', { class: 'field-unit' });
  const divider = h('div', { class: 'field-divider' });
  const msg = h('div', { class: 'field-msg' });

  let dateInput: HTMLInputElement | null = null;
  const rowChildren: (Node | string)[] = [icon, label, h('span', { class: 'field-spacer' }), value, unit];
  if (opts.withDate) {
    // 原生日期输入透明覆盖整行：视觉用我们自己的，选择器用系统的。
    dateInput = h('input', { type: 'date', class: 'field-date', 'aria-label': '选择日期' }) as HTMLInputElement;
    rowChildren.push(dateInput);
  }

  // 日期行里要放原生 <input type="date">，若外层再套 <button> 就成了嵌套交互控件
  // （axe 的 nested-interactive 违规，也会让读屏软件行为不可预期）。
  // 所以日期行用 div 承载，交互完全交给里面的 input。
  const rowEl = opts.withDate
    ? h('div', { class: 'field-row' }, ...rowChildren)
    : h('button', { class: 'field-row', type: 'button' }, ...rowChildren);
  const root = h('div', { class: 'field' }, rowEl, divider, msg);
  return { root, icon, label, value, unit, divider, msg, dateInput };
}

function maxDecimalsOf(field: ActiveField): number {
  if (field === 'BUY_NAV' || field === 'CURRENT_NAV') return 8;
  if (field === 'DAYS') return 0;
  return 2;
}

export interface CalculatorPageDeps {
  onSave: (input: CalcInput, result: CalcResult) => void;
  onShare: (input: CalcInput, result: CalcResult, page: HTMLElement) => void;
  onOpenSettings: () => void;
}

export function createCalculatorPage(store: CalculatorStore, deps: CalculatorPageDeps) {
  // ---------- 顶栏 ----------
  const clearBtn = h('button', { class: 'text-btn', type: 'button' }, '清空');
  const gearBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '设置', html: icons.gear() });
  const topbar = h(
    'div',
    { class: 'topbar' },
    h(
      'div',
      { class: 'grow' },
      h('h1', { class: 'h1' }, '年化收益计算器'),
      h('p', { class: 'subtitle' }, '结果保留 2 位小数 · 本地计算'),
    ),
    clearBtn,
    gearBtn,
  );

  // ---------- 分段控件 ----------
  const segAmount = h('button', { type: 'button', role: 'tab' }, '金额计算法');
  const segNav = h('button', { type: 'button', role: 'tab' }, '净值计算法');
  const segmented = h('div', { class: 'segmented', role: 'tablist' }, segAmount, segNav);

  // ---------- 输入卡 ----------
  const r1 = makeRow({});
  const r2 = makeRow({});
  const rBuyDate = makeRow({ withDate: true });
  const rCurDate = makeRow({ withDate: true });
  const rDays = makeRow({});
  const inputCard = h('div', { class: 'card' }, r1.root, r2.root, rBuyDate.root, rCurDate.root, rDays.root);

  // ---------- 结果卡 ----------
  const resultPrimary = h('span', { class: 'result-primary' });
  const resultEmptyHint = h(
    'p',
    { class: 'small result-empty-hint', style: 'margin-top:8px' },
    '填入下方金额后自动计算',
  );
  const resultDivider = h('div', { class: 'divider' });
  const resultGrid = h('div', { class: 'result-grid' });
  const resultNote = h('p', { class: 'result-note' });
  const resultCard = h(
    'div',
    { class: 'card result-card' },
    h('p', { class: 'result-label' }, '折合年化收益率'),
    resultPrimary,
    resultEmptyHint,
    resultDivider,
    resultGrid,
    resultNote,
  );

  // ---------- 计算过程 ----------
  const processHead = h(
    'button',
    { class: 'process-head', type: 'button', 'aria-expanded': 'true' },
    h('span', { class: 'card-title' }, '计算过程'),
    h('span', { html: icons.chevron() }),
  );
  const processSteps = h('div', { class: 'process-steps is-open' });
  const processCard = h('div', { class: 'card' }, processHead, processSteps);
  let processOpen = true;

  // ---------- 操作条 ----------
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, '保存到记录');
  const shareBtn = h('button', { class: 'btn btn-outline', type: 'button' }, '分享结果');
  const actionRow = h('div', { class: 'btn-row' }, saveBtn, shareBtn);

  // ---------- 键盘 ----------
  const keypad = h('div', { class: 'keypad' });
  for (let i = 0; i < NUMBER_KEYS.length; i += 4) {
    const rowKeys = NUMBER_KEYS.slice(i, i + 4);
    keypad.append(
      h(
        'div',
        { class: 'keypad-row' },
        ...rowKeys.map((k) =>
          h(
            'button',
            {
              type: 'button',
              class: k === KEY_DONE ? 'done' : '',
              'data-key': k,
            },
            k === 'DEL' ? '⌫' : k === KEY_DONE ? '完成' : k,
          ),
        ),
      ),
    );
  }

  const body = h(
    'div',
    { class: 'page-body has-nav stack' },
    topbar,
    segmented,
    inputCard,
    resultCard,
    processCard,
    actionRow,
  );
  const root = h('div', { class: 'page' }, body, keypad);

  // ---------- 交互 ----------
  clearBtn.addEventListener('click', () => {
    store.clearAll();
  });
  gearBtn.addEventListener('click', () => deps.onOpenSettings());
  segAmount.addEventListener('click', () => store.setMode('AMOUNT'));
  segNav.addEventListener('click', () => store.setMode('NAV'));
  processHead.addEventListener('click', () => {
    processOpen = !processOpen;
    processHead.setAttribute('aria-expanded', String(processOpen));
    processSteps.classList.toggle('is-open', processOpen);
  });

  saveBtn.addEventListener('click', () => {
    const r = currentResult(store.get());
    if (!r || isStale(store.get())) return;
    haptic();
    deps.onSave(store.get() && currentInputOf(store), r);
  });
  shareBtn.addEventListener('click', () => {
    const r = currentResult(store.get());
    if (!r || isStale(store.get())) return;
    haptic();
    deps.onShare(currentInputOf(store), r, root);
  });

  r1.root.querySelector('.field-row')?.addEventListener('click', () => focusField(store.get().mode === 'AMOUNT' ? 'BUY_AMOUNT' : 'BUY_NAV'));
  r2.root.querySelector('.field-row')?.addEventListener('click', () => focusField(store.get().mode === 'AMOUNT' ? 'EARN_AMOUNT' : 'CURRENT_NAV'));
  rDays.root.querySelector('.field-row')?.addEventListener('click', () => focusField('DAYS'));

  rBuyDate.dateInput?.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    store.setBuyDate(v === '' ? null : v);
  });
  rCurDate.dateInput?.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    store.setCurrentDate(v === '' ? null : v);
  });

  keypad.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const key = btn.dataset.key;
    const field = activeField;
    if (!key || !field) return;

    if (key === KEY_DONE) {
      activeField = null;
      store.focus(field);
      update();
      return;
    }
    const current = valueOfField(field);
    const next = applyKey(current, key, maxDecimalsOf(field));
    writeField(field, next);
  });

  function currentInputOf(s: CalculatorStore): CalcInput {
    const st = s.get();
    return st.mode === 'AMOUNT'
      ? {
          kind: 'amount',
          buyAmount: st.amount.buyAmount,
          earnAmount: st.amount.earnAmount,
          buyDate: st.amount.buyDate,
          currentDate: st.amount.currentDate,
          daysInput: st.amount.daysInput,
        }
      : {
          kind: 'nav',
          buyNav: st.nav.buyNav,
          currentNav: st.nav.currentNav,
          buyDate: st.nav.buyDate,
          currentDate: st.nav.currentDate,
          daysInput: st.nav.daysInput,
        };
  }

  let activeField: ActiveField | null = null;

  function focusField(field: ActiveField): void {
    // 日期行不走数字键盘
    if (field === 'BUY_DATE' || field === 'CURRENT_DATE') return;
    activeField = field;
    store.focus(field);
  }

  function valueOfField(field: ActiveField): string {
    const s = store.get();
    switch (field) {
      case 'BUY_AMOUNT':
        return s.amount.buyAmount;
      case 'EARN_AMOUNT':
        return s.amount.earnAmount;
      case 'BUY_NAV':
        return s.nav.buyNav;
      case 'CURRENT_NAV':
        return s.nav.currentNav;
      case 'DAYS':
        return s.mode === 'AMOUNT' ? s.amount.daysInput : s.nav.daysInput;
      default:
        return '';
    }
  }

  function writeField(field: ActiveField, v: string): void {
    switch (field) {
      case 'BUY_AMOUNT':
        store.setBuyAmount(v);
        break;
      case 'EARN_AMOUNT':
        store.setEarnAmount(v);
        break;
      case 'BUY_NAV':
        store.setBuyNav(v);
        break;
      case 'CURRENT_NAV':
        store.setCurrentNav(v);
        break;
      case 'DAYS':
        store.setDays(v);
        break;
    }
  }

  // ---------- 渲染 ----------
  function setRow(
    row: Row,
    opts: {
      icon: string;
      label: string;
      value: string;
      placeholder: string;
      unit?: string;
      hint?: string | null;
      error?: string | null;
      enabled?: boolean;
      active?: boolean;
    },
  ): void {
    row.icon.innerHTML = opts.icon;
    row.label.textContent = opts.label;

    const blank = opts.value.trim() === '';
    const shown = blank ? opts.placeholder : opts.value;
    row.value.textContent = shown;
    row.value.className = 'field-value';
    // 空字段显示的是占位符，它不是一个"值"，绝不能因为该行有错就染红
    if (blank) row.value.classList.add('is-muted');
    else if (opts.error) row.value.classList.add('is-error');
    else if (opts.enabled === false) row.value.classList.add('is-muted');

    row.unit.textContent = opts.unit ?? '';
    row.unit.style.display = opts.unit ? '' : 'none';

    row.divider.className = opts.active ? 'field-divider is-active' : 'field-divider';

    const message = opts.error ?? opts.hint ?? null;
    row.msg.textContent = message ?? '';
    row.msg.className = opts.error ? 'field-msg is-error' : 'field-msg';
    row.msg.style.display = message ? '' : 'none';

    const rowBtn = row.root.querySelector('.field-row');
    if (rowBtn instanceof HTMLButtonElement) rowBtn.disabled = opts.enabled === false;
  }

  function renderMetrics(metrics: Metric[]): void {
    clear(resultGrid);
    for (const m of metrics) {
      resultGrid.append(
        h(
          'div',
          {},
          h('p', { class: 'metric-label' }, m.label),
          h('p', { class: `metric-value ${toneClass(m.tone)}` }, m.value),
        ),
      );
    }
  }

  function update(): void {
    const s = store.get();
    const pristine = isPristine(s);
    const stale = isStale(s);
    const result = currentResult(s);
    const isAmount = s.mode === 'AMOUNT';

    segAmount.setAttribute('aria-selected', String(isAmount));
    segNav.setAttribute('aria-selected', String(!isAmount));

    // 空态不显示「清空」：空白页上挂一个没用的按钮是噪音
    clearBtn.style.display = pristine ? 'none' : '';

    const failure = s.outcome && !s.outcome.ok ? s.outcome.error : null;
    const fe = failure ? errorFor(failure) : null;
    // 空态不是错误态：什么都不填时不该飘红字
    const errFor = (f: ActiveField) => (!pristine && fe && fe.field === f ? fe.message : null);

    const datesDisabled = (isAmount ? s.amount.daysInput : s.nav.daysInput).trim() !== '';

    if (isAmount) {
      setRow(r1, {
        icon: icons.money(),
        label: '买入金额',
        value: s.amount.buyAmount,
        placeholder: '0.00',
        hint: '投资本金金额',
        error: errFor('BUY_AMOUNT'),
        active: s.activeField === 'BUY_AMOUNT',
      });
      setRow(r2, {
        icon: icons.trend(),
        label: '持有收益',
        value: s.amount.earnAmount,
        placeholder: '0.00',
        hint: '已获得的收益金额，亏损填负数',
        error: errFor('EARN_AMOUNT'),
        active: s.activeField === 'EARN_AMOUNT',
      });
    } else {
      setRow(r1, {
        icon: icons.chart(),
        label: '买入净值',
        value: s.nav.buyNav,
        placeholder: '0.0000',
        hint: '支持最多 8 位小数',
        error: errFor('BUY_NAV'),
        active: s.activeField === 'BUY_NAV',
      });
      setRow(r2, {
        icon: icons.chart(),
        label: '当前净值',
        value: s.nav.currentNav,
        placeholder: '0.0000',
        hint: '支持最多 8 位小数',
        error: errFor('CURRENT_NAV'),
        active: s.activeField === 'CURRENT_NAV',
      });
    }

    const buyDate = isAmount ? s.amount.buyDate : s.nav.buyDate;
    const curDate = isAmount ? s.amount.currentDate : s.nav.currentDate;
    const daysInput = isAmount ? s.amount.daysInput : s.nav.daysInput;

    setRow(rBuyDate, {
      icon: icons.calendar(),
      label: '买入日期',
      value: buyDate ?? '',
      placeholder: '点击选择',
      hint: datesDisabled ? '已手填天数，日期不参与计算' : null,
      enabled: !datesDisabled,
    });
    if (rBuyDate.dateInput) {
      rBuyDate.dateInput.value = buyDate ?? '';
      rBuyDate.dateInput.disabled = datesDisabled;
    }

    setRow(rCurDate, {
      icon: icons.calendar(),
      label: '当前日期',
      value: curDate ?? '',
      placeholder: '点击选择',
      error: errFor('CURRENT_DATE'),
      enabled: !datesDisabled,
    });
    if (rCurDate.dateInput) {
      rCurDate.dateInput.value = curDate ?? '';
      rCurDate.dateInput.disabled = datesDisabled;
    }

    setRow(rDays, {
      icon: icons.timer(),
      label: '持有天数',
      value: daysInput,
      placeholder: '自动推算',
      unit: '天',
      hint: '手填优先生效；留空则按日期自动推算',
      error: errFor('DAYS'),
      active: s.activeField === 'DAYS',
    });

    // 结果卡
    if (!result) {
      resultCard.classList.remove('is-stale');
      resultPrimary.style.display = 'none';
      resultDivider.style.display = 'none';
      resultGrid.style.display = 'none';
      resultNote.style.display = 'none';
      resultEmptyHint.style.display = '';
    } else {
      resultCard.classList.toggle('is-stale', stale);
      resultPrimary.style.display = '';
      resultPrimary.textContent = result.primaryAnnual;
      resultPrimary.className = `result-primary ${toneClass(result.primaryTone)}`;
      resultDivider.style.display = '';
      resultGrid.style.display = '';
      resultEmptyHint.style.display = 'none';
      renderMetrics(result.metrics);
      if (stale) {
        resultNote.textContent = '输入有误，上面是上一次的有效结果';
        resultNote.className = 'result-note is-error';
        resultNote.style.display = '';
      } else if (result.daysSource === 'DERIVED') {
        resultNote.textContent = '持有天数由日期自动推算';
        resultNote.className = 'result-note';
        resultNote.style.display = '';
      } else {
        resultNote.style.display = 'none';
      }
    }

    // 计算过程：没结果就整张卡不显示
    processCard.style.display = result ? '' : 'none';
    if (result) {
      clear(processSteps);
      for (const step of result.steps) processSteps.append(h('p', {}, step));
    }

    const canAct = !!result && !stale;
    (saveBtn as HTMLButtonElement).disabled = !canAct;
    (shareBtn as HTMLButtonElement).disabled = !canAct;

    keypad.style.display = activeField ? '' : 'none';
  }

  update();
  const unsubscribe = store.subscribe(update);

  return {
    el: root,
    dispose: unsubscribe,
    /** 供「从后台回来」等外部场景调用：收起键盘并清空 */
    resetLocalState(): void {
      activeField = null;
    },
    /** 当前页面是否正在编辑某个字段（决定要不要显示键盘） */
    isEditing(): boolean {
      return activeField !== null;
    },
  };
}
