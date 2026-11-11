import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  StatusBar
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import Theme from '../../theme/Theme';
import FirestoreService from '../../services/FirestoreService';
import InviteLinkService from '../../services/InviteLinkService';
import { isGuestMemberDoc, normalizePhone10, stripGuestSuffix } from '../../utils/phoneUtils';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Phone, User, LogIn, ArrowRight } from 'lucide-react-native';
import StarBackground from '../../components/StarBackground';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
  route: RouteProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation, route }: LoginScreenProps) {
  const { signInAnonymously } = useAuth();
  const { activeChurch, setChurchId } = useChurch();
  const [showPhoneInput, setShowPhoneInput] = useState(
    Boolean(route.params?.showPhoneInput || route.params?.invitedPhone)
  );

  const [phoneNumber, setPhoneNumber] = useState(() =>
    route.params?.invitedPhone ? normalizePhone10(route.params.invitedPhone) : ''
  );
  const [loading, setLoading] = useState(false);
  const [verifyingStatus, setVerifyingStatus] = useState('');
  const [memberName, setMemberName] = useState(route.params?.invitedName || '');
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [isMember, setIsMember] = useState(false);
  const [isGuestInviteRecord, setIsGuestInviteRecord] = useState(
    Boolean(route.params?.invitedPhone)
  );
  const [inviteContext, setInviteContext] = useState<{
    churchId?: string;
    churchName?: string;
    guestName?: string;
    relation?: string;
    invitedByMemberName?: string;
    phone10?: string;
  } | null>(() =>
    route.params?.invitedPhone
      ? {
          churchId: route.params.invitedChurchId,
          churchName: route.params.invitedChurchName,
          guestName: route.params.invitedName,
          relation: route.params.invitedRelation,
          invitedByMemberName: route.params.invitedByMemberName,
          phone10: normalizePhone10(route.params.invitedPhone),
        }
      : null
  );

  // Sync from deep-link params or pending AsyncStorage invitation
  useEffect(() => {
    let cancelled = false;
    const loadInviteContext = async () => {
      const paramPhone = route.params?.invitedPhone;
      if (paramPhone) {
        const clean10 = normalizePhone10(paramPhone);
        setShowPhoneInput(true);
        if (clean10) setPhoneNumber(clean10);
        if (route.params?.invitedName) setMemberName(stripGuestSuffix(route.params.invitedName));
        if (route.params?.invitedChurchId && route.params.invitedChurchId !== activeChurch?.id) {
          await setChurchId(route.params.invitedChurchId);
        }
        setInviteContext({
          churchId: route.params?.invitedChurchId,
          churchName: route.params?.invitedChurchName,
          guestName: route.params?.invitedName,
          relation: route.params?.invitedRelation,
          invitedByMemberName: route.params?.invitedByMemberName,
          phone10: clean10,
        });
        setIsGuestInviteRecord(true);
        return;
      }

      if (route.params?.showPhoneInput) {
        setShowPhoneInput(true);
      }

      const pending = await InviteLinkService.getPendingInvite();
      if (!cancelled && pending && (pending.phone10 || pending.phone)) {
        const clean10 = pending.phone10 || normalizePhone10(pending.phone);
        setShowPhoneInput(true);
        if (clean10) setPhoneNumber(clean10);
        if (pending.guestName) setMemberName(stripGuestSuffix(pending.guestName));
        if (pending.churchId && pending.churchId !== activeChurch?.id) {
          await setChurchId(pending.churchId);
        }
        setInviteContext({
          churchId: pending.churchId,
          churchName: pending.churchName,
          guestName: pending.guestName,
          relation: pending.relation,
          invitedByMemberName: pending.invitedByMemberName,
          phone10: clean10,
        });
        setIsGuestInviteRecord(true);
      }
    };
    loadInviteContext();
    return () => {
      cancelled = true;
    };
  }, [
    route.params?.showPhoneInput,
    route.params?.invitedPhone,
    route.params?.invitedChurchId,
    route.params?.invitedName,
  ]);


  // ── Auto-lookup member or invited guest as user types ──
  useEffect(() => {
    const checkMembership = async () => {
      const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
      if (cleanNum.length === 10) {
        setVerifyingStatus('Checking church records...');
        try {
          const churchTarget = inviteContext?.churchId || activeChurch?.id || 'rhema';
          const result = await FirestoreService.checkContactExists(cleanNum, churchTarget);

          if (result && result.exists) {
            const rawDisplay = result.member?.firstName 
              ? `${result.member.firstName} ${result.member.lastName || ''}`.trim()
              : (result.member?.name || result.member?.displayName || '');
            const displayName = stripGuestSuffix(rawDisplay) || inviteContext?.guestName || '';
            const guestFlag = isGuestMemberDoc(result.member);
            setMemberName(displayName);
            setContactId(result.member?.id);
            setIsMember(true);
            setIsGuestInviteRecord(guestFlag || Boolean(inviteContext?.phone10 === cleanNum));
            if (guestFlag && result.member?.invitedByMemberName && !inviteContext?.invitedByMemberName) {
              setInviteContext((prev) => ({
                ...(prev || {}),
                churchId: churchTarget,
                guestName: displayName,
                invitedByMemberName: result.member?.invitedByMemberName,
                relation: result.member?.relation,
                phone10: cleanNum,
              }));
            }
            setVerifyingStatus('');
          } else {
            if (!inviteContext?.phone10 || inviteContext.phone10 !== cleanNum) {
              setMemberName('');
              setIsGuestInviteRecord(false);
            }
            setContactId(undefined);
            setIsMember(false);
            setVerifyingStatus('Number not found in church records.');
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        setMemberName('');
        setContactId(undefined);
        setIsMember(false);
        setVerifyingStatus('');
      }
    };
    checkMembership();
  }, [phoneNumber, activeChurch?.id, inviteContext?.churchId]);

  const handleSendCode = async () => {
    let formattedNumber = phoneNumber.trim();
    if (formattedNumber.length === 10 && !formattedNumber.startsWith('+')) {
      formattedNumber = `+91${formattedNumber}`;
    }

    if (!formattedNumber.startsWith('+') || formattedNumber.length < 12) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number.');
      return;
    }

    // 🔥 SECRET DEV BYPASS 🔥
    if (formattedNumber === '+919999999999') {
      Alert.alert('Dev Bypass', 'Logging you in automatically for testing!');
      setLoading(true);
      try {
        await require('@react-native-async-storage/async-storage').default.setItem('@guest_intent', 'true');
        await auth().signInAnonymously();
      } catch(e) {}
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const targetChurch = inviteContext?.churchId || activeChurch?.id || 'rhema';
      let resolvedContactId = contactId;
      let resolvedName = memberName;
      let resolvedGuestFlag = isGuestInviteRecord;

      if (!resolvedContactId) {
        const cleanNum = normalizePhone10(formattedNumber);
        if (cleanNum) {
          const lookup = await FirestoreService.checkContactExists(cleanNum, targetChurch, true).catch(() => null);
          if (lookup?.exists && lookup.member) {
            resolvedContactId = lookup.member.id;
            resolvedName = stripGuestSuffix(lookup.member.name || lookup.member.firstName || '') || resolvedName;
            resolvedGuestFlag = resolvedGuestFlag || isGuestMemberDoc(lookup.member);
          }
        }
      }

      setVerifyingStatus('Sending OTP...');
      const confirmation = await auth().signInWithPhoneNumber(formattedNumber);
      navigation.navigate('VerifyOtp', { 
        confirmation, 
        phoneNumber: formattedNumber,
        contactId: resolvedContactId,
        memberName: resolvedName,
        invitedChurchId: targetChurch,
        isGuestInvite: resolvedGuestFlag,
      });
    } catch (error: any) {
      console.error(error);
      Alert.alert('Authentication Error', error.message || 'Unable to send SMS. Please check your connection.');
    } finally {
      setLoading(false);
      setVerifyingStatus('');
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      await require('@react-native-async-storage/async-storage').default.setItem('@guest_intent', 'true');
      await signInAnonymously();
    } catch (error: any) {
      Alert.alert('Login Error', 'Unable to enter as guest.');
    } finally {
      setLoading(false);
    }
  };

  if (!showPhoneInput) {
    return (
      <View style={styles.landingContainer}>
        <StatusBar barStyle="light-content" />
        <StarBackground />
        
        <View style={styles.landingTop}>
          <Text 
            style={styles.welcomePrefix}
          >
            Welcome to
          </Text>
          <Text 
            style={styles.churchTitleLarge}
            numberOfLines={2}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.6}
          >
            {activeChurch?.name || 'Rhema Global Ministries'}
          </Text>
          <Text style={[styles.bibleQuote, { marginTop: 40, marginBottom: 0, fontSize: 15, fontStyle: 'normal', opacity: 0.9, paddingHorizontal: 20 }]}>
            A place to connect, pray, and walk together in faith as one church family.
          </Text>
          <Text style={[styles.bibleQuote, { marginTop: 25, paddingHorizontal: 20, lineHeight: 26 }]}>
            "But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint."{'\n'}— Isaiah 40:31
          </Text>
        </View>

        <View style={styles.landingBottom}>
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.mainActionBtn, { flex: 1 }]}
              onPress={() => {
                setShowPhoneInput(true);
              }}
            >
              <Text style={styles.mainActionBtnTxt}>Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.signUpBtn, { flex: 1, marginLeft: 12 }]}
              onPress={() => {
                navigation.navigate('SignUp');
              }}
            >
              <Text style={styles.signUpBtnTxt}>Register</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.guestLink}
            onPress={handleGuestLogin}
          >
            <Text style={styles.guestLinkTxt}>Guest mode — browse without login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.authContainer}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0A1128" />
      
      {/* ── Page Header ── */}
      <View style={styles.pageHeader}>
        <SafeAreaView style={{ flexDirection: 'row', alignItems: 'center', width: '100%', paddingTop: Platform.OS === 'ios' ? 10 : 30, paddingBottom: 24, paddingHorizontal: 22, justifyContent: 'space-between' }}>
          <TouchableOpacity 
            style={styles.backBtn}
            onPress={() => {
              if (route.params?.fromJoinSuccess || route.params?.showPhoneInput) {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  setShowPhoneInput(false);
                }
              } else {
                setShowPhoneInput(false);
              }
            }}
          >
            <ChevronLeft size={20} color="#aac4e8" />
            <Text style={styles.backBtnTxt}>Back</Text>
          </TouchableOpacity>
          <View style={styles.titleCol}>
            <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit>
              Welcome Back
            </Text>
            <Text style={styles.pageSub} numberOfLines={1} adjustsFontSizeToFit>
              Sign in to your member account
            </Text>
          </View>
          <View style={{ width: 60 }} />
        </SafeAreaView>
      </View>

      <SafeAreaView style={{ flex: 1, paddingTop: 10 }}>
        <View style={styles.authContent}>

          <View style={[styles.cardContainer, isMember && styles.cardContainerSuccess]}>
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>PHONE NUMBER</Text>
              <View style={[styles.inputWrapper, isMember && styles.inputWrapperSuccess]}>
                <Phone size={20} color={isMember ? "#15803D" : "#9CA3AF"} />
                <TextInput 
                  style={styles.textInput}
                  placeholder="99887 76655"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  maxLength={10}
                />
                {isMember && <User size={20} color="#15803D" />}
              </View>

              {verifyingStatus ? (
                <Text style={[styles.statusText, isMember && styles.statusTextSuccess]}>
                  {verifyingStatus}
                </Text>
              ) : null}
            </View>

            {(isMember || isGuestInviteRecord) && (
              <View style={styles.memberBanner}>
                <Text style={styles.memberBannerTxt}>
                  Welcome{memberName ? `, ${memberName}` : ''} 🙏
                </Text>
                <Text style={styles.memberBannerSub}>
                  {isGuestInviteRecord
                    ? `${inviteContext?.invitedByMemberName ? `Invited by ${inviteContext.invitedByMemberName} • ` : ''}No registration needed — verify OTP to enter.`
                    : 'We found your church record.'}
                </Text>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#0A1128" />
              ) : (
                <Text style={styles.submitBtnTxt}>Send Verification Code</Text>
              )}
            </TouchableOpacity>
          </View>

          {!isGuestInviteRecord && (
            <View style={styles.footerInfo}>
              <Text style={styles.footerTxt}>Not a member yet? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                <Text style={styles.footerLink}>Register Here</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Landing Styles
  landingContainer: { flex: 1, backgroundColor: '#090a0f' },
  landingTop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  welcomePrefix: { 
    color: '#F4D389', 
    fontSize: 56, 
    fontFamily: Platform.OS === 'ios' ? 'Snell Roundhand' : 'cursive', 
    fontStyle: 'italic', 
    fontWeight: '600', 
    marginBottom: 8, 
    textAlign: 'center'
  },
  churchTitleLarge: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase' },
  bibleQuote: { color: '#aac4e8', fontSize: 16, fontStyle: 'italic', fontWeight: '500', marginTop: 40, textAlign: 'center', lineHeight: 24 },
  
  landingBottom: { padding: 40, paddingBottom: 60, gap: 16 },
  actionRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginBottom: 10 },
  mainActionBtn: { 
    backgroundColor: '#F4D389', borderRadius: 30, paddingVertical: 14, 
    justifyContent: 'center', alignItems: 'center',
    elevation: 5, shadowColor: '#F4D389', shadowOpacity: 0.2, shadowRadius: 10
  },
  mainActionBtnTxt: { color: '#0A1128', fontSize: 16, fontWeight: '700' },
  
  signUpBtn: { 
    backgroundColor: '#1a2d5a', borderRadius: 30, paddingVertical: 14, 
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)'
  },
  signUpBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '500' },

  guestLink: { marginTop: 10, alignItems: 'center' },
  guestLinkTxt: { color: '#6B7280', fontSize: 12, fontWeight: '500' },

  // Auth Styles
  authContainer: { flex: 1, backgroundColor: '#0A1128' },
  
  pageHeader: {
    marginBottom: 20,
    zIndex: 10,
    backgroundColor: 'transparent'
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  backBtnTxt: { color: '#aac4e8', fontSize: 16, fontWeight: '500' },
  titleCol: { flex: 1, alignItems: 'center', paddingHorizontal: 16 },
  pageTitle: { 
    color: '#F4D389', 
    fontSize: 40, 
    fontFamily: Platform.OS === 'ios' ? 'Snell Roundhand' : 'cursive', 
    fontStyle: 'italic',
    fontWeight: '600' 
  },
  pageSub: { color: '#aac4e8', fontSize: 14, marginTop: -5, fontStyle: 'italic' },

  authContent: { paddingHorizontal: 25, flex: 1, paddingTop: 10 },

  cardContainer: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(244, 211, 137, 0.4)',
  },
  cardContainerSuccess: {
    borderColor: '#F4D389',
  },

  inputSection: { marginBottom: 25 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: '#aac4e8', letterSpacing: 1, marginBottom: 10 },
  inputWrapper: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#090a0f', 
    borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: 'transparent' 
  },
  inputWrapperSuccess: { borderColor: '#BBF7D0', backgroundColor: '#0A1622' },
  textInput: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: '600', color: '#fff' },
  statusText: { fontSize: 11, color: '#F87171', marginTop: 8, fontWeight: '500' },
  statusTextSuccess: { color: '#BBF7D0' },

  memberBanner: { 
    backgroundColor: '#1E293B', 
    padding: 18, 
    borderRadius: 16, 
    marginBottom: 25, 
    borderLeftWidth: 4,
    borderLeftColor: '#F4D389' 
  },
  memberBannerTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  memberBannerSub: { color: '#aac4e8', fontSize: 12, marginTop: 4 },

  submitBtn: { backgroundColor: '#F4D389', borderRadius: 30, paddingVertical: 16, alignItems: 'center', elevation: 2 },
  submitBtnDisabled: { opacity: 0.5, backgroundColor: '#9CA3AF' },
  submitBtnTxt: { color: '#0A1128', fontSize: 16, fontWeight: '800' },

  footerInfo: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
  footerTxt: { color: '#aac4e8', fontSize: 14 },
  footerLink: { color: '#F4D389', fontSize: 14, fontWeight: '800' },
});
