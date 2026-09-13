import { h, clear, confirmDialog, promptDialog } from './dom';
import { icons } from './icons';
import { toggleSelection, canCompare } from '../core/selection';
import type { RecordSummary } from '../data/records';
import type { Tone } from '../core/calc-models';

/**
 * 记录页。对应安卓版 RecordsScreen：
 * 分组列表 / 左滑删除 / 长按多选 / 并排对比 / 备注。
 */

export interface RecordsPageDeps {
  list: () => Promise<RecordSummary[]>;
  remove: (id: number) => Promise<void>;
  setNote: (id: number, note: string | null) => Promise<void>;
  clearAll: () => Promise<void>;
  onOpenSettings: () => void;
}

const DAY_FMT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
const TIME_FMT: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

const dayLabel = (ms: number) => new Date(ms).toLocaleDateString('zh-CN', DAY_FMT);
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString('zh-CN', TIME_FMT);

function toneColorClass(tone: Tone): string {
  return tone === 'LOSS' ? 'tone-loss' : 'tone-gain';
}

export function createRecordsPage(deps: RecordsPageDeps) {
  let summaries: RecordSummary[] = [];
  let selected = new Set<number>();
  const openRows = new Map<number, HTMLElement>();

  const countLabel = h('p', { class: 'subtitle' }, '暂无记录');
  const clearBtn = h('button', { class: 'text-btn danger', type: 'button' }, '清空');
  const gearBtn = h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': '设置',
    html: icons.gear(),
  });

  const topbar = h(
    'div',
    { class: 'topbar' },
    h('div', { class: 'grow' }, h('h1', { class: 'h1' }, '记录'), countLabel),
    clearBtn,
    gearBtn,
  );

  const listEl = h('div', { class: 'stack' });
  const compareHost = h('div', {});
  const body = h('div', { class: 'page-body has-nav stack' }, topbar, listEl, compareHost);
  const root = h('div', { class: 'page' }, body);

  gearBtn.addEventListener('click', () => deps.onOpenSettings());
  clearBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('清空所有记录？', '删除后无法恢复。', '清空');
    if (!ok) return;
    await deps.clearAll();
    selected = new Set();
    await refresh();
  });

  /** 左滑露出删除。手势用 Pointer Events，触摸与鼠标都能用。 */
  function attachSwipe(face: HTMLElement, id: number): void {
    let startX = 0;
    let dx = 0;
    let dragging = false;
    const REVEAL = 96;

    face.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      dx = 0;
      dragging = true;
      face.style.transition = 'none';
    });
    face.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = Math.min(0, Math.max(-REVEAL, e.clientX - startX));
      // 只在明显横向拖动时接管，避免影响纵向滚动
      if (Math.abs(dx) > 8) {
        face.setPointerCapture?.(e.pointerId);
        face.style.transform = `translateX(${dx}px)`;
      }
    });
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      face.style.transition = 'transform 0.15s ease';
      const open = dx < -REVEAL / 2;
      face.style.transform = `translateX(${open ? -REVEAL : 0}px)`;
      if (open) openRows.set(id, face);
      else openRows.delete(id);
    };
    face.addEventListener('pointerup', finish);
    face.addEventListener('pointercancel', finish);
  }

  function closeAllSwipes(): void {
    for (const face of openRows.values()) {
      face.style.transition = 'transform 0.15s ease';
      face.style.transform = 'translateX(0)';
    }
    openRows.clear();
  }

  let longPressTimer: number | undefined;
  let longPressed = false;

  function attachLongPress(face: HTMLElement, id: number): void {
    const start = () => {
      longPressed = false;
      longPressTimer = window.setTimeout(() => {
        longPressed = true;
        selected = toggleSelection(selected, id);
        render();
      }, 500);
    };
    const cancel = () => window.clearTimeout(longPressTimer);
    face.addEventListener('pointerdown', start);
    face.addEventListener('pointerup', cancel);
    face.addEventListener('pointermove', cancel);
    face.addEventListener('pointercancel', cancel);
    face.addEventListener('pointerleave', cancel);
  }

  function renderRow(s: RecordSummary): HTMLElement {
    const del = h('button', { class: 'record-delete', type: 'button' }, '删除');
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deps.remove(s.id);
      selected.delete(s.id);
      await refresh();
    });

    const face = h(
      'div',
      { class: 'record-face' },
      h('div', { class: 'record-bar', style: `background:${s.tone === 'LOSS' ? 'var(--loss)' : 'var(--gain)'}` }),
      h(
        'div',
        { class: 'record-main' },
        h(
          'div',
          { class: 'record-line' },
          h('span', { class: 'record-title' }, s.title),
          h('span', { class: 'record-sub' }, timeLabel(s.createdAt)),
        ),
        h('div', { class: 'record-sub' }, s.subtitle),
        s.note ? h('div', { class: 'record-note' }, s.note) : null,
      ),
      h('span', { class: `record-annual ${toneColorClass(s.tone)}` }, s.primaryAnnual),
    );

    face.addEventListener('click', async () => {
      if (longPressed) return; // 长按刚触发过，别再当成点击
      closeAllSwipes();
      if (selected.size > 0) {
        selected = toggleSelection(selected, s.id);
        render();
        return;
      }
      const note = await promptDialog('备注', '例如：招行 90 天理财', s.note ?? '');
      if (note !== null) {
        await deps.setNote(s.id, note);
        await refresh();
      }
    });

    attachSwipe(face, s.id);
    attachLongPress(face, s.id);

    const wrap = h('div', { class: `record${selected.has(s.id) ? ' is-selected' : ''}` }, del, face);
    return wrap;
  }

  function renderCompare(): void {
    clear(compareHost);
    if (!canCompare(selected)) return;
    const pair = [...selected]
      .map((id) => summaries.find((s) => s.id === id))
      .filter((x): x is RecordSummary => !!x);
    if (pair.length !== 2) return;

    const [a, b] = pair;
    const av = Number.parseFloat(a.primaryAnnual.replace('%', ''));
    const bv = Number.parseFloat(b.primaryAnnual.replace('%', ''));
    const aWin = Number.isFinite(av) && Number.isFinite(bv) && av > bv;
    const bWin = Number.isFinite(av) && Number.isFinite(bv) && bv > av;

    const row = (label: string, left: string, right: string, lw = false, rw = false) =>
      h(
        'div',
        { class: 'compare-row' },
        h('p', { class: 'small' }, label),
        h(
          'div',
          { class: 'compare-cols' },
          h('span', { class: `mono${lw ? ' win' : ''}` }, lw ? `✓ ${left}` : left),
          h('span', { class: `mono${rw ? ' win' : ''}` }, rw ? `✓ ${right}` : right),
        ),
      );

    compareHost.append(
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'topbar' },
          h('span', { class: 'card-title' }, '并排对比'),
          h('span', { class: 'grow' }),
          h(
            'button',
            {
              class: 'text-btn',
              type: 'button',
              onClick: () => {
                selected = new Set();
                render();
              },
            },
            '收起',
          ),
        ),
        row('算法', a.title, b.title),
        row('年化收益率', a.primaryAnnual, b.primaryAnnual, aWin, bWin),
        row('摘要', a.subtitle, b.subtitle),
        a.note || b.note ? row('备注', a.note ?? '', b.note ?? '') : null,
      ),
    );
  }

  function render(): void {
    countLabel.textContent =
      summaries.length === 0 ? '暂无记录' : `共 ${summaries.length} 条 · 长按可对比`;
    clearBtn.style.display = summaries.length === 0 ? 'none' : '';

    clear(listEl);
    if (summaries.length === 0) {
      listEl.append(
        h(
          'div',
          { class: 'empty' },
          h('p', { class: 'h1' }, '🧾'),
          h('p', {}, '还没有记录，去算一笔'),
        ),
      );
    } else {
      const groups = new Map<string, RecordSummary[]>();
      for (const s of summaries) {
        const key = dayLabel(s.createdAt);
        const arr = groups.get(key) ?? [];
        arr.push(s);
        groups.set(key, arr);
      }
      for (const [day, rows] of groups) {
        listEl.append(h('p', { class: 'group-label' }, day));
        for (const r of rows) listEl.append(renderRow(r));
      }
    }
    renderCompare();
  }

  async function refresh(): Promise<void> {
    summaries = await deps.list();
    render();
  }

  return {
    el: root,
    /** 每次切到本页时调用：重新读数据 */
    async onEnter(): Promise<void> {
      await refresh();
    },
    /** 离开本页时收起已划开的删除按钮 */
    onLeave(): void {
      closeAllSwipes();
    },
    refresh,
  };
}
