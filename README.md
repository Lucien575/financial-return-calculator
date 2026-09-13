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

## 多尺寸适配

`e2e/responsive.spec.ts` 覆盖 320 / 360 / 412dp 与横屏（800×360），外加 320dp + 字号 200%。

断言两类布局事故：**横向溢出**，以及**键盘展开时正在编辑的那一行是否仍可见**。

> 第二条是补上的：最初只查了"没有横向溢出"，结果横屏（360px 高）下键盘占掉大半屏幕，
> 标题和输入卡全被挤出可视区，**用户看不见自己在输什么** —— 测试却是绿的。
> 现在的做法是键盘弹出时把当前行瞬时滚进视野，并在矮视口压缩键盘高度。

## 真机验收记录（安卓）

设备：**vivo X200s（V2458A）/ Android 16 / 1260×2800 / 360dp**。
用 `adb reverse tcp:4173 tcp:4173` 把本地构建推到手机 Chrome 上验证
（`localhost` 被浏览器视为安全上下文，所以 Service Worker 与安装判定都真实生效）。

| 项 | 结果 |
|---|---|
| 页面在真机 Chrome 正常渲染 | ✅ |
| Chrome 判定为**可安装**（弹出安装提示，图标正确） | ✅ —— 说明 manifest 有效、SW 已注册、满足可安装性条件 |
| **真实离线可用** | ✅ 直接杀掉本地服务器 + 开飞行模式 + 重载页面，App 仍完整加载 |
| 离线时 UI 仍可交互 | ✅ 校验提示正常显示（说明内核在离线状态下照常运行） |

**未完成**：WebAPK 的完整安装没有走完 —— Chrome 的 WebAPK 是**由 Google 服务器抓取 manifest 后签发的**，
而 `localhost` 那台服务器只有本机可达，所以必须等部署到公网 HTTPS 地址后才能验证真正的"添加到主屏幕"。
安装提示能够弹出，本身已经证明可安装性条件是满足的。

> 备注：`adb reverse` 走 USB，飞行模式挡不住它，所以"断网"是靠**杀掉本地服务器**来模拟的 ——
> 网络路径彻底不可达，只有 SW 缓存能救，这比飞行模式更严格。

## 视觉验收（截图逐页看过）

功能测试全绿 ≠ 界面是对的。每轮都会把各页面截图拼起来肉眼过一遍，也确实靠这个抓到过问题：

| 发现 | 问题 | 修法 |
|---|---|---|
| 横屏截图 | 键盘展开后输入行被挤出可视区，用户看不见自己在输什么（测试却是绿的） | 键盘弹出时把当前行瞬时滚进视野 + 矮视口压缩键盘 |
| 深色记录页截图 | 选中记录后整行泛红 —— 选中底色用了半透明的 `--highlight-bg`，**行底下的红色删除按钮透了上来** | 新增不透明的 `--highlight-surface` token |

已逐页确认：记录列表 / 备注 / 并排对比 / 设置页 / 安装横幅，浅色与深色各一遍。

## 存储不可用时的降级

IndexedDB 会失败：Safari 无痕模式、配额耗尽、用户禁用存储、企业策略。
`e2e/storage-failure.spec.ts` 用注入故障的方式验证了两条底线：

- **计算不受影响**（内核不依赖存储），结果照常算出
- **保存失败必须明说**（`保存失败：存储不可用`），不能抛出未处理异常让用户点完毫无反应
- **记录页显示错误态**，不能显示成「还没有记录」—— 那会让用户以为自己的记录丢了

> 这三条之前都没做：保存失败会变成未处理的 Promise 异常，记录页则静默显示成空列表。

## 线上地址

**https://lucien575.github.io/financial-return-calculator/**

已部署并验证：**整套 E2E（29 个）直接对着线上 HTTPS 地址跑，全部通过**。

## 部署

```bash
./scripts/deploy.sh <你的GitHub用户名>
```

脚本会依次做：本地校验（与 CI 同一套命令）→ 配 remote → 推送到 `main` → 打印后续步骤。

前置条件只有一个：**GitHub 上先建好公开仓库 `financial-return-calculator`**
（免费账号的 Pages 只对公开仓库开放）。

