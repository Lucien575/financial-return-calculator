import { h } from './dom';
import { icons } from './icons';

/**
 * 安装引导。
 *
 * - 安卓 Chrome：有 `beforeinstallprompt`，可以一键安装，做一条横幅
 * - iOS Safari：**没有**这个事件，入口藏在「分享 → 添加到主屏幕」里，
 *   很多用户根本找不到，所以必须给图文引导
 * - 已经装过（standalone）就不再提示
 * - 用户关掉后一段时间内不再打扰
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'install_banner_dismissed_at';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 关掉后 7 天内不再提示

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari 专有属性
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ 的 UA 伪装成 macOS，用触摸点数补判
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

function snoozed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

function snooze(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* 存不上就算了，大不了下次还提示 */
  }
}

function banner(content: Node[], onClose?: () => void) {
  const el = h(
    'div',
    { class: 'install-banner', role: 'complementary' },
    h('div', { class: 'install-body' }, ...content),
    h(
      'button',
      {
        class: 'install-close',
        type: 'button',
        'aria-label': '关闭',
        onClick: () => {
          snooze();
          el.remove();
          onClose?.();
        },
      },
      '×',
    ),
  );
  return el;
}

export function setupInstallPrompt(): void {
  if (isStandalone()) return;
  if (snoozed()) return;

  let deferred: BeforeInstallPromptEvent | null = null;
  let shown = false;

  const showAndroid = () => {
    if (shown || !deferred) return;
    shown = true;
    const btn = h('button', { class: 'btn btn-primary install-btn', type: 'button' }, '安装到主屏幕');
    btn.addEventListener('click', async () => {
      if (!deferred) return;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') el.remove();
    });
    const el = banner([
      h('p', { class: 'install-title' }, '安装到主屏幕'),
      h('p', { class: 'small' }, '装好后可以像 App 一样全屏打开，也能离线使用。'),
      btn,
    ]);
    document.body.append(el);
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    showAndroid();
  });

  // iOS 没有安装事件，只能靠 UA 判断后给图文引导
  if (isIos()) {
    setTimeout(() => {
      if (shown) return;
      shown = true;
      const el = banner([
        h('p', { class: 'install-title' }, '添加到主屏幕'),
        h(
          'p',
          { class: 'small' },
          '点底部的分享按钮，再选「添加到主屏幕」，就能像 App 一样全屏打开。',
        ),
        h('p', { class: 'small install-hint' }, '这样数据也更不容易被系统清理。'),
      ]);
      document.body.append(el);
    }, 1500);
  }
}

/** 供设置页引用的说明图标（保持与横幅一致的视觉语言）。 */
export const installIcon = icons.calc;
