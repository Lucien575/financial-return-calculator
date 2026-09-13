# 收益计算器 · PWA

理财年化收益计算器的 PWA 版，**安卓 / iPhone / 桌面浏览器通用**。
与安卓原生版（`finance_calc_app/`）是两个独立项目，计算内核行为保持一致。

线上地址：`https://<用户名>.github.io/financial-return-calculator/`

## 特点

- **零网络请求**：不申请任何权限，全部计算在本机完成，数据只存在本机
- **可离线**：Service Worker 预缓存，装完就永远能用
- **可安装**：安卓 Chrome 一键安装；iPhone 用 Safari「分享 → 添加到主屏幕」
- 与安卓版**逐位一致**的计算结果（见下）

## 开发

```bash
npm install
npm run dev      # 开发服务器
npm test         # 单元测试（含原网页逐位比对）
npm run typecheck
npm run build    # 产物在 dist/
```

> **关于 node_modules 的位置**
> 本机 `~/Desktop` 开启了 iCloud 同步，而 `node_modules` 有几万个文件，
> 放在同步目录里会产生 iCloud 冲突副本、把构建搞坏（安卓项目已经踩过一次）。
> 因此项目实体放在 `~/Developer/financial-return-calculator`，
> 工作区里是一个指向它的符号链接。**两者是同一个目录，正常使用无差异。**

## 数值一致性（最重要的一条约束）

`docs/reference/golden-values.json` 里 15 组期望值**不是手算的**，
而是把存档的原版网页计算器放进无头 Chrome、真实调用它自己的计算函数后从 DOM 抓下来的。

这份文件同时被安卓版和本项目的测试读取：

| 项目 | 测试 |
|---|---|
| 安卓 | `OriginalWebParityTest.kt` |
| PWA | `tests/original-web-parity.spec.ts` |

**改动计算逻辑时，两端必须同步并保持这份 fixture 不变**；否则 CI 会红。
这是「安卓和 iPhone 算出来一模一样」的唯一可验证保障。

### 移植时对齐的精度语义

安卓版内核不是纯 double：金额/净值用 `BigDecimal`（除法 scale=16、HALF_UP），幂运算用 `Math.pow`。
本项目用 `decimal.js` 逐条对齐：

| Kotlin | TypeScript |
|---|---|
| `divide(x, 16, HALF_UP)` | `.div(x).toDecimalPlaces(16, ROUND_HALF_UP)` |
| `Math.pow(1+rate, 365/days) - 1` | 原样 double（IEEE754 两端一致） |
| `setScale(2/8, HALF_UP)` | `.toDecimalPlaces(2/8, ROUND_HALF_UP)` |
| `doublePercent`：`BigDecimal(v*100)` 后 HALF_UP | `(v * 100).toFixed(2)` —— JS 原生就是这个语义 |
| `LocalDate.toEpochDay()` 差值 | `Date.UTC()` 毫秒差 ÷ 86400000（全程 UTC） |

### 已知且有意保留的极端输入差异

只可能由荒谬输入触发，不可能真实出现：

| 场景 | 安卓版 | PWA |
|---|---|---|
| 幂运算上溢 | `+∞%` | `+∞%`（一致） |
| NaN | `无法计算` | `无法计算`（一致） |
| 百分比 ≥ 1e21 | 打印完整数字 | ECMA-262 规定 `toFixed` 退化为指数形式 |

## 与安卓原生版的取舍

| 项 | 说明 |
|---|---|
| 桌面小组件 | **PWA 做不到**，平台不向 Web App 开放组件 API。需要小组件的用户继续用安卓原生包 |
| 触觉反馈 | 安卓有；iOS Safari 不实现 `navigator.vibrate`，静默降级 |
| 日期选择器 | 用系统原生控件（iOS 滚轮 / 安卓日历），**两平台长相不同**，这是有意的：无障碍与用户习惯优先 |
| 字体 | 各平台系统字体，字形必然与安卓版不同 |

## 目录

```
src/
├─ core/        纯 TS 计算内核，零 DOM 依赖，可单测
├─ data/        IndexedDB（记录）/ localStorage（设置）
├─ state/       计算器状态（对应安卓版 ViewModel）
├─ ui/          三个页面 + 组件 + 设计 token
├─ share/       结果长图（Canvas + Web Share）
└─ app.ts       外壳：hash 路由 + 底部导航
public/         manifest + Service Worker + 图标
tests/          Vitest
docs/reference/ 黄金值 fixture（与安卓版共享）
```

## 部署

推送到 `main` 即由 GitHub Actions 自动发布到 GitHub Pages。
Pages 在子路径下，因此以下几处必须与仓库名一致（改动要一起改）：

- `vite.config.ts` 的 `BASE_PATH`
- `public/manifest.webmanifest` 的 `start_url` / `scope` / `icons[].src`
- `manifest.webmanifest` 本身的引用路径
