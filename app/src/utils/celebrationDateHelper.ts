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
