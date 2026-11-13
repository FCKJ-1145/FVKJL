import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  FileCheck2,
  Heart,
  Loader2,
  MonitorPlay,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tags,
  X,
} from 'lucide-react';
import { formatTime, launcher, loaderLabel, toErrorMessage } from '../lib/launcher';
import { Select } from './Select';
import type {
  InstanceInfo,
  ProjectDocument,
  ReleaseChannel,
  ResourceFavorite,
  ResourceRelease,
  ResourceSearchExpression,
  ResourceSearchResult,
  ResourceSearchSort,
  ResourceSelectionRelease,
  ResourceSource,
  ResourceTarget,
  ResourceType,
  SourceProjectMetadata,
  ToastMessage,
} from '../types';

interface DiscoverViewProps {
  instances: InstanceInfo[];
  selectedId: string;
  notify: (title: string, detail?: string, kind?: ToastMessage['kind']) => void;
  /** 无实例时跳转实例库 */
  onOpenInstances: () => void;
  /** 安装成功后刷新下载任务；传入指定版本则装指定版本，不传则由目标后端自动挑选 */
  onInstall: (meta: SourceProjectMetadata, release?: ResourceSelectionRelease, instanceId?: string) => Promise<void>;
  /** 后端是否已初始化完成，仅桌面 Tauri 模式需要等待 */
  backendReady?: boolean;
}

interface CategoryTab {
  id: string;
  label: string;
  types: ResourceType[];
}

const CATEGORY_TABS: CategoryTab[] = [
  { id: 'modpack', label: '整合包', types: ['modPack'] },
  { id: 'mod', label: '模组', types: ['mod'] },
  { id: 'resourcepack', label: '资源包', types: ['resourcePack'] },
  { id: 'datapack', label: '数据包', types: ['dataPack'] },
  { id: 'shader', label: '光影包', types: ['shader'] },
];

const FAVORITES_TAB: CategoryTab = { id: 'favorites', label: '收藏夹', types: [] };

const CATEGORY_OPTIONS: { slug: string; label: string }[] = [
  { slug: 'multiplayer', label: '多人' },
  { slug: 'technology', label: '科技' },
  { slug: 'adventure', label: '冒险' },
  { slug: 'magic', label: '魔法' },
  { slug: 'lightweight', label: '轻量' },
  { slug: 'quests', label: '任务' },
  { slug: 'storage', label: '存储' },
  { slug: 'challenge', label: '挑战' },
  { slug: 'optimization', label: '优化' },
  { slug: 'combat', label: '战斗' },
  { slug: 'decoration', label: '装饰' },
  { slug: 'worldgen', label: '世界生成' },
  { slug: 'utility', label: '实用' },
  { slug: 'realistic', label: '写实' },
  { slug: 'fantasy', label: '幻想' },
];

const GAME_VERSIONS = ['1.21.4', '1.21.1', '1.21', '1.20.6', '1.20.1', '1.19.2', '1.18.2', '1.16.5'];
const LOADERS = ['fabric', 'neoforge', 'forge', 'quilt'];
const LICENSES = ['MIT', 'Apache-2.0', 'LGPL-3.0', 'GPL-3.0', 'ARR'];

const SORT_OPTIONS: { value: ResourceSearchSort; label: string }[] = [
  { value: 'relevance', label: '相关性' },
  { value: 'downloads', label: '下载量' },
  { value: 'followers', label: '关注量' },
  { value: 'projectPublished', label: '最近发布' },
];

const PAGE_SIZES = [20, 40, 60];

