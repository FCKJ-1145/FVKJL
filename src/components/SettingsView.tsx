import { BellRing, Brush, Check, Cpu, Download, Globe, HardDrive, Languages, MemoryStick, MonitorUp, Moon, Pipette, Power, RefreshCw, ShieldCheck, Sun } from 'lucide-react';
import { useState } from 'react';
import { ISOLATION_POLICIES, PROCESS_PRIORITIES } from '../data';
import { DOWNLOAD_SOURCE_OPTIONS, formatBytes, launcher, sourceLabel } from '../lib/launcher';
import { ACCENT_PRESETS } from '../lib/palette';
import type { BackendSettings, DownloadSourceMode, InstanceMemory, IsolationPolicy, LauncherSettings, ProcessPriority, UpdateController } from '../types';
import { Select } from './Select';
import { Toggle } from './Toggle';

interface SettingsViewProps {
  settings: LauncherSettings;
  backendSettings: BackendSettings;
  javaVersions: { parsed_version: number; version: string; path: string; architecture: string; distribution: string | null }[];
  maxMemory: number;
  isDesktop: boolean;
  onChange: (settings: LauncherSettings) => void;
  onPatchSettings: (patch: Record<string, unknown>) => void;
  /** 全局内存设置：应用到所有实例（实例单独设置可覆盖） */
  onApplyMemory: (memory: InstanceMemory) => void | Promise<void>;
  onRefreshJava: () => void;
  /** 启动器更新状态与操作（设置页入口） */
  updater: UpdateController;
}

const AUTO_INSTALL_MAJORS = [8, 11, 17, 21];

/** 可选默认游戏语言：空值 = 跟随启动器语言（当前为简体中文） */
const GAME_LANGUAGE_OPTIONS = [
  { value: '', label: '跟随启动器' },
  { value: 'zh_cn', label: '简体中文' },
  { value: 'zh_tw', label: '繁體中文' },
  { value: 'en_us', label: 'English' },
  { value: 'ja_jp', label: '日本語' },
  { value: 'ko_kr', label: '한국어' },
];

