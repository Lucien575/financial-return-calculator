/**
 * 设置持久化。对应安卓版的 DataStore（SettingsRepository.kt）。
 * 数据量极小，用 localStorage 足够；记录那种结构化数据走 IndexedDB。
 */

export type ThemeMode = 'SYSTEM' | 'LIGHT' | 'DARK';

export interface AppSettings {
  themeMode: ThemeMode;
  /** 最近一次计算的摘要，供后续可能的角标/小组件场景使用 */
  lastResultSummary: string | null;
}

const KEY_THEME = 'theme_mode';
const KEY_LAST = 'last_result_summary';

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'SYSTEM',
  lastResultSummary: null,
};

export function loadSettings(): AppSettings {
  try {
    const theme = localStorage.getItem(KEY_THEME);
    return {
      themeMode:
        theme === 'LIGHT' || theme === 'DARK' || theme === 'SYSTEM'
          ? theme
          : DEFAULT_SETTINGS.themeMode,
      lastResultSummary: localStorage.getItem(KEY_LAST),
    };
  } catch {
    // 隐私模式下 localStorage 可能直接抛异常，不能让整个 App 起不来
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(KEY_THEME, mode);
  } catch {
    /* 存不上就算了，本次会话仍然生效 */
  }
}

export function saveLastResultSummary(summary: string): void {
  try {
    localStorage.setItem(KEY_LAST, summary);
  } catch {
    /* 同上 */
  }
}

/** 把主题应用到 <html data-theme>。SYSTEM 时移除属性，交给 prefers-color-scheme。 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'SYSTEM') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode.toLowerCase());
}

/** 当前实际是不是深色（用于 canvas 之外的场景，如状态栏色）。 */
export function isDarkNow(mode: ThemeMode): boolean {
  if (mode === 'DARK') return true;
  if (mode === 'LIGHT') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}
