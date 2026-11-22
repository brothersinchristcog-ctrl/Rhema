import { ThemeAppearance } from '../../../context/ThemeContext';

export interface ChatThemePalette {
  isDark: boolean;
  appearance: ThemeAppearance;
  bg: string;
  bgGradient: readonly [string, string, string];
  surface: string;
  glassBg: string;
  glassStrong: string;
  glassBorder: string;
  blurTint: 'dark' | 'light';
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  incomingBubbleBg: string;
  incomingBubbleBorder: string;
  incomingText: string;
  outgoingBubbleBg: string;
  outgoingBubbleBorder: string;
  outgoingText: string;
  filterActiveBg: string;
  filterActiveText: string;
  filterInactiveBg: string;
  filterInactiveText: string;
  onlineDot: string;
  timestampGreen: string;
  unreadBadgeBg: string;
  unreadBadgeText: string;
  tickMuted: string;
  tickRead: string;
  inputBg: string;
  inputPlaceholder: string;
  danger: string;
  systemPillBg: string;
  systemPillText: string;
}

export function getChatThemePalette(
  appearance: ThemeAppearance,
  accentColor: string,
  isDark: boolean
): ChatThemePalette {
  const safeAccent = accentColor || (isDark ? '#38BDF8' : '#2563EB');

  if (isDark || appearance === 'pure_dark') {
    return {
      isDark: true,
      appearance: 'pure_dark',
      bg: '#090B0E',
      bgGradient: ['#161A1E', '#0D1014', '#080A0C'],
      surface: '#14171C',
      glassBg: 'rgba(28, 32, 38, 0.72)',
      glassStrong: 'rgba(34, 39, 46, 0.88)',
      glassBorder: 'rgba(255, 255, 255, 0.12)',
      blurTint: 'dark',
      text: '#FFFFFF',
      textSecondary: '#A1A1AA',
      textMuted: '#71717A',
      accent: safeAccent,
      accentText: '#FFFFFF',
      incomingBubbleBg: 'rgba(255, 255, 255, 0.09)',
      incomingBubbleBorder: 'rgba(255, 255, 255, 0.08)',
      incomingText: '#F4F4F5',
      outgoingBubbleBg: 'rgba(255, 255, 255, 0.17)',
      outgoingBubbleBorder: 'rgba(255, 255, 255, 0.14)',
      outgoingText: '#FFFFFF',
      filterActiveBg: '#FFFFFF',
      filterActiveText: '#090B0E',
      filterInactiveBg: 'rgba(255, 255, 255, 0.08)',
      filterInactiveText: '#D4D4D8',
      onlineDot: '#22C55E',
      timestampGreen: '#4ADE80',
      unreadBadgeBg: '#EF4444',
      unreadBadgeText: '#FFFFFF',
      tickMuted: 'rgba(255, 255, 255, 0.55)',
      tickRead: '#38BDF8',
      inputBg: 'rgba(255, 255, 255, 0.08)',
      inputPlaceholder: '#8E8E93',
      danger: '#EF4444',
      systemPillBg: 'rgba(255, 255, 255, 0.07)',
      systemPillText: '#A1A1AA',
    };
  }

  if (appearance === 'warm_white') {
    return {
      isDark: false,
      appearance: 'warm_white',
      bg: '#F2EAE0',
      bgGradient: ['#F7F1E9', '#F2EAE0', '#ECE1D3'],
      surface: '#FAF6F0',
      glassBg: 'rgba(250, 246, 240, 0.84)',
      glassStrong: 'rgba(250, 246, 240, 0.94)',
      glassBorder: 'rgba(214, 203, 187, 0.9)',
      blurTint: 'light',
      text: '#111827',
      textSecondary: '#64748B',
      textMuted: '#94A3B8',
      accent: safeAccent,
      accentText: '#FFFFFF',
      incomingBubbleBg: '#FAF6F0',
      incomingBubbleBorder: '#E2D9CC',
      incomingText: '#111827',
      outgoingBubbleBg: safeAccent,
      outgoingBubbleBorder: safeAccent,
      outgoingText: '#FFFFFF',
      filterActiveBg: '#111827',
      filterActiveText: '#FFFFFF',
      filterInactiveBg: 'rgba(250, 246, 240, 0.9)',
      filterInactiveText: '#475569',
      onlineDot: '#16A34A',
      timestampGreen: '#15803D',
      unreadBadgeBg: '#EF4444',
      unreadBadgeText: '#FFFFFF',
      tickMuted: 'rgba(255, 255, 255, 0.72)',
      tickRead: '#BAE6FD',
      inputBg: 'rgba(250, 246, 240, 0.92)',
      inputPlaceholder: '#64748B',
      danger: '#DC2626',
      systemPillBg: 'rgba(17, 24, 39, 0.06)',
      systemPillText: '#475569',
    };
  }

  // pure_white
  return {
    isDark: false,
    appearance: 'pure_white',
    bg: '#FFFFFF',
    bgGradient: ['#F8FAFC', '#FFFFFF', '#F1F5F9'],
    surface: '#FFFFFF',
    glassBg: 'rgba(255, 255, 255, 0.86)',
    glassStrong: 'rgba(255, 255, 255, 0.96)',
    glassBorder: 'rgba(226, 232, 240, 0.95)',
    blurTint: 'light',
    text: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    accent: safeAccent,
    accentText: '#FFFFFF',
    incomingBubbleBg: '#F1F5F9',
    incomingBubbleBorder: '#E2E8F0',
    incomingText: '#0F172A',
    outgoingBubbleBg: safeAccent,
    outgoingBubbleBorder: safeAccent,
    outgoingText: '#FFFFFF',
    filterActiveBg: '#0F172A',
    filterActiveText: '#FFFFFF',
    filterInactiveBg: '#F1F5F9',
    filterInactiveText: '#475569',
    onlineDot: '#16A34A',
    timestampGreen: '#15803D',
    unreadBadgeBg: '#EF4444',
    unreadBadgeText: '#FFFFFF',
    tickMuted: 'rgba(255, 255, 255, 0.72)',
    tickRead: '#BAE6FD',
    inputBg: '#F8FAFC',
    inputPlaceholder: '#94A3B8',
    danger: '#DC2626',
    systemPillBg: 'rgba(15, 23, 42, 0.06)',
    systemPillText: '#475569',
  };
}

export const RHEMA_GROUP_PRESETS = [
  { name: 'Worship Team', category: 'team' as const, description: 'Worship leaders, vocalists & Sunday service coordination' },
  { name: 'Songs Team', category: 'team' as const, description: 'Setlists, lyrics, chords & song practice updates' },
  { name: 'Prayer Team', category: 'team' as const, description: 'Intercessory prayer chain & weekly prayer schedules' },
  { name: 'Music Team', category: 'team' as const, description: 'Instrumentalists, sound check & rehearsal timings' },
  { name: 'Media Team', category: 'team' as const, description: 'Projection, livestream, photography & stage graphics' },
  { name: 'Youth Team', category: 'team' as const, description: 'Youth fellowship, outreach & events' },
  { name: 'Church Volunteers', category: 'team' as const, description: 'Ushers, hospitality, welcoming & logistics volunteers' },
];

export const QUICK_REACTION_EMOJIS = ['🙏', '❤️', '🔥', '🙌', '😂', '👍'];
