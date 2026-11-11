import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Share } from 'react-native';
import * as SMS from 'expo-sms';
import {
  extractDigits,
  formatPhoneE164,
  normalizePhone10,
  stripGuestSuffix,
} from '../utils/phoneUtils';

export const PENDING_GUEST_INVITE_KEY = '@pending_guest_invite';

export const INVITE_HTTPS_BASE = 'https://rhema-global-ministries.web.app/invite';
export const INVITE_SCHEME_BASE = 'rhema://invite';
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.rhemaglobalministries.app';
export const APP_STORE_URL =
  'https://apps.apple.com/search?term=Rhema%20Global%20Ministries';

export interface PendingGuestInvite {
  churchId: string;
  churchName?: string;
  inviteId: string;
  phone: string;
  phone10: string;
  guestName?: string;
  relation?: string;
  invitedByMemberName?: string;
  eventId?: string;
  receivedAt?: number;
  rawUrl?: string;
}

const parseQueryParams = (queryString: string): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!queryString) return result;
  const clean = queryString.replace(/^[?#]/, '');
  for (const pair of clean.split('&')) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    const rawKey = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
    const rawVal = eqIdx >= 0 ? pair.slice(eqIdx + 1) : '';
    try {
      const k = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      const v = decodeURIComponent(rawVal.replace(/\+/g, ' '));
      if (k) result[k] = v;
    } catch {
      if (rawKey) result[rawKey] = rawVal;
    }
  }
  return result;
};

class InviteLinkService {
  /**
   * Builds the personalized universal HTTPS invitation link for a church guest.
   */
  public buildGuestInviteUrl(params: {
    churchId: string;
    phone?: string;
    inviteId?: string;
    eventId?: string;
  }): string {
    const inviteId = normalizePhone10(params.inviteId || params.phone || '');
    const queryParts: string[] = [];
    if (params.churchId) {
      queryParts.push(`c=${encodeURIComponent(params.churchId)}`);
    }
    if (inviteId) {
      queryParts.push(`i=${encodeURIComponent(inviteId)}`);
    }
    if (params.eventId) {
      queryParts.push(`e=${encodeURIComponent(params.eventId)}`);
    }
    return `${INVITE_HTTPS_BASE}?${queryParts.join('&')}`;
  }

  public buildAppSchemeInviteUrl(params: {
    churchId: string;
    phone?: string;
    inviteId?: string;
    eventId?: string;
  }): string {
    const inviteId = normalizePhone10(params.inviteId || params.phone || '');
    const queryParts: string[] = [];
    if (params.churchId) {
      queryParts.push(`c=${encodeURIComponent(params.churchId)}`);
    }
    if (inviteId) {
      queryParts.push(`i=${encodeURIComponent(inviteId)}`);
    }
    if (params.eventId) {
      queryParts.push(`e=${encodeURIComponent(params.eventId)}`);
    }
    return `${INVITE_SCHEME_BASE}?${queryParts.join('&')}`;
  }

  /**
   * Parses custom scheme (`rhema://invite?...`) or HTTPS app/universal links
   * (`https://rhema-global-ministries.web.app/invite?...`) cleanly without throwing.
   */
  public parseInviteUrl(url?: string | null): PendingGuestInvite | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();
    const isInvitePath =
      lower.includes('://invite') ||
      lower.includes('/invite?') ||
      lower.endsWith('/invite');

    if (!isInvitePath && !lower.includes('referrer=')) {
      return null;
    }

    const qIdx = trimmed.indexOf('?');
    const queryStr = qIdx >= 0 ? trimmed.slice(qIdx + 1) : '';
    let params = parseQueryParams(queryStr);

    if (params.referrer && !params.i && !params.c) {
      const refParams = parseQueryParams(params.referrer);
      params = { ...params, ...refParams };
    }

    const churchId = (params.c || params.churchId || '').trim();
    const rawPhone = params.i || params.inviteId || params.p || params.phone || '';
    const phone10 = normalizePhone10(rawPhone);
    const phone = phone10 ? formatPhoneE164(rawPhone || phone10) : '';

    if (!churchId && !phone10) return null;

