import { h, showSnackbar, haptic } from './ui/dom';
import { CalculatorStore } from './state/calculator-store';
import { createCalculatorPage } from './ui/calculator-page';
import { createRecordsPage } from './ui/records-page';
import { createSettingsPage } from './ui/settings-page';
import {
  addRecord,
  clearRecords,
  deleteRecord,
  listSummaries,
  requestPersistentStorage,
  setNote,
  toRecordRow,
} from './data/records';
import {
  applyTheme,
  loadSettings,
  saveThemeMode,
  type AppSettings,
  type ThemeMode,
} from './data/settings';
import { shareLongImage } from './share/long-image';
import { icons } from './ui/icons';

/**
 * 应用外壳：hash 路由 + 底部导航 + 三页装配。
 *
 * 用 hash 路由（#/records）而不是 history 路由：GitHub Pages 是纯静态托管，
 * 刷新子路由会 404，hash 路由完全绕开这个问题。
 */

type Route = 'calculator' | 'records' | 'settings';

function parseRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'records') return 'records';
  if (hash === 'settings') return 'settings';
  return 'calculator';
}

export function createApp(mount: HTMLElement) {
  let settings: AppSettings = loadSettings();
  applyTheme(settings.themeMode);

  const store = new CalculatorStore();

  const calculatorPage = createCalculatorPage(store, {
    onSave: async (input, result) => {
      try {
        await addRecord(toRecordRow(input, result, null, Date.now()));
      } catch {
        // 存储不可用时必须明确告诉用户，不能让他以为保存成功了
        showSnackbar('保存失败：存储不可用');
        return;
      }
      haptic();
      showSnackbar('已保存到记录');
    },
    onShare: async (input, result) => {
      try {
        const how = await shareLongImage(input, result);
        if (how === 'downloaded') showSnackbar('已保存长图到下载目录');
      } catch {
        showSnackbar('长图生成失败');
      }
    },
    onOpenSettings: () => navigate('settings'),
  });

  /** 包一层：存储类操作失败时给出提示，而不是抛出未处理的 Promise 异常 */
  const guard = <T>(fn: () => Promise<T>, failMessage: string) => async (): Promise<T | void> => {
    try {
      return await fn();
    } catch {
      showSnackbar(failMessage);
    }
  };

  const recordsPage = createRecordsPage({
    list: listSummaries,
    remove: (id) => guard(() => deleteRecord(id), '删除失败：存储不可用')(),
    setNote: (id, note) => guard(() => setNote(id, note), '备注保存失败')(),
    clearAll: () => guard(() => clearRecords(), '清空失败：存储不可用')(),
    onOpenSettings: () => navigate('settings'),
  });

  const settingsPage = createSettingsPage({
    getSettings: () => settings,
    setTheme: (mode: ThemeMode) => {
      settings = { ...settings, themeMode: mode };
      saveThemeMode(mode);
      applyTheme(mode);
    },
    clearRecords: async () => {
      try {
        await clearRecords();
      } catch {
        showSnackbar('清空失败：存储不可用');
        return;
      }
      showSnackbar('已清空所有记录');
    },
    onBack: () => navigate('calculator'),
  });

  // ---------- 底部导航 ----------
  const navCalc = h(
    'button',
    { type: 'button', html: `${icons.calc()}<span>计算器</span>` },
  );
  const navRecords = h(
    'button',
    { type: 'button', html: `${icons.history()}<span>记录</span>` },
  );
  navCalc.addEventListener('click', () => navigate('calculator'));
  navRecords.addEventListener('click', () => navigate('records'));
  const bottomNav = h('nav', { class: 'bottom-nav' }, navCalc, navRecords);

  // ---------- 路由 ----------
  let current: Route = 'calculator';

  function navigate(route: Route): void {
    if (location.hash !== `#/${route}`) {
      location.hash = `#/${route}`;
      return; // hashchange 会触发 render
    }
    render(route);
  }

  function render(route: Route): void {
    if (route !== 'calculator' && current === 'calculator') calculatorPage.resetLocalState();
    if (current === 'records' && route !== 'records') recordsPage.onLeave();
    current = route;

    const page =
      route === 'records' ? recordsPage.el : route === 'settings' ? settingsPage.el : calculatorPage.el;
    // 只替换中间那层，底部导航常驻在 shell 里 —— 之前用 replaceChildren 清空 mount
    // 会把导航一起删掉（Playwright 抓到的 bug）
    pageHost.replaceChildren(page);

    bottomNav.style.display = route === 'settings' ? 'none' : '';
    navCalc.setAttribute('aria-current', route === 'calculator' ? 'page' : 'false');
    navRecords.setAttribute('aria-current', route === 'records' ? 'page' : 'false');

    if (route === 'records') void recordsPage.onEnter();
    if (route === 'settings') settingsPage.onEnter();
  }

  const pageHost = h('div', { class: 'page-host' });
  mount.append(h('div', { class: 'app-shell' }, pageHost, bottomNav));

  window.addEventListener('hashchange', () => render(parseRoute()));
  render(parseRoute());

  // ---------- 从后台回来时清空输入 ----------
  // 与安卓版策略一致：离开 ≥5 分钟才清空；短暂切走（去查个数）保留，免得白填。
  const RESET_AFTER_MS = 5 * 60 * 1000;
  let backgroundedAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      backgroundedAt = Date.now();
    } else {
      const since = backgroundedAt;
      backgroundedAt = null;
      if (since !== null && Date.now() - since >= RESET_AFTER_MS) {
        store.clearAll();
        calculatorPage.resetLocalState();
        if (current !== 'calculator') navigate('calculator');
      }
    }
  });

  // 申请持久化存储：iOS 上不申请的话，系统可能回收脚本可写存储导致记录丢失
  void requestPersistentStorage();

  return { navigate };
}
