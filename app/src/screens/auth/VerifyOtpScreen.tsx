import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator, 
  Alert, 
  StatusBar, 
  ScrollView,
  Image
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import auth from '@react-native-firebase/auth';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import FirestoreService from '../../services/FirestoreService';
import InviteLinkService from '../../services/InviteLinkService';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { ChevronLeft } from 'lucide-react-native';

type VerifyOtpScreenProps = NativeStackScreenProps<AuthStackParamList, 'VerifyOtp'>;

export default function VerifyOtpScreen({ route, navigation }: VerifyOtpScreenProps) {
  const insets = useSafeAreaInsets();
  const { confirmation, phoneNumber, contactId, memberName, formData, isSignUp, invitedChurchId, isGuestInvite } = route.params;
  const { member, setMember, setPendingApprovalState } = useAuth();
  const { churchId: activeChurchId, setChurchId } = useChurch();
  
  const [currConfirmation, setCurrConfirmation] = useState(confirmation);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [resendCountdown, setResendCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  
  const inputRef = useRef<TextInput>(null);

  // Countdown timer for Resend Code
  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown(prev => prev - 1), 1000);
    } else {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Format phone number e.g. +91 98765 43210
  const formatDisplayPhone = (num?: string) => {
    if (!num) return '';
    const clean = num.replace(/[^0-9+]/g, '');
    if (clean.startsWith('+91') && clean.length === 13) {
      return `+91 ${clean.slice(3, 8)} ${clean.slice(8)}`;
    }
    if (!clean.startsWith('+') && clean.length === 10) {
      return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
    }
    return num;
  };

  // Automatically trigger verification when 6 digits are entered
  useEffect(() => {
    if (code.length === 6 && !loading) {
      handleVerify();
    }
  }, [code]);

  const handleResend = async () => {
    if (!canResend || loading) return;
    setLoading(true);
    try {
      let cleanNum = (phoneNumber || '').replace(/[^0-9+]/g, '');
      if (cleanNum.length === 10 && !cleanNum.startsWith('+')) {
        cleanNum = `+91${cleanNum}`;
      }
      const newConfirmation = await auth().signInWithPhoneNumber(cleanNum);
      setCurrConfirmation(newConfirmation);
      setResendCountdown(30);
      setCanResend(false);
      setCode('');
      Alert.alert('Code Resent', 'A new 6-digit verification code has been sent.');
    } catch (err: any) {
      Alert.alert('Resend Failed', err.message || 'Unable to resend verification code right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit code sent to your phone.');
      return;
    }

    setLoading(true);
    setStatus('Verifying your code...');
    
    try {
      const result = await currConfirmation.confirm(code);
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;

      // ── Handle Sign Up Flow: Store details and send for Admin Approval ──
      if (result?.user && isSignUp && formData) {
        setStatus('Submitting registration for approval...');

        const targetChurch = activeChurchId || 'rhema';
        const cleanPhone = (formData.phone || phoneNumber || '').replace(/[^0-9+]/g, '');
        const fullName = (formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`).trim() || formData.firstName;

        const requestData = {
          ...formData,
          fullName,
          phone: cleanPhone,
          authUid: result.user.uid,
          status: 'pending',
          createdAt: new Date().toISOString(),
          churchId: targetChurch,
        };

        // 1. Immediately store in AsyncStorage and in AuthContext state
        await AsyncStorage.removeItem('@cached_member').catch(() => {});
        await AsyncStorage.multiSet([
          ['@pending_registration_phone', cleanPhone],
          ['@pending_registration_church', targetChurch],
          ['@pending_registration_name', fullName],
          ['@pending_registration_city', formData.city || ''],
          ['@pending_registration_gender', formData.gender || ''],
          ['@pending_registration_status', 'pending'],
          ['@is_pending_approval', 'true'],
        ]).catch(() => {});

        if (setPendingApprovalState) {
          setPendingApprovalState(true, false, requestData);
        }

        // 2. Persist to Firestore registration_requests collection
        const reqResult = await FirestoreService.createOrUpdateRegistrationRequest(targetChurch, requestData);

        if (!reqResult.success) {
          Alert.alert('Registration Error', reqResult.error || 'Failed to submit registration for approval.');
          setLoading(false);
          return;
        }

        navigation.replace('ApprovalPending', {
          phoneNumber: cleanPhone,
          churchId: targetChurch,
          applicantName: fullName,
          city: formData.city,
          gender: formData.gender,
          applicantData: requestData,
        });
        return;
      }

      if (result?.user) {
        await AsyncStorage.removeItem('@guest_intent').catch(() => {});
        await AsyncStorage.setItem('@cached_user', JSON.stringify({
          uid: result.user.uid,
          phoneNumber: result.user.phoneNumber || phoneNumber || '',
          displayName: result.user.displayName || memberName || formData?.firstName || '',
          isAnonymous: false,
        })).catch(() => {});
      }

      const pendingInvite = await InviteLinkService.getPendingInvite().catch(() => null);
      const effectiveChurchId = invitedChurchId || pendingInvite?.churchId || activeChurchId || 'rhema';
      if (effectiveChurchId && effectiveChurchId !== activeChurchId) {
        await setChurchId(effectiveChurchId).catch(() => {});
      }
      const { firestore, FieldValue } = require('../../services/firebaseConfig');

      let hasLinked = false;
      if (result?.user && contactId && !isSignUp) {
        setStatus('Linking church profile...');
        try {
          await FirestoreService.syncMember(effectiveChurchId, contactId, result.user.uid);
          hasLinked = true;
        } catch (syncError) {
          console.error('❌ Sync failed:', syncError);
        }
      }

      // Safety fallback: check church records by phone if contactId was not passed or match already existed under UID
      if (result?.user && !hasLinked && !isSignUp) {
        const userPhone = result.user.phoneNumber || phoneNumber;
        if (userPhone) {
          try {
            const contactCheck = await FirestoreService.checkContactExists(userPhone, effectiveChurchId, true);
            if (contactCheck?.exists && contactCheck.member) {
              const targetChurch = contactCheck.member.churchId || effectiveChurchId;
              setStatus('Linking church profile...');
              await FirestoreService.syncMember(targetChurch, contactCheck.member.id, result.user.uid);
              hasLinked = true;
            }
          } catch (fallbackErr) {
            console.warn('Fallback contact sync in VerifyOtp:', fallbackErr);
          }
        }
      }

      if (result?.user && !hasLinked && !isSignUp) {
        const existingUidProfile = await FirestoreService.getMemberProfile(result.user.uid, effectiveChurchId).catch(() => null);
        if (existingUidProfile) {
          await FirestoreService.syncMember(effectiveChurchId, result.user.uid, result.user.uid);
          hasLinked = true;
        }
      }

      if (result?.user && hasLinked) {
        await InviteLinkService.clearPendingInvite().catch(() => {});
        const linkedProfile = await FirestoreService.getMemberProfile(result.user.uid, effectiveChurchId).catch(() => null);
        if (linkedProfile) {
          setMember(linkedProfile as any);
          await AsyncStorage.setItem('@cached_member', JSON.stringify(linkedProfile)).catch(() => {});
        }
      }

      // If not linked, check if this user has a pending or rejected registration request
      if (result?.user && !hasLinked && !isSignUp) {
        const userPhone = result.user.phoneNumber || phoneNumber;
        if (userPhone) {
          try {
            const reqCheck = await FirestoreService.getRegistrationRequest(activeChurchId || 'rhema', userPhone);
            if (reqCheck && (reqCheck.status === 'pending' || reqCheck.status === 'rejected')) {
              await auth().signOut();
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              await AsyncStorage.setItem('@pending_registration_phone', userPhone).catch(() => {});
              await AsyncStorage.setItem('@pending_registration_church', activeChurchId || 'rhema').catch(() => {});
              await AsyncStorage.setItem('@pending_registration_name', reqCheck.fullName || `${reqCheck.firstName || ''} ${reqCheck.lastName || ''}`.trim() || '').catch(() => {});
              await AsyncStorage.setItem('@pending_registration_city', reqCheck.city || '').catch(() => {});
              await AsyncStorage.setItem('@pending_registration_gender', reqCheck.gender || '').catch(() => {});
              await AsyncStorage.setItem('@pending_registration_status', reqCheck.status).catch(() => {});
              await AsyncStorage.setItem('@is_pending_approval', reqCheck.status === 'pending' ? 'true' : 'false').catch(() => {});

              navigation.replace('ApprovalPending', {
                phoneNumber: userPhone,
                churchId: activeChurchId || 'rhema',
                applicantName: reqCheck.fullName || `${reqCheck.firstName || ''} ${reqCheck.lastName || ''}`.trim() || reqCheck.firstName,
                city: reqCheck.city,
                gender: reqCheck.gender,
              });
              return;
            }
          } catch (reqErr) {
            console.warn('Error checking pending status in VerifyOtp:', reqErr);
          }
        }
      }
      if (result?.user && !hasLinked) {
        const globalUser = await FirestoreService.getGlobalUser(result.user.uid);
        
        if (!globalUser?.primaryChurchId) {
          navigation.replace('SignUp');
          return;
        }
      }
      
      if (hasLinked) {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.multiRemove([
          '@is_pending_approval',
          '@pending_registration_status',
          '@pending_registration_phone',
          '@pending_registration_name',
          '@pending_registration_city',
          '@pending_registration_gender',
          '@pending_registration_church',
        ]).catch(() => {});
        setStatus('Loading dashboard...');
        return;
      }
    } catch (error: any) {
      console.error('❌ Error:', error?.code);
      Alert.alert('Verification Failed', 'The code entered is incorrect or expired.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.rootContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Top Header with Back Arrow & Title ── */}
      <View style={styles.headerRow}>
        <TouchableOpacity 
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <ChevronLeft size={26} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify Your Mobile Number</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.keyboardAvoid}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Soft Warm Circle Graphic with 3D Phone Icon ── */}
          <View style={styles.circleGraphic}>
            <Image 
              source={require('../../../assets/otp_phone_icon.png')}
              style={styles.phoneIcon}
              resizeMode="contain"
            />
          </View>

          {/* ── Instructions & User Mobile Number ── */}
          <Text style={styles.instructionText}>
            Please enter the 6-digit code sent to
          </Text>
          <Text style={styles.phoneNumberText}>
            {formatDisplayPhone(phoneNumber)}
          </Text>

          {/* ── 6 OTP Input Boxes with Yellow Accent Underline ── */}
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={() => inputRef.current?.focus()}
            style={styles.otpContainer}
          >
            <View style={styles.otpBoxesRow}>
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const digit = code[idx] || '';
                const isFocused = idx === code.length && code.length < 6;
                return (
                  <View key={idx} style={styles.otpBoxWrapper}>
                    <View style={[styles.otpDigitBox, isFocused && styles.otpDigitBoxFocused]}>
                      <Text style={styles.otpDigitText}>{digit}</Text>
                    </View>
                    <View style={[styles.otpUnderline, digit ? styles.otpUnderlineActive : null]} />
                  </View>
                );
              })}
            </View>

            {/* Hidden Input that captures keyboard typing */}
            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              autoFocus
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
            />
          </TouchableOpacity>

          {/* ── Resend Code Link ── */}
          <View style={styles.resendContainer}>
            <TouchableOpacity 
              onPress={handleResend} 
              disabled={!canResend || loading}
              activeOpacity={0.7}
            >
              <Text style={[styles.resendText, !canResend && styles.resendTextDisabled]}>
                {canResend ? 'Resend Code' : `Resend Code in ${resendCountdown}s`}
              </Text>
            </TouchableOpacity>
          </View>

          {status ? (
            <Text style={styles.statusInlineText}>{status}</Text>
          ) : null}

          {/* Spacer to push Verify button toward bottom on taller screens */}
          <View style={styles.spacer} />

          {/* ── Verify Button (Black Pill) ── */}
          <TouchableOpacity 
            style={[styles.verifyBtn, (loading || code.length !== 6) && styles.verifyBtnDisabled]}
            onPress={handleVerify}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyBtnText}>Verify</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rootContainer: { 
    flex: 1, 
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoid: { 
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 10 : 4,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  backBtn: { 
    padding: 6,
    marginRight: 6,
  },
  headerTitle: { 
    color: '#0F172A', 
    fontSize: 18, 
    fontWeight: '700', 
    letterSpacing: -0.2,
  },

  scrollContent: { 
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 44,
  },

  // Circle graphic
  circleGraphic: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#FEF3E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  phoneIcon: {
    width: 155,
    height: 155,
  },

  // Instruction & phone
  instructionText: {
    fontSize: 14.5,
    color: '#334155',
    textAlign: 'center',
    fontWeight: '400',
    marginBottom: 6,
  },
  phoneNumberText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 36,
    letterSpacing: 0.3,
  },

  // 6 OTP boxes
  otpContainer: {
    width: '100%',
    alignItems: 'center',
    position: 'relative',
  },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
  },
  otpBoxWrapper: {
    alignItems: 'center',
    width: 44,
  },
  otpDigitBox: {
    width: 44,
    height: 52,
    backgroundColor: '#FEF7F0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpDigitBoxFocused: {
    backgroundColor: '#FFF1E2',
    borderWidth: 1.2,
    borderColor: '#F59E0B',
  },
  otpDigitText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  otpUnderline: {
    width: 42,
    height: 3.5,
    backgroundColor: '#FDE68A',
    borderRadius: 2,
    marginTop: 7,
  },
  otpUnderlineActive: {
    backgroundColor: '#F59E0B',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },

  // Resend code
  resendContainer: {
    marginTop: 34,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#EA580C',
    textDecorationLine: 'underline',
  },
  resendTextDisabled: {
    color: '#94A3B8',
    textDecorationLine: 'none',
  },
  statusInlineText: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },

  spacer: {
    flex: 1,
    minHeight: 40,
  },

  // Verify button
  verifyBtn: {
    backgroundColor: '#0F172A',
    width: '100%',
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 20,
  },
  verifyBtnDisabled: {
    opacity: 0.5,
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