    return {
      churchId,
      inviteId: phone10,
      phone,
      phone10,
      guestName: stripGuestSuffix(params.n || params.name || ''),
      relation: (params.r || params.relation || '').trim(),
      eventId: (params.e || params.eventId || '').trim(),
      receivedAt: Date.now(),
      rawUrl: trimmed,
    };
  }

  public async savePendingInvite(invite: PendingGuestInvite): Promise<void> {
    try {
      await AsyncStorage.setItem(PENDING_GUEST_INVITE_KEY, JSON.stringify(invite));
    } catch (e) {
      console.warn('[InviteLinkService] Failed saving pending invite:', e);
    }
  }

  public async getPendingInvite(): Promise<PendingGuestInvite | null> {
    try {
      const raw = await AsyncStorage.getItem(PENDING_GUEST_INVITE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PendingGuestInvite;
    } catch {
      return null;
    }
  }

  public async clearPendingInvite(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PENDING_GUEST_INVITE_KEY);
    } catch {
      // Ignore clear failures
    }
  }

  /**
   * Builds a personalized WhatsApp / SMS / Share invitation text containing
   * both the direct invite link (deep link + landing) and Play Store / App Store links.
   */
  public buildInviteShareText(params: {
    guestName: string;
    churchName: string;
    inviteLink: string;
    phone?: string;
    invitedByName?: string;
  }): string {
    const cleanName = stripGuestSuffix(params.guestName) || 'Friend';
    const church = (params.churchName || 'Rhema Global Ministries').trim();
    const phone10 = normalizePhone10(params.phone || '');
    const inviterLine = params.invitedByName
      ? `${params.invitedByName} invited you as a guest at ${church}!`
      : `You are warmly invited as a guest at ${church}!`;

    return `Greetings in Jesus' Name! 🙏

Dear ${cleanName},

${inviterLine} ⛪

Your guest profile is ready - no registration form is needed. Open your personal invitation link and sign in with your mobile number (${phone10 || params.phone || ''}):

Personal Invitation Link:
${params.inviteLink}

Download the Rhema App:
- Android: ${PLAY_STORE_URL}
- iOS: ${APP_STORE_URL}

May God bless you!`;
  }

  public async shareViaWhatsApp(params: {
    phone?: string;
    text: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const rawDigits = extractDigits(params.phone);
    const digits = rawDigits.startsWith('00') ? rawDigits.slice(2) : rawDigits;
    let waPhone = digits;
    if (digits.length === 10) {
      waPhone = `91${digits}`;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      waPhone = `91${digits.slice(1)}`;
    }

    if (!waPhone || waPhone.length < 10) {
      return {
        ok: false,
        error: 'A valid 10-digit guest mobile number is required for WhatsApp invite.',
      };
    }

    const encodedText = encodeURIComponent(params.text);
    // Use explicit phone= query parameter endpoint first so Android reliably parses both phone & text
    // for unsaved contacts without short-link path truncation or home-screen fallback.
    const candidateUrls = [
      `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodedText}`,
      `https://wa.me/${waPhone}?text=${encodedText}`,
      `whatsapp://send?phone=${waPhone}&text=${encodedText}`,
    ];

    let lastErr: any = null;
    for (const url of candidateUrls) {
      try {
        await Linking.openURL(url);
        return { ok: true };
      } catch (err: any) {
        lastErr = err;
      }
    }

    return {
      ok: false,
      error: lastErr?.message || 'WhatsApp is not available on this device.',
    };
  }

  public async shareViaSMS(params: {
    phone?: string;
    text: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const e164 = formatPhoneE164(params.phone);
    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (isAvailable) {
        await SMS.sendSMSAsync(e164 ? [e164] : [], params.text);
        return { ok: true };
      }
    } catch {
      // Fall back to sms: scheme
    }

    try {
      const encoded = encodeURIComponent(params.text);
      const url = e164 ? `sms:${e164}?body=${encoded}` : `sms:?body=${encoded}`;
      await Linking.openURL(url);
      return { ok: true };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'SMS is not available on this device.',
      };
    }
  }

  public async shareViaSystem(params: {
    title?: string;
    text: string;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      await Share.share({
        title: params.title || 'Church App Invitation',
        message: params.text,
      });
      return { ok: true };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Unable to open share dialog.',
      };
    }
  }
}

export default new InviteLinkService();

