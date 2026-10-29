/**
 * Formats a YYYY-MM-DD date string to DD-MM-YYYY for display in the UI.
 * This ensures the underlying data remains easily sortable and queryable in Firebase,
 * while the UI presents it in a more user-friendly format for this region.
 * 
 * @param dateString The YYYY-MM-DD string
 * @returns The DD-MM-YYYY formatted string, or the original string if not matched
 */
export const formatDateDisplay = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  
  // Handle cases where time is appended (e.g. "YYYY-MM-DD • 10:00 AM" or "DD-MM-YYYY • 10:00 AM")
  let separator = '';
  if (dateString.includes(' • ')) separator = ' • ';
  else if (dateString.includes('   ')) separator = '   ';
  else if (dateString.includes(' ? ')) separator = ' ? ';

  const dateParts = separator ? dateString.split(separator) : [dateString];
  const actualDate = dateParts[0]?.split('T')[0]?.trim() || '';
  const timeSuffix = dateParts.length > 1 ? ` • ${dateParts.slice(1).join(separator).trim()}` : '';
  
  const parts = actualDate.split('-');
  if (parts.length === 3 && parts[0]?.length === 4) {
    const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return `${formattedDate}${timeSuffix}`;
  }
  
  return `${actualDate}${timeSuffix}`;
};

/**
 * Safely parses any date string (YYYY-MM-DD or DD-MM-YYYY) into a local Date object.
 * By setting the time explicitly to local noon (12:00:00), it completely avoids
 * midnight UTC / local timezone boundary day-shifting errors.
 * 
 * @param dateStr Raw date string (e.g. "2026-10-19" or "19-10-2026")
 * @returns Local Date object set at 12:00:00
 */
export const parseLocalDate = (dateStr: string | null | undefined): Date => {
  if (!dateStr) return new Date();
  
  const cleanStr = String(dateStr).trim().split(' ')[0].split('T')[0];
  const parts = cleanStr.split('-');
  
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day, 12, 0, 0);
      }
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day, 12, 0, 0);
      }
    }
  }

  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

/**
 * Normalizes any Date or date string to standard "YYYY-MM-DD" format.
 * Prevents timezone shifting caused by toISOString() or native UTC conversions.
 * 
 * @param date Date object or string
 * @returns Standard "YYYY-MM-DD" string
 */
export const toStandardDateString = (date: Date | string | null | undefined): string => {
  if (!date) return '';
  if (typeof date === 'string') {
    const cleanStr = date.trim().split(' ')[0].split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return cleanStr;
    }
    if (parts.length === 3 && parts[2].length === 4) {
      // DD-MM-YYYY -> YYYY-MM-DD
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return date;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Formats a sermon duration string or number into a user-friendly format with unit.
 * Examples:
 *  - "120" -> "2 hours"
 *  - "120 min" / "120 minutes" -> "2 hours"
 *  - "60" -> "1 hour"
 *  - "90" -> "1 hr 30 min"
 *  - "50" -> "50 min"
 *  - "45 mins" -> "45 min"
 *  - "01:30:00" -> "1 hr 30 min"
 * 
 * @param val Raw duration string or number
 * @returns Formatted duration string with appropriate unit
 */
export const formatSermonDuration = (val: string | number | null | undefined): string => {
  if (!val) return '';
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'n/a') return '';

  // Check if it's a number, or number with min/mins/minute/minutes/m
  const match = str.match(/^(\d+)\s*(mins?|minutes?|m)?$/i);
  if (match) {
    const totalMins = parseInt(match[1], 10);
    if (isNaN(totalMins) || totalMins <= 0) return '';
    
    if (totalMins < 60) {
      return `${totalMins} min`;
    }
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (mins === 0) {
      return hrs === 1 ? '1 hour' : `${hrs} hours`;
    }
    return `${hrs} hr ${mins} min`;
  }

  // Check if it's formatted like "hh:mm:ss" or "mm:ss"
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    if (timeMatch[3] !== undefined) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      if (h > 0 && m > 0) return `${h} hr ${m} min`;
      if (h > 0) return h === 1 ? '1 hour' : `${h} hours`;
      return `${m} min`;
    } else {
      const first = parseInt(timeMatch[1], 10);
      const second = parseInt(timeMatch[2], 10);
      return `${first} min ${second}s`;
    }
  }

  return str;
};

