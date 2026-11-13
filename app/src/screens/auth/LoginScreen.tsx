import React, { useState, useEffect, useRef } from 'react';
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
  StatusBar,
  ScrollView,
  Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Font from 'expo-font';
import Svg, { Path } from 'react-native-svg';
import { RHEMA_LOGO_PATH, RHEMA_LOGO_VIEWBOX } from './rhemaLogoPath';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Phone, User, LogIn, ArrowRight, Clock, AlertTriangle } from 'lucide-react-native';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
  route: RouteProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation, route }: LoginScreenProps) {
  const { signInAnonymously } = useAuth();
  const { activeChurch, setChurchId } = useChurch();
  const insets = useSafeAreaInsets();
  const [showPhoneInput, setShowPhoneInput] = useState(
    Boolean(route.params?.showPhoneInput || route.params?.invitedPhone)
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const [fontReady, setFontReady] = useState(() => {
    try { return Font.isLoaded('GreatVibes'); } catch { return false; }
  });
  const [validationModal, setValidationModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });
  useEffect(() => {
    let mounted = true;
    Font.loadAsync({ GreatVibes: require('../../../assets/fonts/GreatVibes-Regular.ttf') })
      .then(() => { if (mounted) setFontReady(true); })
      .catch((e) => console.warn('Font load error:', e));
    return () => { mounted = false; };
  }, []);

  const [phoneNumber, setPhoneNumber] = useState(() =>
    route.params?.invitedPhone ? normalizePhone10(route.params.invitedPhone) : ''
  );
  const [loading, setLoading] = useState(false);
  const [verifyingStatus, setVerifyingStatus] = useState('');
  const [memberName, setMemberName] = useState(route.params?.invitedName || '');
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [isMember, setIsMember] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [pendingReqData, setPendingReqData] = useState<any>(null);
  const [isRejected, setIsRejected] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
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
            setIsPendingApproval(false);
            setIsRejected(false);
            setRejectionReason('');
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
          } else if (result && result.isPending) {
            const req = result.registrationRequest;
            const full = req?.fullName || `${req?.firstName || ''} ${req?.lastName || ''}`.trim() || req?.firstName || '';
            setMemberName(full);
            setPendingReqData(req);
            setContactId(undefined);
            setIsMember(false);
            setIsPendingApproval(true);
            setIsRejected(false);
            setRejectionReason('');
            setVerifyingStatus('');
          } else if (result && result.isRejected) {
            setMemberName('');
            setContactId(undefined);
            setIsMember(false);
            setIsPendingApproval(false);
            setIsRejected(true);
            setRejectionReason(result.registrationRequest?.rejectionReason || '');
            setVerifyingStatus('Registration was not approved. You can register again.');
          } else {
            if (!inviteContext?.phone10 || inviteContext.phone10 !== cleanNum) {
              setMemberName('');
              setIsGuestInviteRecord(false);
            }
            setContactId(undefined);
            setIsMember(false);
            setIsPendingApproval(false);
            setIsRejected(false);
            setRejectionReason('');
            setVerifyingStatus('Number not found in church records.');
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        setMemberName('');
        setContactId(undefined);
        setIsMember(false);
        setIsPendingApproval(false);
        setIsRejected(false);
        setRejectionReason('');
        setVerifyingStatus('');
      }
    };
    checkMembership();
  }, [phoneNumber, activeChurch?.id, inviteContext?.churchId]);

  const handleViewApprovalStatus = async () => {
    let formattedNumber = phoneNumber.trim();
    if (formattedNumber.length === 10 && !formattedNumber.startsWith('+')) {
      formattedNumber = `+91${formattedNumber}`;
    }
    const cleanPhone = formattedNumber.replace(/[^0-9+]/g, '');
    const fullName = memberName || pendingReqData?.fullName || `${pendingReqData?.firstName || ''} ${pendingReqData?.lastName || ''}`.trim() || pendingReqData?.firstName || '';
    const city = pendingReqData?.city || (pendingReqData as any)?.village || '';
    const gender = pendingReqData?.gender || '';

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('@pending_registration_phone', cleanPhone).catch(() => {});
    if (fullName) await AsyncStorage.setItem('@pending_registration_name', fullName).catch(() => {});
    if (city) await AsyncStorage.setItem('@pending_registration_city', city).catch(() => {});
    if (gender) await AsyncStorage.setItem('@pending_registration_gender', gender).catch(() => {});
    await AsyncStorage.setItem('@is_pending_approval', 'true').catch(() => {});

    navigation.navigate('ApprovalPending', {
      phoneNumber: cleanPhone,
      churchId: activeChurch?.id,
      applicantName: fullName,
      city,
      gender,
      applicantData: pendingReqData,
    });
  };

  const handleSendCode = async () => {
    const rawDigits = phoneNumber.replace(/[^0-9]/g, '');

    if (!phoneNumber.trim()) {
      setValidationModal({
        visible: true,
        title: 'Required Field',
        message: 'Please enter your phone number to sign in.',
      });
      return;
    }

    if (rawDigits.length < 10) {
      setValidationModal({
        visible: true,
        title: 'Invalid Number',
        message: 'Please enter a valid 10-digit phone number.',
      });
      return;
    }

    let formattedNumber = phoneNumber.trim();
    if (formattedNumber.length === 10 && !formattedNumber.startsWith('+')) {
      formattedNumber = `+91${formattedNumber}`;
    }

    if (!formattedNumber.startsWith('+') || formattedNumber.length < 12) {
      setValidationModal({
        visible: true,
        title: 'Invalid Number',
        message: 'Please enter a valid 10-digit phone number.',
      });
      return;
    }

    // If pending approval - DIRECTLY VIEW STATUS WITHOUT SENDING OTP!
    if (isPendingApproval) {
      await handleViewApprovalStatus();
      return;
    }

    // If rejected
    if (isRejected) {
      Alert.alert(
        'Registration Not Approved',
        rejectionReason
          ? `Your previous registration was not approved.\nReason: ${rejectionReason}\n\nWould you like to register again?`
          : 'Your previous registration was not approved. Would you like to submit a new registration?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Register Again',
            onPress: () => navigation.navigate('SignUp'),
          },
        ]
      );
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
          } else if (lookup?.isPending) {
            setLoading(false);
            setPendingReqData(lookup.registrationRequest);
            setIsPendingApproval(true);
            await handleViewApprovalStatus();
            return;
          } else if (lookup?.isRejected) {
            setLoading(false);
            setIsRejected(true);
            setRejectionReason(lookup.registrationRequest?.rejectionReason || '');
            setValidationModal({
              visible: true,
              title: 'Registration Not Approved',
              message: lookup.registrationRequest?.rejectionReason || 'Your previous registration was not approved. You can register again.',
            });
            return;
          } else if (!isMember && !isGuestInviteRecord) {
            setLoading(false);
            setValidationModal({
              visible: true,
              title: 'Number Not Found',
              message: 'This mobile number is not registered in our church records. Please register first.',
            });
            return;
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
        <StatusBar barStyle="dark-content" backgroundColor="#FFF6F0" translucent={false} />
        <LinearGradient 
          colors={['#FFF6F0', '#FDE4CE', '#FBCFAB']} 
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject} 
        />
        
        {/* Full Image: Proper aspect ratio with contain so 100% of image is displayed with no spreading */}
        <Image 
          source={require('../../../assets/welcome_hero_new.png')}
          style={styles.landingHeroImg}
          resizeMode="contain"
        />

        {/* Top Header with Rhema Global Ministries branding */}
        <SafeAreaView edges={['top']} style={styles.landingTopArea}>
          <View style={styles.brandLogoBox}>
            <Svg width="100%" height="100%" viewBox={RHEMA_LOGO_VIEWBOX}>
              <Path d={RHEMA_LOGO_PATH} fill="#0B1F5C" fillRule="evenodd" />
            </Svg>
            <Text style={styles.brandSub} numberOfLines={1} adjustsFontSizeToFit>GLOBAL MINISTRIES</Text>
          </View>
        </SafeAreaView>
        
        <SafeAreaView edges={['bottom']} style={styles.landingBottom}>
          <TouchableOpacity 
            style={styles.mainActionBtn}
            onPress={() => {
              setShowPhoneInput(true);
            }}
            activeOpacity={0.88}
          >
            <Text style={styles.mainActionBtnTxt}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.signUpBtn}
            onPress={() => {
              navigation.navigate('SignUp');
            }}
            activeOpacity={0.88}
          >
            <Text style={styles.signUpBtnTxt}>Register</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.guestLink}
            onPress={handleGuestLogin}
            activeOpacity={0.7}
          >
            <Text style={styles.guestLinkTxt}>Guest mode — browse without login</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.loginRootContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDF6F2" />
      <LinearGradient 
        colors={['#FDF6F2', '#FEF7F3', '#FDF4ED']} 
        style={StyleSheet.absoluteFillObject} 
      />

      {/* ── Top Bar with Clean Back Arrow (No Circle) ── */}
      <View style={styles.loginTopBar}>
        <TouchableOpacity 
          style={styles.backArrowBtn}
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
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={28} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={styles.loginScrollContent}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 3D Character Illustration Area with Semi-Circle Arch ── */}
          <View style={styles.characterContainer}>
            <View style={styles.brandWrap}>
              <View style={styles.brandLogoBox}>
                <Svg width="100%" height="100%" viewBox={RHEMA_LOGO_VIEWBOX}>
                  <Path d={RHEMA_LOGO_PATH} fill="#0B1F5C" fillRule="evenodd" />
                </Svg>
                <Text style={styles.brandSub} numberOfLines={1} adjustsFontSizeToFit>GLOBAL MINISTRIES</Text>
              </View>
            </View>
          </View>

          {/* ── White Curved Sheet Card ── */}
          <View style={styles.bottomSheetCard}>
            <Text style={styles.cardHeading}>Welcome Back!</Text>
            <Text style={styles.cardSubheading}>Let's get you signed in</Text>

            {/* ── Pill Input Container ── */}
            <View style={[styles.pillInputWrapper, isMember && styles.pillInputWrapperSuccess]}>
              <View style={styles.phoneIconWrap}>
                <Phone size={19} color="#FA6203" strokeWidth={2.4} />
              </View>
              <Text style={styles.countryCodeTxt}>+91</Text>
              <View style={styles.pillDivider} />
              <TextInput 
                style={styles.pillTextInput}
                placeholder="Phone number"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                maxLength={10}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 150, animated: true });
                  }, 150);
                }}
              />
              {isMember && <User size={18} color="#15803D" />}
            </View>

            {verifyingStatus ? (
              <Text style={[styles.statusInlineTxt, isMember && styles.statusInlineTxtSuccess]}>
                {verifyingStatus}
              </Text>
            ) : null}

            {(isMember || isGuestInviteRecord) && (
              <View style={styles.memberBannerBox}>
                <Text style={styles.memberBannerBoxTitle}>Welcome{memberName ? `, ${memberName}` : ''}! 🙏</Text>
                <Text style={styles.memberBannerBoxSub}>
                  {isGuestInviteRecord
                    ? `${inviteContext?.invitedByMemberName ? `Invited by ${inviteContext.invitedByMemberName} • ` : ''}No registration needed — verify OTP to enter.`
                    : 'Verified church record found.'}
                </Text>
              </View>
            )}

            {isPendingApproval && (
              <TouchableOpacity 
                style={styles.pendingBannerBox}
                activeOpacity={0.8}
                onPress={handleViewApprovalStatus}
              >
                <Clock size={18} color="#D97706" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.pendingBannerBoxTitle}>Application Under Review</Text>
                  <Text style={styles.pendingBannerBoxSub}>
                    Your registration request is currently under review by church leaders. Tap here to view status.
                  </Text>
                </View>
                <ArrowRight size={16} color="#D97706" />
              </TouchableOpacity>
            )}

            {isRejected && (
              <View style={styles.rejectedBannerBox}>
                <AlertTriangle size={18} color="#DC2626" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.rejectedBannerBoxTitle}>Registration Not Approved</Text>
                  <Text style={styles.rejectedBannerBoxSub}>
                    {rejectionReason || 'You can review your details and submit a new registration.'}
                  </Text>
                </View>
              </View>
            )}

            {/* ── Send Verification Button ── */}
            <TouchableOpacity 
              style={[
                styles.verificationBtn,
                isPendingApproval && { shadowColor: '#F59E0B' },
                isRejected && { shadowColor: '#2563EB' }
              ]}
              onPress={handleSendCode}
              disabled={loading}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={
                  isPendingApproval 
                    ? ['#F59E0B', '#D97706'] 
                    : isRejected 
                    ? ['#3B82F6', '#2563EB'] 
                    : ['#18181B', '#000000']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.verificationBtnGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : isPendingApproval ? (
                  <Text style={styles.verificationBtnTxt}>View Approval Status</Text>
                ) : isRejected ? (
                  <Text style={styles.verificationBtnTxt}>Submit New Registration</Text>
                ) : (
                  <Text style={styles.verificationBtnTxt}>Send Verification</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Flexible spacer to push the footer to the bottom of the card */}
            <View style={styles.footerPushSpacer} />

            {/* ── Bottom Link (Safely positioned at bottom, completely clearing device navigation buttons) ── */}
            {!isGuestInviteRecord && (
              <View 
                style={[
                  styles.bottomFooterRow, 
                  { paddingBottom: (insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 26 : 14)) + 14 }
                ]}
              >
                <Text style={styles.bottomFooterPrefix}>Not a member yet? </Text>
                <TouchableOpacity 
                  onPress={() => navigation.navigate('SignUp')} 
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.bottomFooterLink}>Register here.</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Custom Validation Alert Modal Popup Card ── */}
      <Modal 
        animationType="fade" 
        transparent={true} 
        visible={validationModal.visible}
        onRequestClose={() => setValidationModal(prev => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.validationCard}>
            {/* Top Right Corner Rhema Global Ministries branding */}
            <View style={styles.popupTopRightBrand}>
              <View style={styles.popupBrandScaleWrap}>
                <View style={styles.brandLogoBox}>
                  <Svg width="100%" height="100%" viewBox={RHEMA_LOGO_VIEWBOX}>
                    <Path d={RHEMA_LOGO_PATH} fill="#0B1F5C" fillRule="evenodd" />
                  </Svg>
                  <Text style={styles.brandSub} numberOfLines={1} adjustsFontSizeToFit>GLOBAL MINISTRIES</Text>
                </View>
              </View>
            </View>

            <Text style={styles.validationTitle}>{validationModal.title}</Text>
            <Text style={styles.validationSub}>{validationModal.message}</Text>

            <TouchableOpacity 
              style={styles.validationActionBtn} 
              onPress={() => setValidationModal(prev => ({ ...prev, visible: false }))}
              activeOpacity={0.88}
            >
              <Text style={styles.validationActionBtnTxt}>Okay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Landing / Welcome Styles
  landingContainer: { 
    flex: 1, 
    backgroundColor: '#FFF6F0',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  landingHeroImg: {
    width: '100%',
    height: '100%',
  },
  landingTopArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 76 : 64,
    zIndex: 10,
  },
  landingBottom: { 
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 78 : 95,
    left: 0,
    right: 0,
    paddingHorizontal: 28, 
    zIndex: 10,
  },
  mainActionBtn: { 
    width: '100%',
    backgroundColor: '#000000', 
    borderRadius: 26, 
    height: 52, 
    justifyContent: 'center', 
    alignItems: 'center',
    elevation: 4, 
    shadowColor: '#000000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.18, 
    shadowRadius: 8,
    overflow: 'hidden',
  },
  mainActionBtnTxt: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '700',
  },
  signUpBtn: { 
    width: '100%',
    backgroundColor: '#991B1B', 
    borderRadius: 26, 
    height: 52, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginTop: 12,
    elevation: 4,
    shadowColor: '#991B1B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  signUpBtnTxt: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '700',
  },
  guestLink: { 
    marginTop: 14, 
    alignItems: 'center',
    paddingVertical: 4,
  },
  guestLinkTxt: { 
    color: '#334155', 
    fontSize: 13, 
    fontWeight: '600',
  },

  // ── Matching Image Login Design Styles ──
  loginRootContainer: {
    flex: 1,
    backgroundColor: '#FDF6F2',
  },
  loginTopBar: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 10 : 4,
    paddingBottom: 4,
    zIndex: 20,
  },
  backArrowBtn: {
    padding: 8,
    alignSelf: 'flex-start',
  },
  loginScrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 0,
  },
  characterContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 6,
    paddingBottom: 0,
    position: 'relative',
  },
  semiCircleArch: {
    position: 'absolute',
    bottom: 0,
    width: 290,
    height: 195,
    borderTopLeftRadius: 145,
    borderTopRightRadius: 145,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#FCEEE2',
    alignSelf: 'center',
  },
  characterImg: {
    width: '100%',
    height: 200,
  },
  brandWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    paddingBottom: 70,
  },
  brandLogoBox: {
    width: 210,
    height: 88,
  },
  brandSub: {
    position: 'absolute',
    left: 73,
    top: 67,
    width: 136,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 2.2,
    color: '#07153F',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  bottomSheetCard: {
    flex: 1,
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 0,
    marginTop: -16,
    shadowColor: '#8C6D58',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 10,
    justifyContent: 'space-between',
  },
  cardHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0A1629',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  cardSubheading: {
    fontSize: 14,
    fontWeight: '400',
    color: '#5E6F88',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  pillInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    height: 56,
    paddingHorizontal: 18,
    borderWidth: 1.4,
    borderColor: '#CBD5E1',
    shadowColor: '#718096',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pillInputWrapperSuccess: {
    borderColor: '#10B981',
  },
  phoneIconWrap: {
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countryCodeTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A1629',
    marginLeft: 2,
  },
  pillDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 12,
  },
  pillTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0A1629',
    paddingVertical: 0,
  },
  statusInlineTxt: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    marginHorizontal: 8,
    fontWeight: '500',
  },
  statusInlineTxtSuccess: {
    color: '#15803D',
  },

  memberBannerBox: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginTop: 14,
  },
  memberBannerBoxTitle: {
    color: '#15803D',
    fontSize: 14,
    fontWeight: '700',
  },
  memberBannerBoxSub: {
    color: '#166534',
    fontSize: 12,
    marginTop: 2,
  },

  pendingBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginTop: 14,
  },
  pendingBannerBoxTitle: {
    color: '#B45309',
    fontSize: 13,
    fontWeight: '700',
  },
  pendingBannerBoxSub: {
    color: '#92400E',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },

  rejectedBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginTop: 14,
  },
  rejectedBannerBoxTitle: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
  },
  rejectedBannerBoxSub: {
    color: '#991B1B',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },

  verificationBtn: {
    borderRadius: 22,
    height: 54,
    marginTop: 26,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },
  verificationBtnGradient: {
    flex: 1,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationBtnDisabled: {
    elevation: 0,
    shadowOpacity: 0,
  },
  verificationBtnTxtDisabled: {
    color: '#FFFFFF',
  },
  verificationBtnTxt: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  footerPushSpacer: {
    flex: 1,
    minHeight: 28,
  },
  bottomFooterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
  },
  bottomFooterPrefix: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '500',
  },
  bottomFooterLink: {
    color: '#FA6203',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Validation Modal Popup Card Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  validationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 68,
    paddingBottom: 22,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#0A1629',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  popupTopRightBrand: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 90,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupBrandScaleWrap: {
    width: 210,
    height: 88,
    transform: [{ scale: 0.42 }],
  },
  validationTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0A1629',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  validationSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  validationActionBtn: {
    backgroundColor: '#0F172A',
    height: 48,
    width: '100%',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  validationActionBtnTxt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
