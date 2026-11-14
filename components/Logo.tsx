// Ragnor mark from the team deck: concentric rings in a rounded square (a target: catching the signal early).
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="brand-mark" style={{ width: size, height: size }}>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="7.6" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}
