import { h } from './dom';
import { icons } from './icons';
import { confirmDialog } from './dom';
import type { AppSettings, ThemeMode } from '../data/settings';

/**
 * 设置页。对应安卓版 SettingsScreen：
 * 主题三选一 / 清空数据 / 关于。
 */

export interface SettingsPageDeps {
  getSettings: () => AppSettings;
  setTheme: (mode: ThemeMode) => void;
  clearRecords: () => Promise<void>;
  onBack: () => void;
}

const THEME_OPTIONS: Array<[ThemeMode, string]> = [
  ['SYSTEM', '跟随系统'],
  ['LIGHT', '浅色'],
  ['DARK', '深色'],
];

export function createSettingsPage(deps: SettingsPageDeps) {
  const section = (title: string, ...children: (Node | null)[]) =>
    h(
      'div',
      { class: 'card' },
      h('p', { class: 'card-title', style: 'color:var(--text-secondary)' }, title),
      h('div', { style: 'margin-top:8px' }, ...children.filter(Boolean)),
    );

  const themeRows = THEME_OPTIONS.map(([mode, label]) => {
    const check = h('span', { class: 'check' }, '✓');
    const btn = h('button', { class: 'settings-row', type: 'button' }, label, check);
    btn.addEventListener('click', () => {
      deps.setTheme(mode);
      render();
    });
    return { mode, btn, check };
  });

  const clearBtn = h(
    'button',
    { class: 'settings-row', type: 'button', style: 'color:var(--loss)' },
    '清空所有历史记录',
  );
  clearBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('清空所有记录？', '删除后无法恢复。', '清空');
    if (ok) await deps.clearRecords();
  });

  const themeCard = section('主题', ...themeRows.map((r) => r.btn));
  const dataCard = section('数据', clearBtn);
  const aboutCard = section(
    '关于',
    h('p', {}, '版本 1.0'),
    h('p', { class: 'small', style: 'margin-top:4px' }, '本应用不会发起任何网络请求，全部计算在你的设备上完成，数据只存在本机。'),
    h('p', { class: 'small', style: 'margin-top:6px' }, '每次打开都是空白输入，不会带出上一次的数字；算完想留下就点「保存到记录」。'),
    h('p', { class: 'small', style: 'margin-top:6px' }, '小提示：在 iPhone 上用 Safari 的「分享 → 添加到主屏幕」，可以像 App 一样全屏打开，数据也更不容易被系统清理。'),
  );

  const backBtn = h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': '返回',
    html: icons.back(),
  });
  backBtn.addEventListener('click', () => deps.onBack());

  const topbar = h(
    'div',
    { class: 'topbar' },
    backBtn,
    h('span', { class: 'grow' }),
    h('span', { class: 'card-title' }, '设置'),
    h('span', { class: 'grow' }),
  );

  const body = h('div', { class: 'page-body stack' }, topbar, themeCard, dataCard, aboutCard);
  const root = h('div', { class: 'page' }, body);

  function render(): void {
    const s = deps.getSettings();
    for (const r of themeRows) {
      r.check.style.visibility = s.themeMode === r.mode ? 'visible' : 'hidden';
    }
  }

  render();
  return { el: root, onEnter: render };
}
