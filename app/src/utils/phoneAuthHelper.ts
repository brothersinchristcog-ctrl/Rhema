import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirestoreService from '../services/FirestoreService';
import { messaging } from '../services/firebaseConfig';
import { RHEMA_CHURCH_ID } from '../constants/ChurchConfig';

async function getFcmTokenSafely(timeoutMs = 2500): Promise<string> {
  try {
    const token = await Promise.race<string | null>([
      messaging().getToken().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return typeof token === 'string' ? token.trim() : '';
  } catch {
    return '';
  }
}

export interface PhoneVerificationSendResult {
  mode: 'code_sent' | 'instant_verified';
  verificationId: string;
  autoCode?: string | null;
}

/**
 * Starts Firebase phone verification using `verifyPhoneNumber` instead of
 * `signInWithPhoneNumber` so Android Play Services SMS auto-retrieval never
 * calls `signInWithCredential` behind the user's back before they enter the
 * OTP or before sign-up form data is persisted.
 */
export function sendOtpWithoutAutoSignIn(
  phoneNumber: string,
  forceResend = false
): Promise<PhoneVerificationSendResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const listener = auth().verifyPhoneNumber(phoneNumber, 60, forceResend);

    listener.on(
      'state_changed',
      (snapshot) => {
        if (settled) return;

        if (snapshot.state === auth.PhoneAuthState.CODE_SENT) {
          settled = true;
          resolve({
            mode: 'code_sent',
            verificationId: snapshot.verificationId,
          });
        } else if (snapshot.state === auth.PhoneAuthState.AUTO_VERIFIED) {
          settled = true;
          resolve({
            mode: 'instant_verified',
            verificationId: snapshot.verificationId,
            autoCode: snapshot.code || null,
          });
        } else if (snapshot.state === auth.PhoneAuthState.ERROR) {
          settled = true;
          reject(snapshot.error || new Error('Phone verification failed.'));
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    );
  });
}

export interface SubmitPendingRegistrationParams {
  authUid: string;
  phoneNumber: string;
  churchId?: string;
  formData: any;
  setPendingApprovalState?: (pending: boolean, rejected?: boolean, req?: any) => void;
}

export async function submitPendingRegistration({
  authUid,
  phoneNumber,
  churchId,
  formData,
  setPendingApprovalState,
}: SubmitPendingRegistrationParams): Promise<{
  success: boolean;
  error?: string;
  formattedPhone: string;
  fullName: string;
  targetChurch: string;
  requestData: any;
}> {
  const targetChurch = churchId || RHEMA_CHURCH_ID;
  const rawPhone = (formData?.phone || phoneNumber || '').replace(/[^0-9+]/g, '');
  const formattedPhone =
    rawPhone.length === 10 && !rawPhone.startsWith('+')
      ? `+91${rawPhone}`
      : rawPhone || phoneNumber;

  const fullName =
    (
      formData?.fullName ||
      `${formData?.firstName || ''} ${formData?.lastName || ''}`
    ).trim() ||
    formData?.firstName ||
    '';

  const cityValue = formData?.city || formData?.village || '';
  const genderValue = formData?.gender || '';
  const fcmToken = await getFcmTokenSafely();

  const requestData = {
    ...formData,
    fullName,
    phone: formattedPhone,
    city: cityValue,
    village: cityValue,
    gender: genderValue,
    authUid,
    fcmToken,
    platform: Platform.OS,
    status: 'pending',
    createdAt: new Date().toISOString(),
    churchId: targetChurch,
  };

  // Persist locally first so AuthContext / ApprovalPendingScreen always have full details
  await AsyncStorage.removeItem('@cached_member').catch(() => {});
  await AsyncStorage.multiSet([
    ['@pending_registration_phone', formattedPhone],
    ['@pending_registration_church', targetChurch],
    ['@pending_registration_name', fullName],
    ['@pending_registration_city', cityValue],
    ['@pending_registration_gender', genderValue],
    ['@pending_registration_status', 'pending'],
    ['@is_pending_approval', 'true'],
  ]).catch(() => {});

  if (setPendingApprovalState) {
    setPendingApprovalState(true, false, requestData);
  }

  // Persist to Firestore registration_requests collection
  const reqResult = await FirestoreService.createOrUpdateRegistrationRequest(
    targetChurch,
    requestData
  );

  return {
    success: reqResult.success,
    error: reqResult.error,
    formattedPhone,
    fullName,
    targetChurch,
    requestData,
  };
}