推送后 GitHub Actions 自动构建部署，约 1-2 分钟。线上地址：

```
https://<用户名>.github.io/financial-return-calculator/
```

### ⚠️ 一个实测踩到的坑

**不要给 `actions/configure-pages` 加 `enablement: true`。**
`GITHUB_TOKEN` 没有创建 Pages 站点的权限，加了会直接失败：

```
##[error]Create Pages site failed. Error: Resource not accessible by integration
```

Pages 必须由**仓库管理员**先开启一次，两种方式：

- 网页：仓库 → Settings → Pages → Build and deployment → Source 选 **GitHub Actions**
- 命令行（需要 admin 权限的 token）：
  ```bash
  curl -X POST -H "Authorization: Bearer <token>" \
    https://api.github.com/repos/<用户名>/financial-return-calculator/pages \
    -d '{"build_type":"workflow"}'
  ```

开启之后工作流里的 `configure-pages` 只需要读取配置，不再需要建站权限。

### 另一个坑：首次工作流可能长时间排队

新仓库第一次触发时，运行可能停在 `queued` 十几分钟不动。
取消后重新触发（`workflow_dispatch`）可以立刻把它顶出队列。

### 部署相关的几处约定

| 位置 | 值 | 说明 |
|---|---|---|
| `vite.config.ts` 的 `BASE_PATH` | `/financial-return-calculator/` | 必须与仓库名一致（Pages 的 URL 路径**区分大小写**） |
| `manifest.webmanifest` 的 `start_url` / `scope` / `icons[].src` | 同上 | 改仓库名要一起改 |
| `public/.nojekyll` | 空文件 | Pages 默认跑 Jekyll，会忽略下划线开头的文件 |
| SW 注册路径 | `${BASE_URL}sw.js` | SW 必须在部署根目录，作用域才够 |

## 记录量性能（实测）

记录页是把所有条目一次性渲染成 DOM，没有做虚拟化。实测确认这样够用：

| 记录数 | 页面渲染耗时 | DOM 节点 |
|---|---|---|
| 50 | 440ms | 535 |
| 200 | 437ms | 2,062 |
| 500 | 474ms | 5,118 |
| 1000 | 485ms | 10,210 |
| 2000 | 644ms | 20,394 |

约 440ms 是页面启动 + Service Worker 的固定开销，**列表本身 2000 条也只增加约 200ms**。
按真实使用频率（每月几笔，多年累计几百条）不需要虚拟化 —— 所以**故意不做**，避免为不会发生的场景增加复杂度。

## 可安装性审计（针对线上部署实测）

对着 https://lucien575.github.io/financial-return-calculator/ 逐项核对 Chrome 的安装判定要件：

| 要件 | 结果 |
|---|---|
| manifest 可访问、Content-Type 正确 | ✅ |
| name / short_name / display=standalone | ✅ |
| start_url 与 scope 一致且为 `/financial-return-calculator/` | ✅ |
| background_color / theme_color | ✅ |
| 192×192 图标（实际尺寸核对） | ✅ |
| 512×512 图标（WebAPK 必需，实际尺寸核对） | ✅ |
| maskable 图标 | ✅ |
| sw.js 可取且含 `fetch` 事件监听 | ✅ |
| SW 状态 = activated 且已接管页面 | ✅ |

**关于 `beforeinstallprompt`**：桌面版 Chrome 对该事件设有**用户参与度门槛**，自动化环境下不会累积到阈值，
所以脚本里测不到 —— 这是桌面端的预期行为，不是缺陷。安卓端不设这个门槛，
这也是为什么在 vivo X200s 上打开时安装横幅会立刻出现。

## 安卓真机验收记录（第二部分：安装）

设备：vivo X200s（V2458A）/ Android 16 / OriginOS。

**已验证通过的：**