/**
 * Determines whether a sermon is currently visible to church members.
 * 
 * Visibility Rules:
 *  - Drafts are NEVER visible to members.
 *  - Published sermons are ALWAYS visible to members.
 *  - Scheduled sermons:
 *      1. If `scheduledPublishAt` exists: checks whether the scheduled timestamp has arrived (<= now).
 *      2. If `scheduledDate` (and optional `scheduledTime`) exists: checks against current local date & time.
 *      3. Fallback for legacy sermons: checks `date > todayStr`.
 * 
 * @param s Sermon document or object
 * @returns boolean true if members can view this sermon, false if hidden/scheduled for future
 */
export const isSermonVisibleToMembers = (s: any): boolean => {
  if (!s) return false;
  if (s.status === 'Draft') return false;
  if (s.status === 'Scheduled') {
    const now = new Date();

    // 1. Check ISO or millisecond timestamp scheduledPublishAt
    if (s.scheduledPublishAt) {
      const pubMillis = typeof s.scheduledPublishAt === 'number'
        ? s.scheduledPublishAt
        : (s.scheduledPublishAt?.toMillis ? s.scheduledPublishAt.toMillis() : new Date(s.scheduledPublishAt).getTime());
      if (!isNaN(pubMillis)) {
        return pubMillis <= now.getTime();
      }
    }

    // 2. Check scheduledDate (YYYY-MM-DD or DD-MM-YYYY)
    if (s.scheduledDate) {
      const stdSchedDate = toStandardDateString(s.scheduledDate);
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (stdSchedDate > todayStr) return false;
      if (stdSchedDate < todayStr) return true;

      // Same day: check scheduledTime if present (e.g. "08:00 PM" or "20:00")
      if (s.scheduledTime) {
        const timeMatch = String(s.scheduledTime).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const mins = parseInt(timeMatch[2], 10);
          const ampm = timeMatch[3]?.toUpperCase();
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          
          const currentHours = now.getHours();
          const currentMins = now.getMinutes();
          if (currentHours < hours || (currentHours === hours && currentMins < mins)) {
            return false;
          }
        }
      }
      return true;
    }

    // 3. Fallback for legacy sermons where scheduledDate was not set separately
    if (s.date) {
      const stdDate = toStandardDateString(s.date);
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (stdDate > todayStr) return false;
    }
  }
  return true;
};

/**
 * Formats any date, ISO timestamp, Firestore Timestamp, or epoch milliseconds
 * to user-friendly "DD-MM-YYYY at hh:mm AM/PM" format.
 * 
 * @param val Raw date object, timestamp, ISO string or number
 * @returns Formatted string (e.g. "29-10-2026 at 05:47 PM"), or empty string if invalid
 */
export const formatDateTimeDisplay = (val: any): string => {
  if (!val) return '';
  let d = null;
  if (typeof val.toDate === 'function') {
    d = val.toDate();
  } else if (val._seconds) {
    d = new Date(val._seconds * 1000);
  } else if (val.seconds) {
    d = new Date(val.seconds * 1000);
  } else if (typeof val === 'number') {
    d = new Date(val > 1e11 ? val : val * 1000);
  } else if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'string') {
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
  }

  if (!d || isNaN(d.getTime())) return '';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hourStr = String(hours).padStart(2, '0');

  return day + '-' + month + '-' + year + ' at ' + hourStr + ':' + mins + ' ' + ampm;
};
