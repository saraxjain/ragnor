// Small inline icon set (Material Symbols-style, outlined, 24px grid).
type P = { size?: number; className?: string; title?: string };
const svg = (path: React.ReactNode) =>
  function Icon({ size = 20, className, title }: P) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
        {title ? <title>{title}</title> : null}
        {path}
      </svg>
    );
  };

export const IconHeart = svg(<path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.3 1.1 4 2.3h3.2c.7-1.2 2-2.3 4-2.3C21 5 22.7 8.4 21.2 11.4 19 15.6 12 20 12 20z" />);
export const IconWave = svg(<path d="M2 12h3l2-5 3 10 3-8 2 3h7" />);
export const IconMoon = svg(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />);
export const IconShield = svg(<><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>);
export const IconPhone = svg(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />);
export const IconVideo = svg(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></>);
export const IconCamera = svg(<><path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>);
export const IconMic = svg(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>);
export const IconCheck = svg(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconAlert = svg(<><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4M12 17.5v.01" /></>);
export const IconChevron = svg(<path d="M9 6l6 6-6 6" />);
export const IconBack = svg(<path d="M15 6l-6 6 6 6" />);
export const IconHome = svg(<><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>);
export const IconUsers = svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>);
export const IconReport = svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>);
export const IconWatch = svg(<><rect x="6" y="6" width="12" height="12" rx="4" /><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 10v2l1.5 1" /></>);
export const IconBolt = svg(<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />);
export const IconSpark = svg(<path d="M12 3c.5 4 2.5 6.5 6.5 7.5-4 1-6 3.5-6.5 7.5-.5-4-2.5-6.5-6.5-7.5C9.5 9.5 11.5 7 12 3z" />);
export const IconClock = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconUpload = svg(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>);
export const IconPlay = svg(<path d="M8 5l11 7-11 7V5z" />);
export const IconStop = svg(<rect x="6" y="6" width="12" height="12" rx="2" />);
export const IconRefresh = svg(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>);
export const IconLock = svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconKnee = svg(<path d="M9 3v6c0 2 1 3 3 4l1 8M15 3v5c0 1.5-.5 2.5-1.5 3.5M11 21h5" />);
export const IconHeadset = svg(<><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>);
export const IconSchool = svg(<><path d="M2 9l10-5 10 5-10 5L2 9z" /><path d="M6 11v5c3 2.5 9 2.5 12 0v-5" /></>);
export const IconExternal = svg(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>);
export const IconInfo = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>);
