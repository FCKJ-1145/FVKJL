import { Layers3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isDesktop } from '../lib/desktop';
import { fetchInstanceIcon } from '../lib/instanceSettings';
import type { InstanceInfo } from '../types';

/** 图标缓存：key = id + icon_path，换了图标自然换 key，不会显示旧图 */
const iconCache = new Map<string, string | null>();

export function invalidateInstanceIcon(instanceId: string) {
  for (const key of [...iconCache.keys()]) {
    if (key.startsWith(`${instanceId}:`)) iconCache.delete(key);
  }
}

export function useInstanceIcon(instance: InstanceInfo | null, size = 128) {
  const key = instance ? `${instance.id}:${instance.iconPath ?? ''}:${size}` : '';
  const [src, setSrc] = useState<string | null>(() => (key ? iconCache.get(key) ?? null : null));

  useEffect(() => {
    if (!instance || !isDesktop()) {
      setSrc(null);
      return;
    }
    const cached = iconCache.get(key);
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }
    let disposed = false;
    void fetchInstanceIcon(instance.id, size)
      .then((data) => {
        iconCache.set(key, data);
        if (!disposed) setSrc(data);
      })
      .catch(() => {
        iconCache.set(key, null);
      });
    return () => {
      disposed = true;
    };
  }, [instance, key, size]);

  return src;
}

interface InstanceIconProps {
  instance: InstanceInfo;
  size?: number;
  className?: string;
}

/** 实例图标：有自定义图标显示图片，否则退回默认的层叠图标 */
export function InstanceIcon({ instance, size = 19, className = 'instance-symbol' }: InstanceIconProps) {
  const src = useInstanceIcon(instance, 128);
  return (
    <span className={className}>
      {src
        ? <img className="instance-icon-image" src={src} alt="" loading="lazy" />
        : <Layers3 size={size} aria-hidden="true" />}
    </span>
  );
}
