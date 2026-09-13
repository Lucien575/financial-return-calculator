import './ui/theme.css';
import { createApp } from './app';

const mount = document.getElementById('app');
if (!mount) throw new Error('缺少 #app 挂载点');

createApp(mount);

// Service Worker：离线可用。开发环境不注册，避免缓存干扰调试。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // updateViaCache:'none' 缓解 GitHub Pages 无法自定义响应头导致的 SW 更新滞后
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .catch(() => {
        /* 注册失败不影响使用，只是没有离线能力 */
      });
  });
}
