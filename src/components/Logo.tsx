interface LogoProps {
  compact?: boolean;
}

export function Logo({ compact = false }: LogoProps) {
  return (
    <div className="brand" aria-label="FVKJL">
      <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" fillOpacity="0.1" />
        <path d="M20 7.5C21.4 15.1 24.9 18.6 32.5 20C24.9 21.4 21.4 24.9 20 32.5C18.6 24.9 15.1 21.4 7.5 20C15.1 18.6 18.6 15.1 20 7.5Z" fill="currentColor" />
        <circle cx="20" cy="20" r="3.2" fill="#0B1019" />
      </svg>
      {!compact && (
        <div className="brand-copy">
          <strong>FVKJL</strong>
          <span>Launcher</span>
        </div>
      )}
    </div>
  );
}
