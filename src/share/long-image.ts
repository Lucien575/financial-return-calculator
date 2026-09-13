import { Decimal, amountWithUnit, nav as navFormat } from '../core/money-format';
import type { CalcInput, CalcResult } from '../core/calc-models';

/**
 * 结果长图。对应安卓版的 ShareImageRenderer.kt，尺寸与配色沿用同一套常量。
 *
 * 配色**固定用浅色版**，不管当前是不是深色模式 —— 分享到白底的聊天窗口里，
 * 深色图会非常突兀。这一点与安卓版行为一致。
 */

const WIDTH = 1080;
const PAD = 72;
const CARD_PAD = 56;
const RADIUS = 40;

const BG = '#f5f7fb';
const CARD = '#ffffff';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#64748b';
const GAIN = '#059669';
const LOSS = '#dc2626';
const PRIMARY = '#415fff';
const DIVIDER = 'rgba(15,23,42,0.078)';

const FONT_UI = `system-ui, -apple-system, 'PingFang SC', 'Noto Sans CJK SC', sans-serif`;
const FONT_MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

export interface ShareLines {
  title: string;
  inputs: string[];
  headline: string;
  metrics: Array<[string, string]>;
  steps: string[];
  footer: string;
}

export function buildShareLines(
  input: CalcInput,
  result: CalcResult,
  timestamp: string,
): ShareLines {
  const inputs =
    input.kind === 'amount'
      ? [
          `买入金额  ${amountWithUnit(new Decimal(input.buyAmount.trim()))}`,
          `持有收益  ${amountWithUnit(new Decimal(input.earnAmount.trim()))}`,
          `持有天数  ${result.days} 天`,
        ]
      : [
          `买入净值  ${navFormat(new Decimal(input.buyNav.trim()))}`,
          `当前净值  ${navFormat(new Decimal(input.currentNav.trim()))}`,
          `持有天数  ${result.days} 天`,
        ];

  return {
    title: result.mode === 'AMOUNT' ? '金额计算法' : '净值计算法',
    inputs,
    headline: result.primaryAnnual,
    metrics: result.metrics.map((m) => [m.label, m.value] as [string, string]),
    steps: result.steps,
    footer: `计算时间  ${timestamp}`,
  };
}

function draw(lines: ShareLines): HTMLCanvasElement {
  const inputBlock = lines.inputs.length * 62;
  const metricRows = Math.ceil(lines.metrics.length / 2);
  const metricBlock = metricRows * 96;
  const stepBlock = lines.steps.length * 52;

  const cardHeight =
    CARD_PAD +
    60 +
    56 +
    inputBlock +
    40 +
    150 +
    40 +
    metricBlock +
    32 +
    1 +
    32 +
    stepBlock +
    32 +
    50 +
    CARD_PAD;
  const height = Math.round(PAD + cardHeight + PAD);

  const canvas = document.createElement('canvas');
  // 2 倍超采样，保证在微信里放大看不糊
  const SCALE = 2;
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  const font = (size: number, weight = '400', mono = false) =>
    `${weight} ${size}px ${mono ? FONT_MONO : FONT_UI}`;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, height);

  // 卡片
  const cardX = PAD;
  const cardY = PAD;
  const cardW = WIDTH - PAD * 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardHeight, RADIUS);
  ctx.fillStyle = CARD;
  ctx.fill();

  const left = PAD + CARD_PAD;
  const right = WIDTH - PAD - CARD_PAD;
  let y = PAD + CARD_PAD + 40;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = font(40, '700');
  ctx.fillText('年化收益计算器', left, y);

  y += 56;
  ctx.fillStyle = PRIMARY;
  ctx.font = font(34, '700');
  ctx.fillText(lines.title, left, y);

  y += 30;
  ctx.strokeStyle = DIVIDER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  y += 44;
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = font(36, '400', true);
  for (const line of lines.inputs) {
    ctx.fillText(line, left, y);
    y += 62;
  }

  y += 24;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font(34);
  ctx.fillText('折合年化收益率', left, y);

  y += 120;
  ctx.fillStyle = lines.headline.startsWith('-') ? LOSS : GAIN;
  ctx.font = font(120, '700', true);
  ctx.fillText(lines.headline, left, y);

  y += 46;
  ctx.strokeStyle = DIVIDER;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  y += 40;
  const colWidth = (right - left) / 2;
  lines.metrics.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = left + col * colWidth;
    const rowY = y + row * 96;
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = font(28);
    ctx.fillText(label, x, rowY);
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = font(38, '700', true);
    ctx.fillText(value, x, rowY + 46);
  });
  y += metricBlock + 24;

  if (lines.steps.length > 0) {
    ctx.strokeStyle = DIVIDER;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    y += 44;
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = font(28, '400', true);
    for (const step of lines.steps) {
      ctx.fillText(step, left, y);
      y += 52;
    }
  }

  y += 34;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font(28);
  ctx.fillText(lines.footer, left, y);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('长图生成失败'))), 'image/png');
  });
}

export function shareTimestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 生成并分享长图。
 *
 * 优先走 Web Share Level 2（可带文件）—— 安卓 Chrome 与 iOS Safari 15+ 都支持。
 * 不支持时退化为下载，用户仍能拿到图。
 */
export async function shareLongImage(
  input: CalcInput,
  result: CalcResult,
): Promise<'shared' | 'downloaded'> {
  const lines = buildShareLines(input, result, shareTimestamp());
  const canvas = draw(lines);
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], 'annualized-result.png', { type: 'image/png' });

  const canShareFiles =
    typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  if (typeof navigator.share === 'function' && canShareFiles) {
    try {
      await navigator.share({ files: [file], title: '年化收益计算结果' });
      return 'shared';
    } catch (err) {
      // 用户主动取消不算失败，静默返回
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
      // 其它错误继续走下载兜底
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `年化收益-${shareTimestamp().replace(/[: ]/g, '-')}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
