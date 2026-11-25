export type LiveCelebrationCategory = 'Birthday' | 'Wedding Anniversary' | 'Baptism Anniversary';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface IstCalendarParts {
  year: number;
  month: number;
  day: number;
  dateStr: string;
  displayDate: string;
}

export function getIstCalendarParts(now: Date = new Date()): IstCalendarParts {
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);
  const year = istShifted.getUTCFullYear();
  const month = istShifted.getUTCMonth() + 1;
  const day = istShifted.getUTCDate();
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const displayDate = `${day} ${months[month - 1] || ''} ${year}`.trim();
  return { year, month, day, dateStr, displayDate };
}

export function parseCelebrationMonthDay(rawVal: any): { year: number; month: number; day: number } | null {
  if (!rawVal) return null;

  if (typeof rawVal?.toDate === 'function') {
    const dt = rawVal.toDate();
    if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
      const ist = getIstCalendarParts(dt);
      return { year: ist.year, month: ist.month, day: ist.day };
    }
    return null;
  }

  if (rawVal instanceof Date) {
    if (Number.isNaN(rawVal.getTime())) return null;
    const ist = getIstCalendarParts(rawVal);
    return { year: ist.year, month: ist.month, day: ist.day };
  }

  if (typeof rawVal !== 'string') return null;
  const trimmed = rawVal.trim();
  if (!trimmed) return null;

  const clean = (trimmed.split('T')[0] || '').split(' ')[0] || '';
  const parts = clean.split(/[-/.]/);
  if (parts.length < 3) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  if (parts[0].length === 4) {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else if (parts[2].length === 4) {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  }

  if (Number.isNaN(month) || Number.isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year: Number.isNaN(year) ? 0 : year, month, day };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function matchesIstCelebrationDay(rawVal: any, ist: IstCalendarParts = getIstCalendarParts()): boolean {
  const parsed = parseCelebrationMonthDay(rawVal);
  if (!parsed) return false;
  if (parsed.month === ist.month && parsed.day === ist.day) return true;
  if (!isLeapYear(ist.year) && parsed.month === 2 && parsed.day === 29 && ist.month === 2 && ist.day === 28) {
    return true;
  }
  return false;
}

export function isEligibleCelebrationMember(data: any): boolean {
  if (!data) return false;
  if (data.isDeleted === true || data.deleted === true || data.archived === true) return false;
  const status = String(data.status || '').trim().toLowerCase();
  return !(
    status === 'inactive' ||
    status === 'deceased' ||
    status === 'deleted' ||
    status === 'archived' ||
    status === 'suspended' ||
    status === 'blocked' ||
    status === 'removed'
  );
}

export function extractTodaysCelebrants(allMembers: any[], ist: IstCalendarParts = getIstCalendarParts()): any[] {
  const seen = new Set<string>();
  const result: any[] = [];
  const uidByPhoneAndName = new Map<string, string>();

  for (const m of allMembers || []) {
    if (!isEligibleCelebrationMember(m)) continue;
    const displayName = String(m.Name || m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Member').trim();
    const last10 = String(m.directPhone || m.Phone || m.phone || m.mobile || '')
      .replace(/\D/g, '')
      .slice(-10);
    const uidKey = String(m.authUid || m.uid || '').trim();
    if (last10 && uidKey) {
      const k = `${last10}_${displayName.toLowerCase()}`;
      if (!uidByPhoneAndName.has(k)) uidByPhoneAndName.set(k, uidKey);
    }
  }

  for (const m of allMembers || []) {
    if (!isEligibleCelebrationMember(m)) continue;

    const rawId = String(m.Id || m.id || m.uid || m.authUid || '').trim() || 'member';
    const displayName = String(m.Name || m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Member').trim();
    const last10 = String(m.directPhone || m.Phone || m.phone || m.mobile || '')
      .replace(/\D/g, '')
      .slice(-10);
    const nameKey = displayName.toLowerCase();
    const uidKey =
      String(m.authUid || m.uid || '').trim() ||
      (last10 ? uidByPhoneAndName.get(`${last10}_${nameKey}`) || '' : '');
    const personKey = uidKey || (last10 ? `${last10}_${nameKey}` : rawId);

    const bDate = m.Birthdate || m.dob || m.birthdate || m.dateOfBirth || m.birthday;
    const aDate =
      m.Anniversary_Date__c ||
      m.anniversaryDate ||
      m.anniversary_date ||
      m.marriageDate ||
      m.weddingAnniversary ||
      m.wedding_anniversary ||
      m.anniversary;
    const bapDate = m.Baptism_Date__c || m.baptismDate || m.baptism_date || m.baptism;

    const checks: Array<{ raw: any; suffix: string; type: LiveCelebrationCategory }> = [
      { raw: bDate, suffix: 'bday', type: 'Birthday' },
      { raw: aDate, suffix: 'anniv', type: 'Wedding Anniversary' },
      { raw: bapDate, suffix: 'bap', type: 'Baptism Anniversary' },
    ];

    for (const chk of checks) {
      if (!matchesIstCelebrationDay(chk.raw, ist)) continue;
      const dedupeKey = `${personKey}_${chk.suffix}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      result.push({
        ...m,
        id: `${rawId}_${chk.suffix}`,
        memberId: rawId,
        Id: m.Id || rawId,
        Name: displayName,
        name: displayName,
        type: chk.type,
        celebrationType: chk.type,
      });
    }
  }

  return result;
}

/**
 * Returns crisp foreground text color for celebration card backgrounds.
 * Prevents white-on-white unreadable text on light themes such as "Elegant White".
 */
export function getCelebrationCardTextColor(bgColors: string[], hasBgPhoto: boolean): string {
  if (hasBgPhoto) return '#FFFFFF';
  const hex = String(bgColors?.[0] || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#FFFFFF';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.78 ? '#1E293B' : '#FFFFFF';
}

export interface CelebrationWhatsAppMessageParams {
  memberName?: string | null;
  nameOverlay?: string | null;
  celebrationType?: string | null;
  titleOverlay?: string | null;
  dateStr?: string | null;
  age?: number | string | null;
  greetingMessage?: string | null;
  verse?: { ref?: string | null; text?: string | null } | null;
  churchName?: string | null;
}

function formatOrdinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const lastDigit = n % 10;
  if (lastDigit === 1) return `${n}st`;
  if (lastDigit === 2) return `${n}nd`;
  if (lastDigit === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Normalizes a phone number into international digits (defaulting 10-digit numbers to India +91)
 * for WhatsApp deep linking. Returns empty string when no dialable digits exist.
 */
export function formatWhatsAppPhoneNumber(rawPhone?: string | null): string {
  const raw = String(rawPhone || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  if (digits.startsWith('910') && digits.length === 13) {
    digits = `91${digits.slice(3)}`;
  }
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  return digits.length >= 7 ? digits : '';
}

/**
 * Builds the complete personalized WhatsApp celebration message including recipient name,
 * celebration type & date/milestone details, prepared greeting, Scripture verse, and church sign-off.
 */
export function buildCelebrationWhatsAppMessage(params: CelebrationWhatsAppMessageParams): string {
  const recipientName =
    String(params.nameOverlay || '').trim() ||
    String(params.memberName || '').trim() ||
    'Dear Member';

  const rawCategory = String(params.celebrationType || 'Birthday').trim() || 'Birthday';
  const lowerCategory = rawCategory.toLowerCase();
  const isWeddingAnniversary =
    lowerCategory.includes('wedding') ||
    (lowerCategory.includes('anniversary') && !lowerCategory.includes('baptism'));
  const isBaptismAnniversary = lowerCategory.includes('baptism');

  const emoji = isWeddingAnniversary ? '💐' : isBaptismAnniversary ? '🕊️' : '🎂';
  const canonicalCategory = isWeddingAnniversary
    ? 'Wedding Anniversary'
    : isBaptismAnniversary
      ? 'Baptism Anniversary'
      : 'Birthday';

  const title = String(params.titleOverlay || '').trim() || `Happy ${canonicalCategory}!`;
  const cleanDate = String(params.dateStr || '').trim();
  const datePart = cleanDate && cleanDate !== '--' ? cleanDate : '';

  const rawAge = params.age;
  const parsedAge = rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== '' ? Number(rawAge) : NaN;
  let milestonePart = '';
  if (!Number.isNaN(parsedAge) && parsedAge > 0) {
    if (isWeddingAnniversary) {
      milestonePart = `${formatOrdinalSuffix(parsedAge)} Anniversary`;
    } else if (isBaptismAnniversary) {
      milestonePart = `${parsedAge} ${parsedAge === 1 ? 'yr' : 'yrs'} in Christ`;
    } else {
      milestonePart = `Turning ${parsedAge} yrs`;
    }
  }

  const detailSegments = [canonicalCategory, datePart, milestonePart].filter(Boolean);
  const firstName = recipientName.split(/\s+/)[0] || recipientName;

  let body = String(params.greetingMessage || '').trim();
  if (!body) {
    if (isWeddingAnniversary) {
      body = `Dear ${firstName}, wishing you a joyful Wedding Anniversary! May God continue to bless your marriage with love, peace, and happiness.`;
    } else if (isBaptismAnniversary) {
      body = `Dear ${firstName}, happy Baptism Anniversary! May you continue to grow in faith and walk in God's grace.`;
    } else {
      body = `Dear ${firstName}, wishing you a joy-filled birthday surrounded by God's love and grace. May this new year of life be your best yet!`;
    }
  }

  const lines: string[] = [
    'Praise the Lord! 🙏',
    '',
    `${emoji} *${title}*`,
    `*For:* ${recipientName}`,
    `*Celebration:* ${detailSegments.join(' • ')}`,
    '',
    body,
  ];

  const verseText = String(params.verse?.text || '').trim();
  const verseRef = String(params.verse?.ref || '').trim();
  if (verseText) {
    lines.push('');
    lines.push(`_"${verseText}"_${verseRef ? `\n— ${verseRef}` : ''}`);
  }

  const church = String(params.churchName || '').trim() || 'Your Church';
  lines.push('');
  lines.push(`With Love ❤️\n${church}`);

  return lines.join('\n');
}

/**
 * Builds properly URI-encoded WhatsApp deep links (`whatsapp://send`, `api.whatsapp.com`, `wa.me`).
 */
export function buildWhatsAppDeepLinkUrls(
  formattedPhone: string,
  messageText: string
): { schemeUrl: string; apiUrl: string; waMeUrl: string } {
  const cleanPhone = String(formattedPhone || '').replace(/\D/g, '');
  const trimmedText = String(messageText || '').trim();
  const encodedText = encodeURIComponent(trimmedText);
  const phonePrefix = cleanPhone ? `phone=${cleanPhone}&` : '';

  return {
    schemeUrl: `whatsapp://send?${phonePrefix}text=${encodedText}`,
    apiUrl: `https://api.whatsapp.com/send?${phonePrefix}text=${encodedText}`,
    waMeUrl: cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`,
  };
}