export function SettingsView({ settings, backendSettings, javaVersions, maxMemory, isDesktop, onChange, onPatchSettings, onApplyMemory, onRefreshJava, updater }: SettingsViewProps) {
  const update = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]) => onChange({ ...settings, [key]: value });
  const activePreset = settings.accent.toLowerCase();
  const isCustom = !ACCENT_PRESETS.some((preset) => preset.value === activePreset);
  const [installMajor, setInstallMajor] = useState(17);
  const [installingJava, setInstallingJava] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);

  const fileSource = (backendSettings.minecraft_file_source ?? 'auto') as DownloadSourceMode;
  const metaSource = (backendSettings.minecraft_metadata_source ?? 'auto') as DownloadSourceMode;
  const concurrent = typeof backendSettings.max_concurrent_downloads === 'number' ? backendSettings.max_concurrent_downloads : 4;
  const gameLanguage = typeof backendSettings.default_game_language === 'string'
    ? backendSettings.default_game_language.toLowerCase().replace('-', '_')
    : '';

  const updateBusy = updater.phase === 'downloading' || updater.phase === 'installing' || updater.phase === 'ready';
  const updatePercent = updater.progress.total && updater.progress.total > 0
    ? Math.min(100, Math.round((updater.progress.downloaded / updater.progress.total) * 100))
    : null;
  const updateDate = updater.available?.date ? new Date(updater.available.date) : null;
  const updateDateLabel = updateDate && !Number.isNaN(updateDate.getTime())
    ? updateDate.toLocaleDateString('zh-CN')
    : updater.available?.date ?? '';

  const updateStatus = (() => {
    switch (updater.phase) {
      case 'checking':
        return '正在检查新版本…';
      case 'up-to-date':
        return '已是最新版本';
      case 'available':
        return updater.available ? `发现新版本 v${updater.available.version}` : '发现新版本';
      case 'downloading':
        return updatePercent === null
          ? `正在下载更新… ${formatBytes(updater.progress.downloaded)}`
          : `正在下载更新… ${updatePercent}%`;
      case 'installing':
        return '正在安装更新…';
      case 'ready':
        return '安装完成，正在重启…';
      case 'error':
        return `更新失败：${updater.error}`;
      default:
        return '启动后自动检查，也可以手动立即检查';
    }
  })();

  const applyMemory = (value: number, automatic: boolean) => {
    setMemorySaving(true);
    void Promise.resolve(onApplyMemory({ maximum: value * 1024, automatic, optimize_before_launch: true }))
      .finally(() => window.setTimeout(() => setMemorySaving(false), 400));
  };

  const handleMemory = (value: number) => {
    update('memory', value);
    applyMemory(value, false);
  };

  const handleAutoMemory = (value: boolean) => {
    update('autoMemory', value);
    if (value) applyMemory(settings.memory, true);
  };

  const handleAutoInstallJava = async () => {
    setInstallingJava(true);
    try {
      await launcher.autoInstallJava(installMajor);
    } catch {
      // 安装失败时仍刷新列表，让用户看到当前状态
    } finally {
      setInstallingJava(false);
      onRefreshJava();
    }
  };

  return (
    <div className="view settings-view">
      <div className="page-heading"><div><h1>设置</h1><p>调整外观与启动行为，更改会自动保存。</p></div></div>
      <div className="settings-grid">
        <section className="settings-section glass-panel" aria-labelledby="appearance-settings">
          <div className="settings-title"><span><Brush size={19} aria-hidden="true" /></span><div><h2 id="appearance-settings">外观</h2><p>让界面适应你的使用习惯。</p></div></div>
          <div className="setting-row">
            <div><strong>主题</strong><span>切换深色或浅色界面</span></div>
            <div className="segmented" role="group" aria-label="主题">
              <button type="button" className="segment" aria-pressed={settings.theme === 'dark'} onClick={() => update('theme', 'dark')}>
                <Moon size={13} aria-hidden="true" />深色
              </button>
              <button type="button" className="segment" aria-pressed={settings.theme === 'light'} onClick={() => update('theme', 'light')}>
                <Sun size={13} aria-hidden="true" />浅色
              </button>
            </div>
          </div>
          <div className="setting-row accent-row">
            <div><strong>主题色</strong><span>用于主按钮、选中态与高亮</span></div>
            <div className="accent-controls">
              <div className="accent-options" role="group" aria-label="主题色">
                {ACCENT_PRESETS.map((preset) => {
                  const active = settings.accent.toLowerCase() === preset.value;
                  return (
                    <button
                      type="button"
                      key={preset.id}
                      className="accent-swatch"
                      style={{ backgroundColor: preset.value }}
                      aria-label={preset.label}
                      aria-pressed={active}
                      title={`${preset.label} ${preset.value.toUpperCase()}`}
                      onClick={() => update('accent', preset.value)}
                    >
                      {active && <Check size={14} aria-hidden="true" />}
                    </button>
                  );
                })}
                <label className={`accent-custom ${isCustom ? 'active' : ''}`} title="自定义颜色">
                  <input type="color" aria-label="自定义主题色" value={settings.accent} onChange={(event) => update('accent', event.target.value)} />
                  <Pipette size={13} aria-hidden="true" />
                </label>
              </div>
              <output className="accent-value">{settings.accent.toUpperCase()}</output>
            </div>
          </div>
          <div className="setting-row"><div><strong>全局透明材质</strong><span>系统级高斯模糊，实时透出桌面背景</span></div><Toggle label="全局透明材质" checked={settings.translucent} onChange={(value) => update('translucent', value)} /></div>
          <div className={`setting-row glass-strength-row ${settings.translucent ? '' : 'is-muted'}`}>
            <div><strong>材质强度</strong><span>无级调节玻璃透明度，越高越通透</span></div>
            <output htmlFor="glass-strength-range">{settings.glassStrength}%</output>
          </div>
          <input
            id="glass-strength-range"
            className="memory-range glass-strength-range"
            type="range"
            min="0"
            max="100"
            step="1"
            value={settings.glassStrength}
            disabled={!settings.translucent}
            onChange={(event) => update('glassStrength', Number(event.target.value))}
            aria-label="材质强度"
          />
          <div className="range-labels"><span>磨砂</span><span>通透</span></div>
          <div className="setting-row"><div><strong>减少动态效果</strong><span>减弱位移动画，保留状态反馈</span></div><Toggle label="减少动态效果" checked={settings.reduceMotion} onChange={(value) => update('reduceMotion', value)} /></div>
        </section>

        <section className="settings-section glass-panel" aria-labelledby="launch-settings">
          <div className="settings-title"><span><Power size={19} aria-hidden="true" /></span><div><h2 id="launch-settings">启动</h2><p>管理资源分配与启动行为。</p></div></div>
          <div className="setting-row source-row">
            <div><strong><ShieldCheck size={16} aria-hidden="true" />默认版本隔离</strong><span>{ISOLATION_POLICIES.find((item) => item.id === settings.isolationPolicy)?.hint}</span></div>
            <Select
              ariaLabel="默认版本隔离"
              value={settings.isolationPolicy}
              options={ISOLATION_POLICIES.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(value) => update('isolationPolicy', value as IsolationPolicy)}
            />
          </div>
          <div className="setting-row source-row">
            <div><strong><Cpu size={16} aria-hidden="true" />游戏进程优先级</strong><span>{PROCESS_PRIORITIES.find((item) => item.id === settings.processPriority)?.hint}</span></div>
            <Select
              ariaLabel="游戏进程优先级"
              value={settings.processPriority}
              options={PROCESS_PRIORITIES.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(value) => update('processPriority', value as ProcessPriority)}
            />
          </div>
          <div className="setting-row source-row">
            <div><strong><Languages size={16} aria-hidden="true" />默认游戏语言</strong><span>新建实例首次启动的界面语言</span></div>
            <Select
              ariaLabel="默认游戏语言"
              value={gameLanguage}
              options={GAME_LANGUAGE_OPTIONS}
              onChange={(value) => onPatchSettings({ default_game_language: value })}
            />
          </div>
          <div className="setting-row memory-setting">
            <div><strong><MemoryStick size={16} aria-hidden="true" />内存分配</strong><span>{settings.autoMemory ? '自动按可用内存分配，作用于所有实例' : `所有实例默认 ${settings.memory} GB，可在实例设置里单独覆盖`}</span></div>
            <output htmlFor="memory-range">{settings.autoMemory ? '自动' : `${settings.memory} GB`}{memorySaving && <em className="save-hint">保存中…</em>}</output>
          </div>
          <input
            id="memory-range"
            className="memory-range"
            type="range"
            min="4"
            max="16"
            step="1"
            value={settings.memory}
            disabled={settings.autoMemory}
            onChange={(event) => handleMemory(Number(event.target.value))}
            aria-label="内存分配"
          />
          <div className="range-labels"><span>4 GB</span><span>16 GB</span></div>
          <div className="setting-row">
            <div><strong><Cpu size={16} aria-hidden="true" />自动分配内存</strong><span>开启后忽略上面的固定值，由启动器按可用内存决定</span></div>
            <Toggle label="自动分配内存" checked={settings.autoMemory} onChange={handleAutoMemory} />
          </div>
          <div className="setting-row"><div><strong><BellRing size={16} aria-hidden="true" />自动检查更新</strong><span>启动后及每 6 小时检查启动器版本更新</span></div><Toggle label="自动检查更新" checked={settings.autoCheck} onChange={(value) => update('autoCheck', value)} /></div>
          <div className="setting-row"><div><strong><MonitorUp size={16} aria-hidden="true" />启动后隐藏窗口</strong><span>运行后最小化启动器窗口</span></div><Toggle label="启动后隐藏窗口" checked={settings.closeAfterLaunch} onChange={(value) => update('closeAfterLaunch', value)} /></div>
        </section>

        <section className="settings-section glass-panel" aria-labelledby="download-settings">
          <div className="settings-title"><span><Globe size={19} aria-hidden="true" /></span><div><h2 id="download-settings">下载</h2><p>选择下载源与并发策略。</p></div></div>
          <div className="setting-row source-row">
            <div><strong><Download size={16} aria-hidden="true" />文件下载源</strong><span>{DOWNLOAD_SOURCE_OPTIONS.find((item) => item.value === fileSource)?.hint}</span></div>
            <Select
              ariaLabel="文件下载源"
              value={fileSource}
              options={DOWNLOAD_SOURCE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(value) => onPatchSettings({ minecraft_file_source: value })}
            />
          </div>
          <div className="setting-row source-row">
            <div><strong><Globe size={16} aria-hidden="true" />元数据源</strong><span>版本清单与载入器元数据的来源</span></div>
            <Select
              ariaLabel="元数据源"
              value={metaSource}
              options={DOWNLOAD_SOURCE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(value) => onPatchSettings({ minecraft_metadata_source: value })}
            />
          </div>
          <div className="setting-row source-row">
            <div><strong><HardDrive size={16} aria-hidden="true" />并发下载数</strong><span>同时进行的下载任务数（1-64）</span></div>
            <input className="number-input" type="number" min={1} max={64} aria-label="并发下载数" value={concurrent} onChange={(event) => onPatchSettings({ max_concurrent_downloads: Number(event.target.value) })} />
          </div>
          <div className="source-current"><span className="status-dot" aria-hidden="true" />当前：{isDesktop ? sourceLabel(fileSource) : '演示模式'}</div>
        </section>

        <section className="settings-section glass-panel java-section" aria-labelledby="java-settings">
          <div className="settings-title"><span><Cpu size={19} aria-hidden="true" /></span><div><h2 id="java-settings">Java 运行时</h2><p>管理启动游戏使用的 Java 环境。</p></div></div>
          {javaVersions.length ? (
            <div className="java-list">
              {javaVersions.map((item) => (
                <div className="java-row" key={`${item.path}-${item.parsed_version}`}>
                  <span className="java-icon"><Cpu size={15} aria-hidden="true" /></span>
                  <div className="java-copy">
                    <strong>Java {item.parsed_version}<em className="java-arch">{item.architecture}</em>{item.distribution && <em className="java-dist">{item.distribution}</em>}</strong>
                    <span>{item.path}</span>
                  </div>
                  {isDesktop && (
                    <button type="button" className="button secondary small pressable" data-ripple onClick={() => { void launcher.setJavaDefault(item.parsed_version, item.path).then(onRefreshJava); }}>
                      设为默认
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="java-empty"><ShieldCheck size={22} aria-hidden="true" /><span>未检测到 Java 运行时</span></div>
          )}
          {isDesktop && (
            <div className="java-auto-install">
              <div><strong>自动安装 Java</strong><span>从官方分发源下载并配置 Java 运行时</span></div>
              <div className="java-install-actions">
                <Select
                  ariaLabel="要安装的 Java 版本"
                  value={installMajor}
                  options={AUTO_INSTALL_MAJORS.map((major) => ({ value: major, label: `Java ${major}` }))}
                  onChange={(value) => setInstallMajor(value)}
                />
                <button type="button" className="button primary small pressable" data-ripple disabled={installingJava} onClick={() => void handleAutoInstallJava()}>
                  {installingJava ? '下载中…' : '安装'}
                </button>
              </div>
            </div>
          )}
          {maxMemory > 0 && <div className="environment-list"><div><span><Cpu size={16} aria-hidden="true" />本机可用内存</span><strong>{formatBytes(maxMemory)}</strong></div><div><span><MonitorUp size={16} aria-hidden="true" />界面渲染</span><strong>WebView2</strong></div><div><span><ShieldCheck size={16} aria-hidden="true" />桌面后端</span><strong>Rust · Tauri 2</strong></div></div>}
        </section>

        <section className="settings-section glass-panel" aria-labelledby="update-settings">
          <div className="settings-title"><span><RefreshCw size={19} aria-hidden="true" /></span><div><h2 id="update-settings">关于与更新</h2><p>检查并安装启动器的新版本。</p></div></div>
          <div className="setting-row">
            <div><strong><ShieldCheck size={16} aria-hidden="true" />当前版本</strong><span>Aster Launcher · Windows x64</span></div>
            <output className="version-value">v{updater.currentVersion}</output>
          </div>
          <div className="setting-row">
            <div><strong><RefreshCw size={16} aria-hidden="true" />检查更新</strong><span>{updateStatus}</span></div>
            <button
              type="button"
              className="button secondary small pressable"
              data-ripple
              disabled={!isDesktop || updater.phase === 'checking' || updateBusy}
              onClick={updater.checkNow}
            >
              {updater.phase === 'checking' ? '检查中…' : '检查更新'}
            </button>
          </div>
          {updater.available && (
            <div className="update-card">
              <div className="update-card-head">
                <strong>新版本 v{updater.available.version}</strong>
                {updateDateLabel && <span>{updateDateLabel}</span>}
              </div>
              {updater.available.notes && <p className="update-card-notes">{updater.available.notes}</p>}
              {(updater.phase === 'downloading' || updater.phase === 'installing') && (
                <div className="update-progress" role="progressbar" aria-label="更新进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={updatePercent ?? undefined}>
                  <span className={updatePercent === null ? 'is-indeterminate' : ''} style={updatePercent === null ? undefined : { width: `${updatePercent}%` }} />
                </div>
              )}
              <div className="update-card-actions">
                <button type="button" className="button primary small pressable" data-ripple disabled={updateBusy} onClick={updater.startUpdate}>
                  {updater.phase === 'downloading' ? '下载中…' : updater.phase === 'installing' || updater.phase === 'ready' ? '安装中…' : '立即更新'}
                </button>
                {!updateBusy && !updater.available.mandatory && (
                  <button type="button" className="button secondary small pressable" data-ripple onClick={updater.skipVersion}>跳过此版本</button>
                )}
              </div>
            </div>
          )}
          <div className="source-current">
            <span className={`status-dot${updater.phase === 'error' ? ' error' : updater.phase === 'checking' || updateBusy ? ' busy' : ''}`} aria-hidden="true" />
            {isDesktop ? '更新包由 GitHub Releases 提供，安装前经过 minisign 签名校验。' : '浏览器演示模式不支持自动更新，请在桌面端使用。'}
          </div>
        </section>
      </div>
    </div>
  );
}