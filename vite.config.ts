import { defineConfig, type Plugin } from 'vite';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 把构建产物清单注入 sw.js。
 *
 * 不这么做的话，预缓存列表里只有手工写的几个固定文件，而真正的 JS/CSS
 * 是按内容哈希命名的、要靠运行时惰性缓存 —— 首次安装后立刻断网会白屏。
 */
function injectSwManifest(): Plugin {
  return {
    name: 'inject-sw-manifest',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const swPath = join(dist, 'sw.js');
      if (!existsSync(swPath)) return;

      const assets: string[] = [];
      const assetDir = join(dist, 'assets');
      if (existsSync(assetDir)) {
        for (const f of readdirSync(assetDir)) assets.push(`./assets/${f}`);
      }
      const precache = [
        './',
        './index.html',
        './manifest.webmanifest',
        './icons/icon-192.png',
        './icons/icon-512.png',
        './icons/icon-maskable-512.png',
        './icons/apple-touch-icon.png',
        ...assets,
      ];

      // 构建号 = 产物内容哈希：产物一变，缓存名就变，旧缓存自动作废
      const buildId = createHash('sha256')
        .update(precache.join('|'))
        .update(readFileSync(join(dist, 'index.html')))
        .digest('hex')
        .slice(0, 12);

      let sw = readFileSync(swPath, 'utf-8');
      sw = sw.replace("'__BUILD_ID__'", JSON.stringify(buildId));
      sw = sw.replace("'__PRECACHE__'", JSON.stringify(precache, null, 2));
      writeFileSync(swPath, sw);
      console.log(`  sw.js 预缓存 ${precache.length} 项，构建号 ${buildId}`);
    },
  };
}

// GitHub Pages 部署在子路径下：https://<user>.github.io/financial-return-calculator/
// 这个 base 必须与仓库名完全一致（Pages 的 URL 路径区分大小写），
// 并且要和 manifest 的 scope/start_url、Service Worker 的注册路径保持一致。
export const BASE_PATH = '/financial-return-calculator/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [injectSwManifest()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
