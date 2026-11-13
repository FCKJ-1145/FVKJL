import brandMark from '../assets/brand-mark.png';

interface LogoProps {
  compact?: boolean;
}

export function Logo({ compact = false }: LogoProps) {
  return (
    <div className="brand" aria-label="FVKJL">
      {/* 品牌标直接用圆角应用图标，和 exe / 任务栏图标保持一致。
          draggable={false} 很关键：品牌区是窗口拖拽区，图片默认可拖动会抢走拖拽手势。 */}
      <img className="brand-mark" src={brandMark} alt="" aria-hidden="true" draggable={false} />
      {!compact && (
        <div className="brand-copy">
          <strong>FVKJL</strong>
          <span>Launcher</span>
        </div>
      )}
    </div>
  );
}
