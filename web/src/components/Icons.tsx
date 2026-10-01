/**
 * 线性图标集（对齐 Ardot 设计稿的矢量图标风格）
 * 统一 stroke 描边、currentColor 取色，尺寸通过 size 控制。
 */
interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  xmlns: 'http://www.w3.org/2000/svg',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconMenu({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconChat({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L4 21l1.9-4.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

export function IconContacts({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function IconPlus({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSettings({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function IconSearch({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconMore({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSend({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 12 20 4l-8 16-2.4-6.2L4 12Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconEmoji({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 14.2a3.8 3.8 0 0 0 6 0" />
      <circle cx="9.2" cy="9.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="9.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconAttach({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20.4 11.7 12 20a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3" />
    </svg>
  );
}

export function IconStop({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconBack({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14.5 5 8 12l6.5 7" />
    </svg>
  );
}

export function IconChevronRight({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9.5 5 16 12l-6.5 7" />
    </svg>
  );
}

export function IconDocument({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function IconSparkle({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M18.4 5.6l-2.5 2.5M8.1 15.9l-2.5 2.5" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function IconUpload({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function IconClose({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4.5 12.5 9 17l10.5-10.5" />
    </svg>
  );
}

export function IconCheckDouble({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={2}>
      <path d="M2 12.5 6 16.5 13.5 8" />
      <path d="M10 14.5 12 16.5 21 7" />
    </svg>
  );
}

export function IconUser({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function IconPhone({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6.6 3.5h2.2l1.5 3.7-1.9 1.4a10.4 10.4 0 0 0 5 5l1.4-1.9 3.7 1.5v2.2a2 2 0 0 1-2.2 2 15.5 15.5 0 0 1-13.7-13.7 2 2 0 0 1 2-2.2Z" />
    </svg>
  );
}

export function IconInfo({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconVideo({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="6.5" width="12" height="11" rx="2.5" />
      <path d="M15 11l5.5-3v8L15 13" />
    </svg>
  );
}

export function IconVoice({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}

export function IconGroup({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M17.5 19a5.6 5.6 0 0 0-1.4-3.6" />
    </svg>
  );
}

export function IconBell({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15L18 15.5Z" />
      <path d="M10 20.5a2.3 2.3 0 0 0 4 0" />
    </svg>
  );
}

export function IconTrash({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 12.2a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8L17.5 7" />
    </svg>
  );
}

export function IconBrain({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5.2a3 3 0 0 0-5.6 1.3A3 3 0 0 0 5 12a3 3 0 0 0 1.7 4.9A3 3 0 0 0 12 18.8V5.2Z" />
      <path d="M12 5.2a3 3 0 0 1 5.6 1.3A3 3 0 0 1 19 12a3 3 0 0 1-1.7 4.9A3 3 0 0 1 12 18.8" />
    </svg>
  );
}

export function IconLogout({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" />
      <path d="M17 8.5 20.5 12 17 15.5M20.5 12H11" />
    </svg>
  );
}
