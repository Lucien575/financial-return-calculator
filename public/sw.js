/**
 * Service Worker：让 App 完全离线可用。
 *
 * 本应用本身零网络请求，所以策略很简单：
 * 安装时预缓存整个 app shell，之后一律 cache-first，根本不需要访问网络。
 *
 * 更新策略：缓存名带版本号，新版本安装后进入 waiting 状态，
 * 由页面提示用户「有新版本」后 skipWaiting 生效 —— 不静默刷新，避免打断正在输入的人。
 */

const VERSION = 'v1';
const CACHE = `frc-${VERSION}`;

// 相对路径：SW 部署在 /financial-return-calculator/ 下，用相对路径避免子路径写死
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

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

  // 导航请求：优先用缓存的 index.html，保证离线也能进 App
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((hit) => hit ?? fetch(req)),
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
