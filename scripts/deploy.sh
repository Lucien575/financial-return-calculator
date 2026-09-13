#!/bin/bash
# 一键部署到 GitHub Pages
#
# 用法: ./scripts/deploy.sh <github用户名> [仓库名]
#   例: ./scripts/deploy.sh zhangsan
#       ./scripts/deploy.sh zhangsan financial-return-calculator
#
# 前置条件：
#   1. GitHub 上已创建**公开**仓库 financial-return-calculator（免费账号 Pages 只对公开仓库开放）
#   2. git 能向该仓库推送（SSH key 或 HTTPS 凭据）
#
# 脚本做的事：本地校验 → 配 remote → 推送 → 打印后续步骤

set -euo pipefail

USER_NAME="${1:-}"
REPO="${2:-financial-return-calculator}"

if [ -z "$USER_NAME" ]; then
  echo "用法: $0 <github用户名> [仓库名]" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
echo "项目目录: $(pwd)"

echo
echo "=== 1/4 推送前本地校验（与 CI 跑的是同一套）==="
npx tsc --noEmit
(cd docs/reference && (sha256sum -c golden-values.sha256 2>/dev/null || shasum -a 256 -c golden-values.sha256))
npx vitest run
npx vite build

echo
echo "=== 2/4 配置远端 ==="
URL="git@github.com:${USER_NAME}/${REPO}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$URL"
else
  git remote add origin "$URL"
fi
git remote -v

echo
echo "=== 3/4 推送 ==="
git branch -M main
if ! git push -u origin main; then
  cat >&2 <<'MSG'

推送失败。常见原因：
  · 仓库还没建 —— 先去 https://github.com/new 建一个**公开**仓库，名字必须是 financial-return-calculator
  · 没有推送身份 —— 需要 SSH key 或 HTTPS 凭据。HTTPS 方式可改用：
      git remote set-url origin https://github.com/<用户名>/financial-return-calculator.git
    首次 push 会提示输入用户名与 Personal Access Token（不是账号密码）
MSG
  exit 1
fi

echo
echo "=== 4/4 完成，接下来 ==="
cat <<MSG
推送成功。GitHub Actions 会自动构建并部署（约 1-2 分钟）。

线上地址：https://${USER_NAME}.github.io/${REPO}/

如果 Actions 报「Pages is not enabled」，说明自动开启没生效，手动开一下：
  仓库 → Settings → Pages → Source 选「GitHub Actions」

部署完成后用手机验证：
  · 安卓 Chrome 打开 → 应弹出「安装到主屏幕」
  · iPhone 用 **Safari** 打开 → 分享 → 添加到主屏幕 → 从桌面图标打开应为全屏无地址栏
  · 断网后仍能打开并计算（离线可用）
MSG
