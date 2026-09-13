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

CI 通过 `docs/reference/golden-values.sha256` 强制校验；改动 fixture 必须显式更新该文件。

> 说明：安卓侧的测试读的是 `original-web-golden-values.tsv`（同源、同一次抓取），
> 本侧读 JSON。两者由同一个脚本从 TSV 规范化而来，字节内容已用哈希锁定。
> 安卓项目按约定不做任何代码改动，因此那边没有对应的自动校验。

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

## 验收清单（真机）

自动化能覆盖的部分见 `npm run verify`。以下几项**必须真机人工确认**，
因为它们要么依赖具体设备行为，要么在 headless 环境下不可靠：

| 项 | 为什么不能自动化 | 怎么测 |
|---|---|---|
| 真实离线使用 | headless 下 Playwright 的 `setOffline` 与 Service Worker 组合不稳（实测约 40% 失败率，3 次重试也不通过）。CI 只断言"离线所需的资源都已缓存" | 装到主屏幕 → 开飞行模式 → 打开 App，应能计算、看记录 |
| iOS 系统日期滚轮 | 只有真机 Safari 才有；这是方案里标记为"最需要真机确认"的一点 | iPhone 上点「买入日期」，确认滚轮正常弹出、确定后日期写回 |
| iOS 添加到主屏幕 | 无 `beforeinstallprompt`，入口在分享菜单里 | Safari → 分享 → 添加到主屏幕 → 从桌面图标打开应为全屏无地址栏 |
| iOS 存储是否被回收 | 平台行为，无法本地模拟 | 装到主屏幕后放置数天再打开，确认记录还在 |
| 安卓安装引导 | `beforeinstallprompt` 只在真实 Chrome 里触发 | 安卓 Chrome 打开，确认出现「安装到主屏幕」横幅 |
| 全程零联网 | CI 已断言无外部请求；真机可再确认一次 | 抓包或看飞行模式下是否一切正常 |

## 无障碍

`e2e/a11y.spec.ts` 用 axe-core 做 WCAG 2.1 A/AA 回归，覆盖计算器（空态 / 有结果 / 键盘展开）、记录页、设置页、深色模式，
外加触控目标尺寸与可访问名称两项断言。

首轮审计发现并修复了 4 处真实违规：

| 问题 | 后果 | 修法 |
|---|---|---|
| `user-scalable=no` | 用户无法缩放页面，违反 WCAG 1.4.4 | 允许缩放；iOS 聚焦放大改用输入框字号 ≥16px 避免 |
| 日期行是 `<button>` 里嵌 `<input type="date">` | 嵌套交互控件，读屏软件行为不可预期 | 日期行改用 `div` 承载，交互交给原生 input |
| `--text-secondary` 对比度 4.44:1 | 正文差 0.06 不达标 | 压暗到 `#5f6e84`（4.83:1） |
| `--gain` 对比度 3.77:1 | 结果卡与记录页的绿色数字（17px 正文）不达标 | 换成 `#047857`（5.48:1） |
| 分段控件高 40px | 低于 44px 触控目标 | 改为 44px |

> 后两项改的是颜色 token，因此 **PWA 与安卓原生版此处有极小色差**。
> 安卓项目按约定冻结，未跟进；差异是「可读性达标」换来的，肉眼几乎无感。

## 键盘上的 ± 键（与安卓版的一处有意差异）

原生版的数字键盘是 `7 8 9 DEL / 4 5 6 C / 1 2 3 +1000 / 0 . x2 DONE`，
**没有负号键**。但输入提示写的是「已获得的收益金额，亏损填负数」——
也就是说用户被要求填负数，却根本敲不出来，**亏损这条路径在原生版 UI 上不可达**
（内核和单测都支持负数，只是界面到不了）。

PWA 版把 `x2`（一键翻倍，纯便捷）换成了 `±`（取反）。这是与原生版唯一的键盘差异，
取舍理由：能填亏损是必需功能，一键翻倍只是锦上添花。

> 原生版按约定冻结未改动。如果之后要动它，建议同样把 `x2` 换成 `±`。

## 新版本如何生效

`sw.js` **刻意不在 `install` 阶段调用 `skipWaiting`** —— 那会在用户正输入时静默换页。
流程是：新 SW 装好后进入 `waiting`，页面弹出「有新版本可用」，用户点了才
`SKIP_WAITING` → `controllerchange` → 刷新。

已端到端验证：改动 `sw.js` 触发真实更新 → 提示条出现 → 点击后新 SW 接管。

> 缓存名带构建号，所以新版本一激活，旧缓存自动作废，
> 不会出现「旧 shell 引用已删除资源」的坏页面。
