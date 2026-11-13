import { ChevronLeft, ChevronRight, FolderOpen, ImageOff, Images, Loader2, RefreshCw, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { listAllScreenshots, revealScreenshot, type GameScreenshot } from '../lib/screenshots';

interface ScreenshotsViewProps {
  isDesktop: boolean;
}

function formatShotTime(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const ScreenshotsView = memo(function ScreenshotsView({ isDesktop }: ScreenshotsViewProps) {
  const [items, setItems] = useState<GameScreenshot[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [loading, setLoading] = useState(isDesktop);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!isDesktop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const scan = await listAllScreenshots();
      setItems(scan.screenshots);
      setSkipped(scan.skipped);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => `${item.instanceName} ${item.fileName}`.toLowerCase().includes(keyword));
  }, [items, query]);

  const active = activeIndex === null ? null : filtered[activeIndex] ?? null;

  const step = useCallback((delta: number) => {
    setActiveIndex((current) => {
      if (current === null) return current;
      const next = current + delta;
      if (next < 0 || next >= filtered.length) return current;
      return next;
    });
  }, [filtered.length]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null);
      else if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, step]);

  /**
   * 预览层挂到应用外壳上（与各类弹窗同级），而不是留在本视图的 DOM 里：
   * `.main-panel` 有 `position: relative; z-index: 2`，会把里面的层锁在它自己的
   * 层叠上下文里，于是侧栏（`z-index: 3`）永远盖在预览之上，图片左侧被侧栏切掉。
   */
  const overlayHost = typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLElement>('.app-shell') ?? document.body;

  return (
    <div className="view screenshots-view">
      <div className="page-heading">
        <div>
          <h1>截图中心</h1>
          <p>汇总所有实例与版本目录下的截图（各版本 screenshots 文件夹）。</p>
        </div>
        <div className="page-heading-actions">
          {isDesktop && (
            <button type="button" className="button secondary pressable" data-ripple onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}重新扫描
            </button>
          )}
        </div>
      </div>

      {isDesktop && (
        <div className="toolbar glass-panel">
          <Images size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索截图"
            placeholder="搜索实例名称或文件名"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(null); }}
          />
          <span>{filtered.length} 张{skipped > 0 ? ` · ${skipped} 个目录被跳过` : ''}</span>
        </div>
      )}

      {!isDesktop ? (
        <div className="empty-state glass-panel">
          <ImageOff size={26} aria-hidden="true" />
          <h2>截图中心需要在桌面端使用</h2>
          <p>浏览器预览拿不到本地截图目录，请在启动器里查看。</p>
        </div>
      ) : loading ? (
        <div className="empty-state glass-panel">
          <Loader2 size={24} className="spin" aria-hidden="true" />
          <h2>正在扫描截图</h2>
          <p>逐个读取各实例的 screenshots 目录…</p>
        </div>
      ) : error ? (
        <div className="empty-state glass-panel">
          <ImageOff size={26} aria-hidden="true" />
          <h2>读取截图失败</h2>
          <p>{error}</p>
          <button type="button" className="button secondary pressable" data-ripple onClick={() => void load()}>重试</button>
        </div>
      ) : filtered.length ? (
        <div className="shot-grid">
          {filtered.map((shot, index) => (
            <button
              type="button"
              key={shot.id}
              className="shot-card pressable"
              data-ripple
              onClick={() => setActiveIndex(index)}
              title={shot.fileName}
            >
              <img src={shot.url} alt={shot.fileName} loading="lazy" decoding="async" />
              <span className="shot-meta">
                <strong>{shot.instanceName}</strong>
                <small>{formatShotTime(shot.createdAt)}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state glass-panel">
          <ImageOff size={26} aria-hidden="true" />
          <h2>{items.length ? '没有匹配的截图' : '还没有截图'}</h2>
          <p>{items.length ? '换个关键词试试。' : '在游戏里按 F2 截图后，这里会自动汇总所有版本的截图。'}</p>
        </div>
      )}

      {active && overlayHost && createPortal(
        <div className="shot-lightbox" role="dialog" aria-modal="true" aria-label={active.fileName} onClick={() => setActiveIndex(null)}>
          <button
            type="button"
            className="shot-lightbox-close pressable"
            data-ripple
            aria-label="关闭预览"
            onClick={(event) => { event.stopPropagation(); setActiveIndex(null); }}
          >
            <X size={18} aria-hidden="true" />
          </button>
          {(activeIndex ?? 0) > 0 && (
            <button
              type="button"
              className="shot-lightbox-nav prev pressable"
              data-ripple
              aria-label="上一张"
              onClick={(event) => { event.stopPropagation(); step(-1); }}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
          )}
          {(activeIndex ?? 0) < filtered.length - 1 && (
            <button
              type="button"
              className="shot-lightbox-nav next pressable"
              data-ripple
              aria-label="下一张"
              onClick={(event) => { event.stopPropagation(); step(1); }}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          )}
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={active.url} alt={active.fileName} />
            <figcaption>
              <span>{active.instanceName} · {active.fileName}</span>
              <small>{formatShotTime(active.createdAt)}</small>
              <button
                type="button"
                className="button secondary small pressable"
                data-ripple
                onClick={() => void revealScreenshot(active.path)}
              >
                <FolderOpen size={14} aria-hidden="true" />打开所在文件夹
              </button>
            </figcaption>
          </figure>
        </div>,
        overlayHost,
      )}
    </div>
  );
});
