export interface AccentPreset {
  id: string;
  label: string;
  value: string;
}

/** 预设色板：刻意保持高明度、低饱和，玻璃材质下高饱和会显廉价 */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'blue', label: '雾蓝', value: '#9aafff' },
  { id: 'cyan', label: '冰川', value: '#8de2eb' },
  { id: 'mint', label: '薄荷', value: '#8bd9bd' },
  { id: 'violet', label: '紫藤', value: '#c0a8ff' },
  { id: 'rose', label: '藕粉', value: '#f3a9c0' },
  { id: 'amber', label: '暖沙', value: '#f0c894' },
  { id: 'mono', label: '石墨', value: '#d5dce8' },
];

export const FALLBACK_ACCENT = ACCENT_PRESETS[0].value;

/** 旧版本只存过语义 id，需要映射到具体色值 */
const LEGACY_ACCENTS: Record<string, string> = {
  blue: '#9aafff',
  cyan: '#8de2eb',
  mono: '#d5dce8',
};

/** 默认材质强度（0-100，越高越通透） */
export const DEFAULT_GLASS_STRENGTH = 60;

/** 材质强度各端点的透明度：磨砂端（不透明）与通透端（最透） */
const GLASS_OPAQUE = { shellTop: 0.88, shellBottom: 0.94, panel: 1.25, scrim: 0.28 };
const GLASS_CLEAR = { shellTop: 0.32, shellBottom: 0.4, panel: 0.68, scrim: 0.05 };

/** 读取持久化设置里的材质强度，非法值回落到默认 */
export function normalizeGlassStrength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_GLASS_STRENGTH;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * 材质强度 → 玻璃各层透明度（连续值，由设置页滑块驱动）。
 *
 * 高斯模糊来自系统 DWM（blur-behind），页面只负责「着色层」：
 * 滑块改变的是着色层厚度 —— 越高越通透，桌面透出越多。
 * 关闭时直接把外壳铺成不透明，避免实体底淡入期间漏出画面。
 * 注意：index.html 的启动脚本内联了同一份映射，两处需同步修改。
 */
export function applyGlassStrength(strength: number, enabled: boolean) {
  const root = document.documentElement;
  root.dataset.glass = enabled ? 'on' : 'off';
  if (!enabled) {
    root.style.setProperty('--shell-alpha-top', '1');
    root.style.setProperty('--shell-alpha-bottom', '1');
    return;
  }
  const t = normalizeGlassStrength(strength) / 100;
  const mix = (opaque: number, clear: number) => (opaque + (clear - opaque) * t).toFixed(3);
  root.style.setProperty('--shell-alpha-top', mix(GLASS_OPAQUE.shellTop, GLASS_CLEAR.shellTop));
  root.style.setProperty('--shell-alpha-bottom', mix(GLASS_OPAQUE.shellBottom, GLASS_CLEAR.shellBottom));
  root.style.setProperty('--panel-alpha', mix(GLASS_OPAQUE.panel, GLASS_CLEAR.panel));
  root.style.setProperty('--scrim-alpha', mix(GLASS_OPAQUE.scrim, GLASS_CLEAR.scrim));
}

export function normalizeAccent(value: unknown): string {
  if (typeof value !== 'string') return FALLBACK_ACCENT;
  const raw = value.trim();
  if (LEGACY_ACCENTS[raw]) return LEGACY_ACCENTS[raw];
  const hex = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#([\da-f]{3}|[\da-f]{6})$/i.test(hex) ? expand(hex).toLowerCase() : FALLBACK_ACCENT;
}

export function presetOf(hex: string): AccentPreset | undefined {
  return ACCENT_PRESETS.find((preset) => preset.value.toLowerCase() === hex.toLowerCase());
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = expand(normalizeAccent(hex)).slice(1);
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

/** 主按钮压在强调色上，亮色配深墨、暗色配白字 */
export function inkFor(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.42 ? '#0c1119' : '#f7f9ff';
}

/** 光晕用的加深色，保持与强调色同相 */
export function shade(hex: string, amount = 0.24): string {
  const [r, g, b] = hexToRgb(hex);
  const to = (channel: number) => Math.round(channel * (1 - amount)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function expand(hex: string): string {
  if (hex.length !== 4) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

export function applyAccent(hex: string) {
  const accent = normalizeAccent(hex);
  const [r, g, b] = hexToRgb(accent);
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--accent-strong', shade(accent));
  root.style.setProperty('--accent-ink', inkFor(accent));
  root.dataset.accent = presetOf(accent)?.id ?? 'custom';
}
