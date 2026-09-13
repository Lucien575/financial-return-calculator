/** 极简 DOM 工具。整个工程不用框架，所以这里保持最小。 */

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/** 创建元素：h('div', { class: 'card' }, child1, child2) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** 语义色 → class 名。NEUTRAL 用主文字色。 */
export function toneClass(tone: 'NEUTRAL' | 'GAIN' | 'LOSS' | undefined): string {
  if (tone === 'GAIN') return 'tone-gain';
  if (tone === 'LOSS') return 'tone-loss';
  return 'tone-neutral';
}

/** 结果卡数字滚动动画：尊重系统「减少动态效果」。 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** 轻震动：iOS Safari 不支持 navigator.vibrate，静默降级。 */
export function haptic(ms = 15): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 不支持就算了，不能因为震动失败影响主流程 */
  }
}

let snackbarEl: HTMLElement | null = null;
let snackbarTimer: number | undefined;

/** 底部提示条。与安卓版的 Snackbar 行为一致。 */
export function showSnackbar(message: string): void {
  if (!snackbarEl) {
    snackbarEl = h('div', { class: 'snackbar', role: 'status', 'aria-live': 'polite' });
    document.body.append(snackbarEl);
  }
  snackbarEl.textContent = message;
  snackbarEl.classList.add('is-shown');
  window.clearTimeout(snackbarTimer);
  snackbarTimer = window.setTimeout(() => snackbarEl?.classList.remove('is-shown'), 2400);
}

/** 简单确认弹窗，返回 Promise<boolean>。 */
export function confirmDialog(title: string, body: string, confirmText = '确定'): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      backdrop.remove();
      resolve(v);
    };
    const backdrop = h(
      'div',
      { class: 'dialog-backdrop', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'dialog' },
        h('h3', {}, title),
        h('p', { class: 'small' }, body),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { class: 'text-btn', onClick: () => close(false) }, '取消'),
          h('button', { class: 'text-btn danger', onClick: () => close(true) }, confirmText),
        ),
      ),
    );
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    document.body.append(backdrop);
  });
}

/** 单行文本输入弹窗，用于备注。 */
export function promptDialog(
  title: string,
  placeholder: string,
  initial: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', {
      type: 'text',
      value: initial,
      placeholder,
      maxlength: 60,
    }) as HTMLInputElement;
    const close = (v: string | null) => {
      backdrop.remove();
      resolve(v);
    };
    const backdrop = h(
      'div',
      { class: 'dialog-backdrop', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'dialog' },
        h('h3', {}, title),
        input,
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { class: 'text-btn', onClick: () => close(null) }, '取消'),
          h('button', { class: 'text-btn', onClick: () => close(input.value) }, '保存'),
        ),
      ),
    );
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });
    document.body.append(backdrop);
    input.focus();
    input.select();
  });
}
