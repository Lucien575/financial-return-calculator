import { defineConfig } from 'vite';

// GitHub Pages 部署在子路径下：https://<user>.github.io/financial-return-calculator/
// 这个 base 必须与仓库名完全一致（Pages 的 URL 路径区分大小写），
// 并且要和 manifest 的 scope/start_url、Service Worker 的注册路径保持一致。
export const BASE_PATH = '/financial-return-calculator/';

export default defineConfig({
  base: BASE_PATH,
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