function formatCount(value: number | null | undefined): string {
  if (value == null) return '未知';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function sourceLabel(source: string): string {
  if (source === 'modrinth') return 'Modrinth';
  if (source === 'curseforge') return 'CurseForge';
  if (source === 'mcarchive') return 'MCArchive';
  return source;
}

function resourceTypeLabel(type: ResourceType): string {
  switch (type) {
    case 'modPack': return '整合包';
    case 'mod': return '模组';
    case 'resourcePack': return '资源包';
    case 'dataPack': return '数据包';
    case 'shader': return '光影包';
    case 'world': return '地图';
    default: return '插件';
  }
}

function channelLabel(channel: ReleaseChannel | undefined | null): string {
  switch (channel) {
    case 'release': return '正式版';
    case 'beta': return '测试版';
    case 'alpha': return '预览版';
    case 'unknown': return '未知';
    default: return '未知';
  }
}

function channelClass(channel: ReleaseChannel | undefined | null): string {
  switch (channel) {
    case 'release': return 'channel-release';
    case 'beta': return 'channel-beta';
    case 'alpha': return 'channel-alpha';
    default: return 'channel-other';
  }
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export const DiscoverView = memo(function DiscoverView({ instances, selectedId, notify, onOpenInstances, onInstall, backendReady = true }: DiscoverViewProps) {
  const [sources, setSources] = useState<ResourceSource[]>([]);
  const [sourceError, setSourceError] = useState('');
  const [tab, setTab] = useState('modpack');
  const [text, setText] = useState('');
  const [debouncedText, setDebouncedText] = useState('');
  const [sort, setSort] = useState<ResourceSearchSort>('relevance');
  const [pageSize, setPageSize] = useState(20);
  /** 每页起始游标（索引 0 恒为 null）；通过 ref 更新避免触发重复请求 */
  const pageCursors = useRef<(string | null)[]>([null]);
  /** 已加载过的页面结果：后端游标按会话只保留最新一条，返回上一页时直接用缓存回填，避免再拿已失效的游标去请求 */
  const pageCache = useRef<Map<number, { entries: ResourceSearchResult[]; hasMore: boolean; total: number | null }>>(new Map());
  const [pageIndex, setPageIndex] = useState(0);
  const [results, setResults] = useState<ResourceSearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [environments, setEnvironments] = useState<string[]>([]);
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [loaders, setLoaders] = useState<string[]>([]);
  const [licenses, setLicenses] = useState<string[]>([]);
  const [openSourceOnly, setOpenSourceOnly] = useState(false);
  const [translate, setTranslate] = useState(true);
  const [favorites, setFavorites] = useState<ResourceFavorite[]>([]);
  const [favoriteResults, setFavoriteResults] = useState<SourceProjectMetadata[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [detail, setDetail] = useState<{ meta: SourceProjectMetadata; doc: ProjectDocument | null; loading: boolean; tab: 'description' | 'releases' } | null>(null);
  const [detailReleases, setDetailReleases] = useState<ResourceRelease[]>([]);
  const [detailReleasesLoading, setDetailReleasesLoading] = useState(false);
  const [installTargetFor, setInstallTargetFor] = useState<{ meta: SourceProjectMetadata; release?: ResourceRelease; instanceId: string } | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const activeRequest = useRef<string | null>(null);

  /** 徽章优先显示 Modrinth（内容主源）；源选择交给后端，见 runSearch 中 sources: [] */
  const activeSource = sources.find((source) => source.id === 'modrinth') ?? sources.find((source) => source.available) ?? null;
  const onFavoritesTab = tab === 'favorites';
  const activeTab = CATEGORY_TABS.find((item) => item.id === tab) ?? FAVORITES_TAB;
  const selectedInstance = instances.find((item) => item.id === selectedId) ?? instances[0] ?? null;

  const resetPaging = useCallback(() => {
    pageCursors.current = [null];
    pageCache.current.clear();
    setPageIndex(0);
  }, []);

  // 数据源发现：等待后端就绪后才调用，避免 State 未初始化时的竞态
  useEffect(() => {
    if (!backendReady) return;
    let active = true;
    void (async () => {
      try {
        const list = await launcher.discoverSources();
        if (!active) return;
        setSources(list);
        setSourceError('');
        if (!list.some((source) => source.available)) {
          setSourceError('当前数据源不可用，请检查网络后重试。');
        }
      } catch (err) {
        if (!active) return;
        console.error('[DiscoverView] discoverSources failed:', err);
        setSourceError(toErrorMessage(err));
      }
    })();
    return () => { active = false; };
  }, [backendReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedText(text);
      // 关键词变化后回到第一页，否则会拿旧游标查询导致空结果
      resetPaging();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [text, resetPaging]);

  const reloadFavorites = useCallback(async () => {
    setFavoritesLoading(true);
    try {
      const list = await launcher.discoverFavorites();
      setFavorites(list);
      const metas = await Promise.all(
        list.slice(0, 40).map((favorite) => launcher.discoverProject(favorite.project, favorite.locator).then((doc) => doc.metadata).catch(() => null)),
      );
      setFavoriteResults(metas.filter((meta): meta is SourceProjectMetadata => Boolean(meta)));
    } catch (err) {
      notify('读取收藏夹失败', toErrorMessage(err), 'error');
    } finally {
      setFavoritesLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!backendReady) return;
    if (onFavoritesTab) void reloadFavorites();
  }, [backendReady, onFavoritesTab, reloadFavorites]);

  const buildFilter = useCallback((): ResourceSearchExpression | null => {
    const terms: ResourceSearchExpression[] = [];
    if (environments.length > 0) terms.push({ kind: 'predicate', field: 'environment', values: environments, excluded: false });
    if (licenses.length > 0) terms.push({ kind: 'predicate', field: 'license', values: licenses, excluded: false });
    if (openSourceOnly) terms.push({ kind: 'predicate', field: 'openSource', values: ['true'], excluded: false });
    return terms.length === 0 ? null : { kind: 'all', terms };
  }, [environments, licenses, openSourceOnly]);

  const runSearch = useCallback(async () => {
    if (onFavoritesTab) return;
    const cached = pageCache.current.get(pageIndex);
    if (cached) {
      setResults(cached.entries);
      setHasMore(cached.hasMore);
      setTotal(cached.total);
      setError('');
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    const requestId = `discover-${seq}-${Date.now()}`;
    activeRequest.current = requestId;
    const cursor = pageCursors.current[pageIndex] ?? null;
    setLoading(true);
    setError('');
    try {
      const page = await launcher.discoverSearch({
        filter: buildFilter(),
        text: debouncedText,
        types: activeTab.types,
        // 空数组 = 后端自动选择所有可用且适用的数据源（按已读 search.rs 的过滤链）
        sources: [],
        target: { gameVersions, loaders, channels: ['release'] },
        categories: selectedCategories,
        sort,
        pageSize,
        translate,
      }, cursor, requestId);
      if (seq !== requestSeq.current) return;
      pageCursors.current[pageIndex + 1] = page.cursor;
      pageCache.current.set(pageIndex, { entries: page.entries, hasMore: page.hasMore, total: page.total.value ?? null });
      setResults(page.entries);
      setHasMore(page.hasMore);
      setTotal(page.total.value);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error('[DiscoverView] runSearch failed:', err);
      setError(toErrorMessage(err));
      setResults([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [activeTab.types, buildFilter, debouncedText, gameVersions, loaders, onFavoritesTab, pageIndex, pageSize, selectedCategories, sort, translate]);

  useEffect(() => {
    if (!backendReady) return;
    void runSearch();
    return () => {
      if (activeRequest.current) void launcher.discoverCancel(activeRequest.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSearch, backendReady]);

  const changeTab = (next: string) => {
    setTab(next);
    setResults([]);
    setError('');
    setLoading(false);
    resetPaging();
  };

  const visibleMetas: SourceProjectMetadata[] = onFavoritesTab
    ? favoriteResults
    : results.map((result) => result.projects[0]).filter((meta): meta is SourceProjectMetadata => Boolean(meta));

  const isFavorite = useCallback((meta: SourceProjectMetadata) => (
    favorites.some((favorite) => favorite.project.projectId === meta.project.projectId)
  ), [favorites]);

  const toggleFavorite = async (meta: SourceProjectMetadata) => {
    const next = !isFavorite(meta);
    try {
      await launcher.discoverFavorite(meta.project, meta.types[0] ?? 'mod', meta.slug, next);
      await reloadFavorites();
      notify(next ? '已加入收藏夹' : '已移出收藏夹', meta.title, 'info');
    } catch (err) {
      notify('收藏操作失败', toErrorMessage(err), 'error');
    }
  };

  const install = async (meta: SourceProjectMetadata, release?: ResourceSelectionRelease, instanceId?: string) => {
    const isModpack = (meta.types[0] ?? 'mod') === 'modPack';
    const targetInstance = (instanceId ? instances.find((item) => item.id === instanceId) : null) ?? selectedInstance;
    if (!isModpack && !targetInstance) {
      notify('请先创建实例', '发现内容需要安装到一个实例中。', 'info');
      onOpenInstances();
      return;
    }
    setInstallingId(meta.project.projectId);
    try {
      await onInstall(meta, release, isModpack ? undefined : targetInstance?.id);
      notify(isModpack ? '已开始创建整合包实例' : '已加入下载任务', `${meta.title}${isModpack ? '' : ` → ${targetInstance?.name ?? ''}`}`, 'success');
    } catch (err) {
      notify(isModpack ? '创建整合包实例失败' : '安装失败', toErrorMessage(err), 'error');
    } finally {
      setInstallingId(null);
      setInstallTargetFor(null);
    }
  };

  /** 非整合包点击安装：先弹出二级菜单选择目标实例（按其游戏版本自动匹配兼容版本） */
  const openInstallTarget = (meta: SourceProjectMetadata, release?: ResourceRelease) => {
    const isModpack = (meta.types[0] ?? 'mod') === 'modPack';
    if (isModpack) {
      void install(meta);
      return;
    }
    if (!instances.length) {
      notify('请先创建实例', '发现内容需要安装到一个实例中。', 'info');
      onOpenInstances();
      return;
    }
    setInstallTargetFor({ meta, release, instanceId: selectedInstance?.id ?? instances[0].id });
  };

  const releaseTarget = (meta: SourceProjectMetadata): ResourceTarget => ({
    gameVersions: meta.gameVersions.slice(0, 1),
    loaders: meta.loaders.slice(0, 1),
    channels: [],
  });

  const openDetail = async (meta: SourceProjectMetadata, tab: 'description' | 'releases' = 'description') => {
    setDetail({ meta, doc: null, loading: true, tab });
    setDetailReleases([]);
    setDetailReleasesLoading(tab === 'releases');
    try {
      const [doc, releasePage] = await Promise.all([
        launcher.discoverProject(meta.project, meta.slug).catch((err) => {
          notify('读取项目描述失败', toErrorMessage(err), 'error');
          return null;
        }),
        tab === 'releases'
          ? launcher.discoverReleases(meta.project, meta.types[0] ?? 'mod', releaseTarget(meta), meta.slug).catch((err) => {
              notify('读取版本列表失败', toErrorMessage(err), 'error');
              return null;
            })
          : Promise.resolve(null),
      ]);
      setDetail((current) => (current && current.meta.project.projectId === meta.project.projectId ? { ...current, doc, loading: false } : current));
      if (releasePage && tab === 'releases') {
        setDetailReleases(releasePage.entries);
        setDetailReleasesLoading(false);
      }
    } catch (err) {
      setDetail((current) => (current && current.meta.project.projectId === meta.project.projectId ? { ...current, doc: null, loading: false } : current));
      notify('读取项目详情失败', toErrorMessage(err), 'error');
      setDetailReleasesLoading(false);
    }
  };

  const switchDetailTab = (next: 'description' | 'releases') => {
    if (!detail) return;
    if (next === 'releases' && detailReleases.length === 0 && !detailReleasesLoading) {
      setDetailReleasesLoading(true);
      void launcher.discoverReleases(detail.meta.project, detail.meta.types[0] ?? 'mod', releaseTarget(detail.meta), detail.meta.slug)
        .then((page) => {
          setDetailReleases(page.entries);
          setDetailReleasesLoading(false);
        })
        .catch((err) => {
          setDetailReleasesLoading(false);
          notify('读取版本列表失败', toErrorMessage(err), 'error');
        });
    }
    setDetail({ ...detail, tab: next });
  };

  const filterOptions = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    return CATEGORY_OPTIONS.filter((option) => !query || option.slug.includes(query) || option.label.includes(filterText.trim()));
  }, [filterText]);

  if (sourceError && !activeSource) {
    return (
      <div className="view discover-view">
        <div className="page-heading">
          <div><h1>发现内容</h1><p>浏览并安装整合包、模组与更多资源。</p></div>
        </div>
        <div className="empty-state glass-panel">
          <Compass size={28} aria-hidden="true" />
          <h2>当前数据源不可用</h2>
          <p>{sourceError}</p>
          <button type="button" className="button secondary pressable" data-ripple onClick={() => {
            setSourceError('');
            void launcher.discoverSources().then((list) => {
              setSources(list);
              if (!list.some((source) => source.available)) {
                setSourceError('当前数据源不可用，请检查网络后重试。');
              }
            }).catch((err) => setSourceError(toErrorMessage(err)));
          }}>重新加载</button>
        </div>
      </div>
    );
  }

  return (
    <div className="view discover-view">
      <div className="page-heading">
        <div><h1>发现内容</h1><p>浏览并安装整合包、模组与更多资源。</p></div>
        <div className="discover-heading-meta">
          {selectedInstance ? <span className="discover-instance-chip">安装到：{selectedInstance.name}</span> : (
            <button type="button" className="button secondary pressable" data-ripple onClick={onOpenInstances}>创建实例后安装</button>
          )}
        </div>
      </div>

      <div className="discover-tabs-row">
        <div className="discover-tabs" role="tablist" aria-label="资源分类">
          {[...CATEGORY_TABS, FAVORITES_TAB].map((item) => (
            <button
              type="button"
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={`discover-tab pressable ${tab === item.id ? 'active' : ''}`}
              onClick={() => changeTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="discover-translate" title="开启后，中文搜索词会用内置词库翻译成英文项目名再检索（如「钠」→ Sodium）；词库未收录的词仍按原文检索">
          <input type="checkbox" checked={translate} onChange={(event) => { setTranslate(event.target.checked); resetPaging(); }} />
          <span className="discover-switch" aria-hidden="true" />
          中文翻译检索
        </label>
      </div>

      <div className="discover-search-row">
        <div className="toolbar glass-panel discover-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索资源"
            placeholder={onFavoritesTab ? '在收藏夹中搜索' : '搜索名称、作者或关键词'}
            value={onFavoritesTab ? filterText : text}
            onChange={(event) => (onFavoritesTab ? setFilterText(event.target.value) : setText(event.target.value))}
          />
          {activeSource && <span className="discover-source-badge">{sourceLabel(activeSource.id)}</span>}
        </div>
      </div>

      <div className={`discover-layout ${filtersOpen ? '' : 'filters-collapsed'}`}>
        <div className="discover-main">
          {!onFavoritesTab && (
            <div className="discover-toolbar glass-panel">
              <div className="discover-toolbar-group">
                <label>
                  排序
                  <Select
                    size="sm"
                    ariaLabel="排序"
                    value={sort}
                    options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                    onChange={(value) => { setSort(value as ResourceSearchSort); resetPaging(); }}
                  />
                </label>
                <label>
                  每页
                  <Select
                    size="sm"
                    ariaLabel="每页数量"
                    value={pageSize}
                    options={PAGE_SIZES.map((size) => ({ value: size, label: String(size) }))}
                    onChange={(value) => { setPageSize(value); resetPaging(); }}
                  />
                </label>
              </div>
              <div className="discover-toolbar-group">
                <span className="discover-total">{total !== null ? `${total} 个结果` : loading ? '搜索中…' : ''}</span>
                <button type="button" className={`button secondary pressable ${filtersOpen ? 'active' : ''}`} data-ripple onClick={() => setFiltersOpen((open) => !open)}>
                  <SlidersHorizontal size={16} aria-hidden="true" />筛选
                </button>
              </div>
            </div>
          )}

          {loading && !visibleMetas.length ? (
            <div className="discover-skeleton" aria-label="正在加载">
              {Array.from({ length: 5 }, (_, index) => <span key={index} className="discover-skeleton-row" />)}
            </div>
          ) : error && !onFavoritesTab ? (
            <div className="empty-state glass-panel">
              <h2>搜索失败</h2>
              <p>{error}</p>
              <button type="button" className="button secondary pressable" data-ripple onClick={() => void runSearch()}>重试</button>
            </div>
          ) : visibleMetas.length === 0 ? (
            <div className="empty-state glass-panel">
              {onFavoritesTab ? <Heart size={26} aria-hidden="true" /> : <Sparkles size={26} aria-hidden="true" />}
              <h2>{onFavoritesTab ? '收藏夹还是空的' : (debouncedText ? `没有找到「${debouncedText}」相关的内容` : '没有找到匹配的资源')}</h2>
              <p>{onFavoritesTab ? '在资源卡片上点击心形图标即可收藏。' : '试试换一个关键词，或点击下方按钮清除搜索与筛选。'}</p>
              {!onFavoritesTab && (
                <button
                  type="button"
                  className="button secondary pressable"
                  data-ripple
                  onClick={() => {
                    setText('');
                    setDebouncedText('');
                    setSelectedCategories([]);
                    setEnvironments([]);
                    setGameVersions([]);
                    setLoaders([]);
                    setLicenses([]);
                    setOpenSourceOnly(false);
                    resetPaging();
                  }}
                >
                  清除搜索与筛选
                </button>
              )}
            </div>
          ) : (
            <div className="discover-list">
              {visibleMetas.map((meta) => {
                const favorite = isFavorite(meta);
                const installing = installingId === meta.project.projectId;
                return (
                  <article className="discover-card glass-panel" key={`${meta.project.source}-${meta.project.projectId}`}>
                    <button type="button" className="discover-card-main" onClick={() => void openDetail(meta)}>
                      <span className="discover-cover">
                        {meta.iconUrl
                          ? <img src={meta.iconUrl} alt="" loading="lazy" />
                          : <span className="discover-cover-fallback" aria-hidden="true">{meta.title.slice(0, 2).toUpperCase()}</span>}
                      </span>
                      <span className="discover-card-body">
                        <span className="discover-card-title">
                          <strong>{meta.title}</strong>
                          <em className="discover-badge">{sourceLabel(meta.project.source)}</em>
                          {meta.types[0] && <em className="discover-badge muted">{resourceTypeLabel(meta.types[0])}</em>}
                        </span>
                        <span className="discover-card-summary">{meta.summary}</span>
                        <span className="discover-tags">
                          {meta.environments.includes('client') && meta.environments.includes('server')
                            ? <span>客户端和服务端</span>
                            : meta.environments.slice(0, 2).map((env) => <span key={env}>{env === 'client' ? '客户端' : '服务端'}</span>)}
                          {meta.loaders.slice(0, 2).map((loader) => <span key={loader}>{loader}</span>)}
                          {meta.categories.slice(0, 2).map((category) => <span key={category}>{CATEGORY_OPTIONS.find((option) => option.slug === category)?.label ?? category}</span>)}
                        </span>
                        <span className="discover-card-meta">
                          <Download size={13} aria-hidden="true" />{formatCount(meta.downloads)}
                          {meta.updatedAt && <><em>·</em>更新于 {formatTime(meta.updatedAt)}</>}
                          {meta.license && <><em>·</em>{meta.license}</>}
                        </span>
                      </span>
                    </button>
                    <div className="discover-card-actions">
                      <button
                        type="button"
                        className={`discover-favorite pressable ${favorite ? 'active' : ''}`}
                        aria-label={favorite ? `取消收藏 ${meta.title}` : `收藏 ${meta.title}`}
                        aria-pressed={favorite}
                        onClick={() => void toggleFavorite(meta)}
                      >
                        <Heart size={16} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="button primary pressable discover-install"
                        data-ripple
                        disabled={installing}
                        onClick={() => openInstallTarget(meta)}
                      >
                        {installing ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                        {installing ? '安装中' : '安装'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!onFavoritesTab && (
            <div className="discover-pagination">
              <button type="button" className="button secondary pressable" data-ripple disabled={pageIndex === 0 || loading} onClick={() => setPageIndex((index) => Math.max(0, index - 1))}>
                <ChevronLeft size={16} aria-hidden="true" />上一页
              </button>
              <span className="discover-page-number">第 {pageIndex + 1} 页</span>
              <button
                type="button"
                className="button secondary pressable"
                data-ripple
                disabled={!hasMore || loading}
                onClick={() => setPageIndex((index) => index + 1)}
              >
                下一页<ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {filtersOpen && !onFavoritesTab && (
          <aside className="discover-filters glass-panel" aria-label="筛选">
            <div className="discover-filter-head">
              <strong>筛选</strong>
              <button
                type="button"
                className="discover-filter-reset"
                onClick={() => {
                  setSelectedCategories([]);
                  setEnvironments([]);
                  setGameVersions([]);
                  setLoaders([]);
                  setLicenses([]);
                  setOpenSourceOnly(false);
                  resetPaging();
                }}
              >
                重置
              </button>
            </div>

            <div className="discover-filter-group">
              <span className="discover-filter-title">类别</span>
              <div className="discover-filter-chip-list">
                {filterOptions.map((option) => (
                  <button
                    type="button"
                    key={option.slug}
                    className={`filter-chip pressable ${selectedCategories.includes(option.slug) ? 'active' : ''}`}
                    aria-pressed={selectedCategories.includes(option.slug)}
                    onClick={() => { setSelectedCategories((list) => toggleInList(list, option.slug)); resetPaging(); }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="discover-filter-group">
              <span className="discover-filter-title">运行环境</span>
              <label className="discover-check"><input type="checkbox" checked={environments.includes('client')} onChange={() => { setEnvironments((list) => toggleInList(list, 'client')); resetPaging(); }} />客户端</label>
              <label className="discover-check"><input type="checkbox" checked={environments.includes('server')} onChange={() => { setEnvironments((list) => toggleInList(list, 'server')); resetPaging(); }} />服务端</label>
            </div>

            <details className="discover-filter-group" open>
              <summary className="discover-filter-title">游戏版本</summary>
              <div className="discover-filter-chip-list scroll">
                {GAME_VERSIONS.map((version) => (
                  <button
                    type="button"
                    key={version}
                    className={`filter-chip pressable ${gameVersions.includes(version) ? 'active' : ''}`}
                    aria-pressed={gameVersions.includes(version)}
                    onClick={() => { setGameVersions((list) => toggleInList(list, version)); resetPaging(); }}
                  >
                    {version}
                  </button>
                ))}
              </div>
            </details>

            <details className="discover-filter-group" open>
              <summary className="discover-filter-title">加载器</summary>
              <div className="discover-filter-chip-list">
                {LOADERS.map((loader) => (
                  <button
                    type="button"
                    key={loader}
                    className={`filter-chip pressable ${loaders.includes(loader) ? 'active' : ''}`}
                    aria-pressed={loaders.includes(loader)}
                    onClick={() => { setLoaders((list) => toggleInList(list, loader)); resetPaging(); }}
                  >
                    {loader}
                  </button>
                ))}
              </div>
            </details>

            <details className="discover-filter-group">
              <summary className="discover-filter-title">许可证</summary>
              <div className="discover-filter-chip-list">
                {LICENSES.map((license) => (
                  <button
                    type="button"
                    key={license}
                    className={`filter-chip pressable ${licenses.includes(license) ? 'active' : ''}`}
                    aria-pressed={licenses.includes(license)}
                    onClick={() => { setLicenses((list) => toggleInList(list, license)); resetPaging(); }}
                  >
                    {license}
                  </button>
                ))}
              </div>
            </details>

            <div className="discover-filter-group">
              <label className="discover-check"><input type="checkbox" checked={openSourceOnly} onChange={() => { setOpenSourceOnly((value) => !value); resetPaging(); }} />仅开源项目</label>
            </div>

            {favoritesLoading && <span className="discover-filter-hint"><Loader2 size={13} className="spin" aria-hidden="true" />收藏同步中…</span>}
          </aside>
        )}
      </div>

      {detail && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setDetail(null); setInstallTargetFor(null); }}>
          <div className="modal-panel discover-detail glass-panel" role="dialog" aria-modal="true" aria-label={detail.meta.title} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close pressable" aria-label="关闭" onClick={() => { setDetail(null); setInstallTargetFor(null); }}>
              <X size={17} aria-hidden="true" />
            </button>

            <div className="discover-detail-head">
              <span className="discover-cover large">
                {detail.meta.iconUrl
                  ? <img src={detail.meta.iconUrl} alt="" />
                  : <span className="discover-cover-fallback" aria-hidden="true">{detail.meta.title.slice(0, 2).toUpperCase()}</span>}
              </span>
              <div className="discover-detail-head-main">
                <h2>{detail.meta.title}</h2>
                <p>{detail.meta.authors.join('、') || '未知作者'} · {sourceLabel(detail.meta.project.source)}</p>
                <div className="discover-detail-stats">
                  <span><Download size={14} aria-hidden="true" />{detail.meta.downloads == null ? '下载次数未知' : `${formatCount(detail.meta.downloads)} 下载`}</span>
                  <span><Heart size={14} aria-hidden="true" />{detail.meta.followers == null ? '关注者未知' : `${formatCount(detail.meta.followers)} 关注`}</span>
                  {detail.meta.license && <span>{detail.meta.license}</span>}
                </div>
              </div>
              <div className="discover-detail-head-actions">
                <button
                  type="button"
                  className="button primary pressable discover-install"
                  data-ripple
                  disabled={installingId === detail.meta.project.projectId}
                  onClick={() => openInstallTarget(detail.meta)}
                >
                  <Plus size={16} aria-hidden="true" />安装
                </button>
                <button
                  type="button"
                  className={`discover-favorite pressable ${isFavorite(detail.meta) ? 'active' : ''}`}
                  aria-label={isFavorite(detail.meta) ? '取消收藏' : '收藏'}
                  aria-pressed={isFavorite(detail.meta)}
                  onClick={() => void toggleFavorite(detail.meta)}
                >
                  <Heart size={16} fill={isFavorite(detail.meta) ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="discover-detail-layout">
              <div className="discover-detail-main">
                <div className="discover-detail-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detail.tab === 'description'}
                    className={`discover-detail-tab pressable ${detail.tab === 'description' ? 'active' : ''}`}
                    onClick={() => switchDetailTab('description')}
                  >描述</button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detail.tab === 'releases'}
                    className={`discover-detail-tab pressable ${detail.tab === 'releases' ? 'active' : ''}`}
                    onClick={() => switchDetailTab('releases')}
                  >版本 ({detailReleases.length || detail.meta.gameVersions.length})</button>
                </div>

                {detail.tab === 'description' && (
                  <div className="discover-detail-body">
                    {detail.loading
                      ? <span className="discover-filter-hint"><Loader2 size={14} className="spin" aria-hidden="true" />正在读取描述…</span>
                      : (
                        detail.doc?.description.body
                          ? <p className="discover-description">{detail.doc.description.body}</p>
                          : <p className="discover-description">{detail.meta.summary || '该资源没有提供更多描述。'}</p>
                      )}
                  </div>
                )}

                {detail.tab === 'releases' && (
                  <div className="discover-releases-list">
                    {detailReleasesLoading ? (
                      <span className="discover-filter-hint"><Loader2 size={14} className="spin" aria-hidden="true" />正在读取版本…</span>
                    ) : detailReleases.length === 0 ? (
                      <div className="empty-state small">
                        <MonitorPlay size={24} aria-hidden="true" />
                        <p>暂无可安装版本</p>
                      </div>
                    ) : (
                      detailReleases.map((release) => (
                        <article className="discover-release-row glass-panel" key={JSON.stringify(release.reference)}>
                          <div className="discover-release-info">
                            <div className="discover-release-head">
                              <span className={`discover-channel ${channelClass(release.channel)}`}>{channelLabel(release.channel)}</span>
                              <strong>{release.version}</strong>
                              {release.publishedAt && <em>{formatTime(release.publishedAt)}</em>}
                            </div>
                            <div className="discover-release-sub">
                              {release.artifacts.length > 0 && release.artifacts[0].fileName && (
                                <span className="discover-release-file" title={release.artifacts[0].fileName}>{release.artifacts[0].fileName}</span>
                              )}
                              {release.compatibility.gameVersions.length > 0
                                ? <span className="discover-release-tag">{release.compatibility.gameVersions.slice(0, 3).join(' / ')}</span>
                                : <span className="discover-release-tag">版本未标注</span>}
                              {release.compatibility.loaders.slice(0, 2).map((loader) => (
                                <span key={loader} className="discover-release-tag small">{loader}</span>
                              ))}
                            </div>
                          </div>
                          <div className="discover-release-actions">
                            <button
                              type="button"
                              className="button primary pressable"
                              data-ripple
                              disabled={installingId === detail.meta.project.projectId}
                              onClick={() => openInstallTarget(detail.meta, release)}
                            >
                              <Plus size={14} aria-hidden="true" />安装此版本
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                )}
              </div>

              <aside className="discover-detail-sidebar">
                <div className="discover-side-section">
                  <strong><Tags size={14} aria-hidden="true" /> 兼容游戏版本</strong>
                  <div className="discover-side-tags">
                    {detail.meta.gameVersions.map((version) => <span key={version} className="tag">{version}</span>)}
                  </div>
                </div>
                {detail.meta.loaders.length > 0 && (
                  <div className="discover-side-section">
                    <strong>加载器</strong>
                    <div className="discover-side-tags">
                      {detail.meta.loaders.map((loader) => <span key={loader} className="tag">{loader}</span>)}
                    </div>
                  </div>
                )}
                {detail.meta.categories.length > 0 && (
                  <div className="discover-side-section">
                    <strong>分类</strong>
                    <div className="discover-side-tags">
                      {detail.meta.categories.map((cat) => (
                        <span key={cat} className="tag muted">{CATEGORY_OPTIONS.find((o) => o.slug === cat)?.label ?? cat}</span>
                      ))}
                    </div>
                  </div>
                )}
                {detail.meta.environments.length > 0 && (
                  <div className="discover-side-section">
                    <strong>适用环境</strong>
                    <div className="discover-side-tags">
                      {detail.meta.environments.map((env) => <span key={env} className="tag muted">{env === 'client' ? '客户端' : '服务端'}</span>)}
                    </div>
                  </div>
                )}
                {detail.meta.license && (
                  <div className="discover-side-section">
                    <strong>许可证</strong>
                    <span className="tag muted">{detail.meta.license}</span>
                  </div>
                )}
                {detail.meta.updatedAt && (
                  <div className="discover-side-section">
                    <strong>最近更新</strong>
                    <span className="muted">{formatTime(detail.meta.updatedAt)}</span>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}

      {installTargetFor && (
        <div className="modal-backdrop" role="presentation" onClick={() => setInstallTargetFor(null)}>
          <div className="modal-panel discover-install-confirm glass-panel" role="dialog" aria-modal="true" aria-label="选择安装实例" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close pressable" aria-label="关闭" onClick={() => setInstallTargetFor(null)}>
              <X size={17} aria-hidden="true" />
            </button>
            <h2>选择安装实例</h2>
            <div className="discover-confirm-body">
              <span className="discover-cover small">
                {installTargetFor.meta.iconUrl
                  ? <img src={installTargetFor.meta.iconUrl} alt="" />
                  : <span className="discover-cover-fallback" aria-hidden="true">{installTargetFor.meta.title.slice(0, 2).toUpperCase()}</span>}
              </span>
              <div className="discover-confirm-info">
                <strong>{installTargetFor.meta.title}</strong>
                <div className="discover-confirm-meta">
                  <span className="discover-channel channel-other">{resourceTypeLabel(installTargetFor.meta.types[0] ?? 'mod')}</span>
                  {installTargetFor.release ? (
                    <>
                      <span className={`discover-channel ${channelClass(installTargetFor.release.channel)}`}>{channelLabel(installTargetFor.release.channel)}</span>
                      <em>·</em>版本 <strong>{installTargetFor.release.version}</strong>
                      {installTargetFor.release.compatibility.gameVersions.length > 0 && (
                        <> <em>·</em> 支持 {installTargetFor.release.compatibility.gameVersions.slice(0, 2).join(' / ')}</>
                      )}
                    </>
                  ) : (
                    <><em>·</em>将按所选实例的版本自动匹配兼容版本</>
                  )}
                </div>
              </div>
            </div>
            <div className="discover-target-picker">
              <span className="discover-target-title">安装到实例</span>
              <div className="discover-target-list" role="radiogroup" aria-label="目标实例">
                {instances.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={installTargetFor.instanceId === item.id}
                    className={`discover-target-item pressable ${installTargetFor.instanceId === item.id ? 'active' : ''}`}
                    onClick={() => setInstallTargetFor({ ...installTargetFor, instanceId: item.id })}
                  >
                    <span className="discover-target-icon" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>
                    <span className="discover-target-text">
                      <strong>{item.name}</strong>
                      <em>{item.version || '未知版本'} · {loaderLabel(item.loader)}</em>
                    </span>
                    {installTargetFor.instanceId === item.id && <Check size={16} aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="discover-confirm-actions">
              <button type="button" className="button secondary pressable" data-ripple onClick={() => setInstallTargetFor(null)}>取消</button>
              <button
                type="button"
                className="button primary pressable"
                data-ripple
                disabled={installingId === installTargetFor.meta.project.projectId || !installTargetFor.instanceId}
                onClick={() => {
                  const selectionRelease: ResourceSelectionRelease | undefined = installTargetFor.release
                    ? { kind: 'release', reference: installTargetFor.release.reference }
                    : undefined;
                  void install(installTargetFor.meta, selectionRelease, installTargetFor.instanceId);
                }}
              >
                {installingId === installTargetFor.meta.project.projectId ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <FileCheck2 size={14} aria-hidden="true" />}
                {installingId === installTargetFor.meta.project.projectId ? '安装中' : '确认安装'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
