import { useEffect } from 'react';

export function useRipple() {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest<HTMLElement>('[data-ripple]');
      if (!control || control.matches(':disabled')) return;

      const rect = control.getBoundingClientRect();
      // 波纹只做「点到哪里亮哪里」的轻提示：0.8 倍短边基准，
      // 避免大圆盘盖住整个按钮（1.5 倍时会溢出到按钮外）。
      const size = Math.max(rect.width, rect.height) * 0.8;
      const ink = document.createElement('span');
      ink.className = 'ripple-ink';
      ink.style.width = `${size}px`;
      ink.style.height = `${size}px`;
      ink.style.left = `${event.clientX - rect.left - size / 2}px`;
      ink.style.top = `${event.clientY - rect.top - size / 2}px`;
      control.appendChild(ink);
      // 动画结束即回收，避免为每次点击额外挂一个 560ms 定时器。
      ink.addEventListener('animationend', () => ink.remove(), { once: true });
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);
}