| 项 | 证据 |
|---|---|
| 线上地址在真机 Chrome 正常渲染 | ✅ 截图确认 |
| **Chrome 判定为可安装** | ✅ Chrome 菜单出现「安装并创建快捷方式」，其下有「安装」与「创建快捷方式」两个选项 |
| 应用内安装横幅出现 | ✅ |
| Chrome 系统安装对话框弹出，名称与图标正确 | ✅ 显示「收益计算器」+ 蓝色计算器图标 + `lucien575.github.io` |
| 真实离线可用 | ✅ 杀掉服务器 + 飞行模式后页面仍完整加载 |

**根因已定位（第 15 轮补充）：**

点击系统对话框的「安装」后系统不生成 WebAPK，**原因是设备所在网络访问不了 Google 服务**：

```
ping www.google.com        → 100% packet loss
ping googleusercontent.com → 100% packet loss   ← WebAPK 签发服务器
ping play.google.com       → 100% packet loss
```

用设备浏览器打开 `google.com` 也是白屏。该设备是国内版 vivo + 国内运营商网络
（APN `3gnet`、DNS `114.114.114.114`）。

**机制**：Chrome 的「安装」分两步 —— 浏览器本地判定可安装性（这步通过了，所以对话框正常弹出），
然后向 **Google 的 WebAPK 签发服务器**请求生成并签名 APK，再由设备下载安装。
第二步依赖 Google 服务，网络不通就静默失败。

所以这是**网络环境限制，不是应用缺陷**。在能访问 Google 服务的网络下（或挂代理）重试即可完成安装。

> 补充：iOS 不走这条链路。iPhone 的「添加到主屏幕」完全在本地完成
> （读 `apple-touch-icon` + `apple-mobile-web-app-capable`），
> **不受 Google 服务不可达的影响**。

## 可安装性审计（针对线上部署实测）

对着 https://lucien575.github.io/financial-return-calculator/ 逐项核对 Chrome 的安装判定要件：

| 要件 | 结果 |
|---|---|
| manifest 可访问、Content-Type 正确 | ✅ |
| name / short_name / display=standalone | ✅ |
| start_url 与 scope 一致且为 `/financial-return-calculator/` | ✅ |
| background_color / theme_color | ✅ |
| 192×192 图标（实际尺寸核对） | ✅ |
| 512×512 图标（WebAPK 必需，实际尺寸核对） | ✅ |
| maskable 图标 | ✅ |
| sw.js 可取且含 `fetch` 事件监听 | ✅ |
| SW 状态 = activated 且已接管页面 | ✅ |

**关于 `beforeinstallprompt`**：桌面版 Chrome 对该事件设有**用户参与度门槛**，自动化环境下不会累积到阈值，
所以脚本里测不到 —— 这是桌面端的预期行为，不是缺陷。安卓端不设这个门槛，
这也是为什么在 vivo X200s 上打开时安装横幅会立刻出现。

## 安卓真机验收记录（第二部分：安装）

设备：vivo X200s（V2458A）/ Android 16 / OriginOS。

**已验证通过的：**

| 项 | 证据 |
|---|---|
| 线上地址在真机 Chrome 正常渲染 | ✅ 截图确认 |
| **Chrome 判定为可安装** | ✅ Chrome 菜单出现「安装并创建快捷方式」，其下有「安装」与「创建快捷方式」两个选项 |
| 应用内安装横幅出现 | ✅ |
| Chrome 系统安装对话框弹出，名称与图标正确 | ✅ 显示「收益计算器」+ 蓝色计算器图标 + `lucien575.github.io` |
| 真实离线可用 | ✅ 杀掉服务器 + 飞行模式后页面仍完整加载 |

**未完成的：**

点击系统对话框的「安装」后，**系统没有生成 WebAPK**（`pm list packages | grep webapk` 为空，
快捷方式表里也没有指向线上地址的条目；抓 logcat 也没有任何 WebAPK 相关日志）。

可能原因（尚未定位）：
- vivo OriginOS 对 WebAPK 安装的限制或后台管理策略
- 自动化点击（adb input tap）没有真正命中按钮
- Google 的 WebAPK 签发服务侧失败

**建议**：这一项请**手工试一次**（打开线上地址 → Chrome 菜单 → 安装并创建快捷方式 → 安装），
比自动化点击可靠。如果手工也装不上，多数是 OEM 限制，`创建快捷方式` 那条路径通常仍然可用。
