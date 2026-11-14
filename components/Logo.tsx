// Ragnor mark: a shield-shaped ring with a pulse line. Original design.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="brand-mark">
      <defs>
        <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b57d0" />
          <stop offset="1" stopColor="#00a3ad" />
        </linearGradient>
      </defs>
      <path d="M16 2.5l11 4.2v8.1c0 6.6-4.6 12.2-11 14.7C9.6 27 5 21.4 5 14.8V6.7l11-4.2z" fill="url(#rg)" />
      <path d="M8.5 16h4l2-4.5 3 9 2-4.5h4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
