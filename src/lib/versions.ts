/** 版本分类筛选与愚人节版本识别（Mojang 清单把愚人节版也标为 snapshot） */

export type VersionCategory = 'all' | 'release' | 'snapshot' | 'april' | 'legacy';

export const VERSION_CATEGORIES: { key: VersionCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'release', label: '正式版' },
  { key: 'snapshot', label: '快照版' },
  { key: 'april', label: '愚人节版' },
  { key: 'legacy', label: '远古版' },
];

export const VERSION_CATEGORY_LABELS: Record<VersionCategory, string> = {
  all: '全部',
  release: '正式版',
  snapshot: '快照版',
  april: '愚人节版',
  legacy: '远古版',
};

const APRIL_FOOLS_VERSIONS = new Set([
  '15w14a',
  '1.rv-pre1',
  '3d shareware v1.34',
  '20w14infinite',
  '22w13oneblockatatime',
  '23w13a_or_b',
  '24w14potato',
  '25w14craftmine',
]);

export function versionCategory(
  id: string,
  type: string,
): Exclude<VersionCategory, 'all'> {
  if (APRIL_FOOLS_VERSIONS.has(id.toLowerCase())) return 'april';
  if (type === 'old_alpha' || type === 'old_beta') return 'legacy';
  if (type === 'snapshot') return 'snapshot';
  return 'release';
}
