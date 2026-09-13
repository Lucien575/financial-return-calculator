import { h } from './dom';

/**
 * 新版本提示。
 *
 * sw.js 里刻意没有在 install 阶段调用 skipWaiting —— 那样会在用户正输入时
 * 静默把页面换成新版本，可能打断操作。正确做法是：新 SW 进入 waiting 后由页面提示，
 * 用户点了才 skipWaiting 并刷新。
 *
 * 之前只写了 SW 那一半、页面这一半漏了，结果新版本会一直卡在 waiting，
 * 直到所有客户端关闭才生效（桌面端开着标签页就可能长期停留在旧版）。
 */
export function setupUpdatePrompt(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  navigator.serviceWorker.ready
    .then((registration) => {
      const promptIfWaiting = () => {
        if (!registration.waiting || !navigator.serviceWorker.controller) return;

        const reload = () => {
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          });
          registration.waiting?.postMessage('SKIP_WAITING');
          banner.remove();
        };

        const banner = h(
          'div',
          { class: 'update-banner', role: 'status', 'aria-live': 'polite' },
          h('span', { class: 'update-text' }, '有新版本可用'),
          h('button', { class: 'update-btn', type: 'button', onClick: reload }, '立即更新'),
          h(
            'button',
            {
              class: 'update-close',
              type: 'button',
              'aria-label': '稍后再说',
              onClick: () => banner.remove(),
            },
            '×',
          ),
        );
        document.body.append(banner);
      };

      // 页面已打开之后才装好的新版本
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') promptIfWaiting();
        });
      });

      // 页面打开时就已有一个 waiting 的版本
      promptIfWaiting();
    })
    .catch(() => {
      /* 拿不到 registration 就算了，不影响使用 */
    });
}
