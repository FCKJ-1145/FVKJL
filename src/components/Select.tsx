import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  placeholder?: string;
  /** 触发器左侧的图标（例如实例选择器的层叠图标） */
  leading?: ReactNode;
}

/**
 * 统一下拉框。
 *
 * 原生 <select> 的展开层由系统绘制（Windows 上是白底高亮 + 系统字体），
 * 和这套玻璃 UI 完全不搭；这里改成自绘菜单：
 * - 触发按钮沿用 --control-bg / --border，展开层是玻璃面板 + 强调色选中项
 * - 菜单用 fixed + portal 渲染，避免被 .modal-scroll / .setting-row 的 overflow 裁掉
 * - 支持 Esc 关闭、上下键切换、点击外部关闭；滚动或窗口尺寸变化时关闭（fixed 定位会脱位）
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  size = 'md',
  disabled = false,
  placeholder = '请选择',
  leading,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    left: number;
    right: number;
    top: number;
    width: number;
    dropUp: boolean;
    alignRight: boolean;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  const openMenu = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const spaceBelow = window.innerHeight - box.bottom;
    const dropUp = spaceBelow < 260 && box.top > spaceBelow;
    // 靠近窗口右边时改为右对齐，菜单向左展开，否则会被 max-width 压窄、文字全部截断
    const spaceRight = window.innerWidth - box.right;
    setAnchor({
      left: box.left,
      right: window.innerWidth - box.right,
      top: dropUp ? box.top : box.bottom,
      width: box.width,
      dropUp,
      alignRight: spaceRight < 280,
    });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 捕获阶段拦下来，避免同一次 Esc 把外层弹窗也关掉
        event.stopPropagation();
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const index = options.findIndex((option) => option.value === value);
      const nextIndex = event.key === 'ArrowDown'
        ? Math.min(options.length - 1, index + 1)
        : Math.max(0, index - 1);
      if (index >= 0 && options[nextIndex]) onChange(options[nextIndex].value);
    };

    // 只有「页面滚动」才关闭；菜单自身滚动（长列表用滚轮翻）不能关
    const onScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, options, value, onChange]);

  return (
    <div className={`ui-select ${size === 'sm' ? 'ui-select-sm' : ''} ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-select-trigger pressable"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        {leading && <span className="ui-select-leading" aria-hidden="true">{leading}</span>}
        <span className="ui-select-value">{selected?.label ?? placeholder}</span>
        <ChevronDown size={15} className="ui-select-caret" aria-hidden="true" />
      </button>

      {open && anchor && createPortal(
        <div
          ref={menuRef}
          id={listId}
          className="ui-select-menu"
          role="listbox"
          aria-label={ariaLabel}
          style={{
            // 宽度按内容自适应（最短不窄于触发器），并保证不越出窗口
            minWidth: anchor.width,
            ...(anchor.alignRight
              ? { right: anchor.right, maxWidth: Math.min(460, window.innerWidth - anchor.right - 12) }
              : { left: anchor.left, maxWidth: Math.min(460, window.innerWidth - anchor.left - 12) }),
            ...(anchor.dropUp
              ? { bottom: window.innerHeight - anchor.top + 6 }
              : { top: anchor.top + 6 }),
          }}
        >
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="ui-select-option pressable"
              data-active={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
