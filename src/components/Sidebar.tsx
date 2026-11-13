import { Compass, Home, Images, Layers3, Settings2, UserRound } from 'lucide-react';
import type { View } from '../types';
import { Logo } from './Logo';

interface SidebarProps {
  view: View;
  onChange: (view: View) => void;
  onProfile: () => void;
}

const navigation = [
  { id: 'home' as const, label: '首页', icon: Home },
  { id: 'discover' as const, label: '发现内容', icon: Compass },
  { id: 'instances' as const, label: '实例库', icon: Layers3 },
  { id: 'screenshots' as const, label: '截图中心', icon: Images },
];

export function Sidebar({ view, onChange, onProfile }: SidebarProps) {
  return (
    <aside className="sidebar">
      {/* 品牌区整块可拖（含 Logo），不再只认点在空白处 */}
      <div className="sidebar-brand" data-tauri-drag-region="deep">
        <Logo />
      </div>
      <nav className="sidebar-nav" aria-label="主导航">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={`nav-item pressable ${view === id ? 'active' : ''}`}
            data-ripple
            aria-current={view === id ? 'page' : undefined}
            aria-label={label}
            onClick={() => onChange(id)}
          >
            <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          key="settings"
          className={`nav-item pressable ${view === 'settings' ? 'active' : ''}`}
          data-ripple
          aria-current={view === 'settings' ? 'page' : undefined}
          aria-label="设置"
          onClick={() => onChange('settings')}
        >
          <Settings2 size={19} strokeWidth={1.8} aria-hidden="true" />
          <span>设置</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="profile-button pressable" data-ripple onClick={onProfile} aria-label="查看本地账户">
          <span className="avatar"><UserRound size={17} aria-hidden="true" /></span>
          <span className="profile-copy">
            <strong>本地用户</strong>
            <span>离线模式</span>
          </span>
          <span className="profile-status" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}