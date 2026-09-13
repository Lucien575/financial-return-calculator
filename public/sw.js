/**
 * Service Worker：让 App 完全离线可用。
 *
 * 本应用本身零网络请求，所以策略很简单：
 * 安装时预缓存整个 app shell，之后一律 cache-first，根本不需要访问网络。
 *
 * 更新策略：缓存名带版本号，新版本安装后进入 waiting 状态，
 * 由页面提示用户「有新版本」后 skipWaiting 生效 —— 不静默刷新，避免打断正在输入的人。
 */

// 下面两行由构建期注入（见 vite.config.ts 的 injectSwManifest 插件）。
// 构建产物是按内容哈希命名的，SW 作为静态文件在编写时拿不到这些名字，
// 只能等构建完成后再写进去 —— 否则首次安装后立刻断网会白屏（E2E 抓到的竞态）。
const VERSION = '__BUILD_ID__';
const CACHE = `frc-${VERSION}`;
const PRECACHE = '__PRECACHE__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // 逐个 add，任一资源缺失不至于让整次安装失败
      await Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
      );
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求：**network-first**，离线才回退缓存。
  //
  // 不能写成 cache-first：构建产物是按内容哈希命名的，重新部署后旧哈希文件会被删掉，
  // 而缓存里的旧 index.html 仍然引用着它们 —— 用户会加载到一个坏页面。
  // （这个坑是本地反复重构建时被 E2E 撞出来的。）
  if (req.mode === 'navigate') {
    const fromCache = () =>
      caches.match('./index.html').then((hit) => hit ?? Response.error());
    event.respondWith(
      fetch(req)
        .then((res) => {
          // 离线时 fetch 有时不抛异常、而是返回一个非 ok 的响应，
          // 只处理 reject 的话会把错误页直接交给浏览器（E2E 抓到的间歇性白屏）
          if (!res || !res.ok) return fromCache();
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(fromCache),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req)
          .then((res) => {
            // 同源静态资源顺手写进缓存
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => caches.match('./index.html')),
    ),
  );
});
