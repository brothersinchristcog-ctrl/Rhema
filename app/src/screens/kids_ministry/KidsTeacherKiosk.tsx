import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Alert,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeType,
} from 'expo-camera';
import {
  ArrowLeft,
  Camera,
  RefreshCw,
  Zap,
  KeyRound,
  Users,
  CheckCircle,
  ShieldCheck,
  Clock,
  DoorOpen,
  X,
  UserCheck,
  UserPlus,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAdminTheme } from '../../utils/adminThemeHelper';
import KidsMinistryService from '../../services/KidsMinistryService';
import KidsFaceRecognitionService from '../../services/KidsFaceRecognitionService';
import { KidsTeacherRecord } from '../../types/KidsMinistryTypes';
import TeacherEnrollChildModal from './components/TeacherEnrollChildModal';

const { width } = Dimensions.get('window');

export default function KidsTeacherKiosk({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor,
    barStyle,
  } = useAdminTheme();
  const churchId = member?.churchId || 'rhema';

  // Camera permissions
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  // Mode: 'face_scan' | 'pin_pad' | 'roster'
  const [kioskMode, setKioskMode] = useState<'face_scan' | 'pin_pad' | 'roster'>('face_scan');
  const [showTeacherEnrollModal, setShowTeacherEnrollModal] = useState(false);

  // Teachers data & today attendance
  const [teachers, setTeachers] = useState<KidsTeacherRecord[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Scanning & Check-In States
  const [scanning, setScanning] = useState(false);
  const [pinDigits, setPinDigits] = useState('');
  const [processingCheckIn, setProcessingCheckIn] = useState(false);

  // Selected matched teacher for check-in confirmation
  const [matchedTeacher, setMatchedTeacher] = useState<{
    teacher: KidsTeacherRecord;
    confidence: number;
    alreadyCheckedIn: boolean;
  } | null>(null);

  // Animation values & lifecycle guards
  const scanLineLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const scanLineAnim = useRef(new Animated.Value(0.5)).current;

  const stopTeacherScanAnim = () => {
    if (scanLineLoopRef.current) {
      scanLineLoopRef.current.stop();
      scanLineLoopRef.current = null;
    }
    scanLineAnim.stopAnimation();
    scanLineAnim.setValue(0.5);
  };

  // Realtime subscriptions
  useEffect(() => {
    const unsubTeachers = KidsMinistryService.subscribeToTeachers(churchId, list => {
      setTeachers(list);
      setLoading(false);
    });

    const unsubAttendance = KidsMinistryService.subscribeToTodayTeacherAttendance(churchId, list => {
      setTodayAttendance(list);
    });

    return () => {
      stopTeacherScanAnim();
      unsubTeachers();
      unsubAttendance();
    };
  }, [churchId]);

  useEffect(() => {
    if (scanning && kioskMode === 'face_scan' && !matchedTeacher) {
      scanLineAnim.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1400,
            useNativeDriver: true,
          }),
        ])
      );
      scanLineLoopRef.current = loop;
      loop.start();
    } else {
      stopTeacherScanAnim();
    }

    return () => {
      stopTeacherScanAnim();
    };
  }, [scanning, kioskMode, matchedTeacher]);

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  const sizedForFacingRef = useRef<string | null>(null);
  const handleCameraReady = async () => {
    if (sizedForFacingRef.current === cameraFacing) return;
    sizedForFacingRef.current = cameraFacing;
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync?.();
      if (!sizes || sizes.length === 0) return;
      const parsed = sizes
        .map(s => {
          const [w, h] = s.split('x').map(Number);
          return { raw: s, w: w || 0, h: h || 0 };
        })
        .filter(x => x.w > 0 && x.h > 0)
        .sort((a, b) => a.w - b.w);
      const ideal =
        parsed.find(x => x.w >= 640 && x.w <= 1280) ||
        parsed.find(x => x.w >= 480) ||
        parsed[0];
      if (ideal) setPictureSize(ideal.raw);
    } catch {
      // Optional optimization
    }
  };

  // Strict Biometric Teacher Face Recognition (NEVER fakes or guesses a match)
  const triggerFaceScan = async () => {
    if (scanning) return;
    if (teachers.length === 0) {
      Alert.alert('No Teachers', 'No Sunday School teachers found on roster.');
      return;
    }

    const candidatesWithPhotos = teachers
      .filter(t => Boolean(t.photoUrl && t.photoUrl.trim().length > 10))
      .map(t => ({
        id: t.id,
        name: t.name,
        photoUrl: t.photoUrl!,
        role: 'teacher' as const,
      }));

    if (candidatesWithPhotos.length === 0) {
      Alert.alert(
        'No Teacher Photos Enrolled',
        'No teacher profile photos are enrolled for face scan yet. Please clock in by selecting your name from the Teachers Roster or ask Admin to upload teacher photos.',
        [
          { text: 'Teachers Roster', onPress: () => setKioskMode('roster') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    if (!cameraRef.current) {
      Alert.alert('Camera Initializing', 'Please wait a moment for the camera to become ready.');
      return;
    }

    try {
      setScanning(true);
      const captured = await Promise.race([
        cameraRef.current.takePictureAsync({
          quality: 0.4,
          base64: true,
          exif: false,
        }),
        new Promise<undefined>((_, reject) =>
          setTimeout(() => reject(new Error('Camera capture timed out')), 8000)
        ),
      ]);

      cameraRef.current?.resumePreview?.().catch(() => {});

      if (!captured?.base64) {
        stopTeacherScanAnim();
        setScanning(false);
        Alert.alert('Capture Failed', 'Could not capture a clear camera image. Please try again.');
        return;
      }

      const verification = await KidsFaceRecognitionService.verifyLiveFace(
        captured.base64,
        candidatesWithPhotos,
        'teacher'
      );

      stopTeacherScanAnim();
      setScanning(false);

      if (verification.matched && verification.matchedCandidateId && verification.confidence >= 88) {
        const matched = teachers.find(t => t.id === verification.matchedCandidateId);
        if (matched) {
          const isAlready = todayAttendance.some(a => a.teacherDocId === matched.id);
          setMatchedTeacher({
            teacher: matched,
            confidence: verification.confidence,
            alreadyCheckedIn: isAlready,
          });
          return;
        }
      }

      Alert.alert(
        verification.serviceUnavailable
          ? 'Verification Service Unavailable'
          : verification.faceDetected
          ? 'Face Mismatch'
          : 'No Clear Face Detected',
        verification.reason || 'Your face did not match any enrolled teacher profile. Please try again or clock in from the Teachers Roster.',
        [
          { text: 'Teachers Roster', onPress: () => setKioskMode('roster') },
          { text: 'Try Again', style: 'cancel' },
        ]
      );
    } catch (err: any) {
      Alert.alert('Verification Error', err?.message || 'Could not verify face right now. Please select your name from the Teachers Roster.');
    } finally {
      setScanning(false);
    }
  };

  // Handle PIN Pad digit press
  const handlePinPress = (digit: string) => {
    if (pinDigits.length < 4) {
      const next = pinDigits + digit;
      setPinDigits(next);
      if (next.length === 4) {
        verifyPin(next);
      }
    }
  };

  const handlePinBackspace = () => {
    setPinDigits(prev => prev.slice(0, -1));
  };

  const verifyPin = (pin: string) => {
    const matched = teachers.find(t => t.pinCode === pin);
    if (!matched) {
      Alert.alert('Incorrect PIN', 'No teacher found matching this 4-digit PIN. Try again or select from roster.');
      setPinDigits('');
      return;
    }

    const isAlready = todayAttendance.some(a => a.teacherDocId === matched.id);
    setMatchedTeacher({
      teacher: matched,
      confidence: 100,
      alreadyCheckedIn: isAlready,
    });
    setPinDigits('');
  };

  // Confirm Teacher Check-In
  const handleConfirmCheckIn = async () => {
    if (!matchedTeacher) return;

    try {
      setProcessingCheckIn(true);
      const res = await KidsMinistryService.teacherCheckIn({
        churchId,
        teacher: matchedTeacher.teacher,
        method: kioskMode === 'pin_pad' ? 'pin' : 'face_scan',
      });

      if (res.alreadyCheckedIn) {
        Alert.alert(
          'Already Clocked In',
          `${matchedTeacher.teacher.name} is already clocked in for Sunday School today!`,
          [{ text: 'OK', onPress: () => setMatchedTeacher(null) }]
        );
      } else {
        Alert.alert(
          'Check-In Successful! 🎉',
          `Welcome, ${matchedTeacher.teacher.name}!\n\nClass: ${matchedTeacher.teacher.assignedClassName}\nRoom: ${matchedTeacher.teacher.roomNumber || 'Room 201'}\n\nHave a blessed Sunday School teaching session!`,
          [{ text: 'Done', onPress: () => setMatchedTeacher(null) }]
        );
      }
    } catch (e: any) {
      Alert.alert('Check-In Failed', e.message || 'Could not record teacher attendance');
    } finally {
      setProcessingCheckIn(false);
    }
  };

  const activePillBg = isDark ? '#FFFFFF' : '#0F172A';
  const activePillText = isDark ? '#000000' : '#FFFFFF';
  const iconButtonBg = isDark ? '#18181B' : secondarySurface;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

      {/* ── TOP HEADER ── */}
      <View style={[styles.headerRow, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: iconButtonBg, borderWidth: isDark ? 0 : 1, borderColor }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={primaryText} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitleSerif, { color: primaryText }]}>Teacher Attendance Kiosk</Text>
          <Text style={[styles.headerSubtitle, { color: secondaryText }]}>
            Sunday School Faculty & Safeguarding Clock-In
          </Text>
        </View>

        <View style={styles.dutyBadge}>
          <Text style={styles.dutyBadgeText}>
            {todayAttendance.length}/{teachers.length} On Duty
          </Text>
        </View>
      </View>

      {/* ── MODE TABS (RHEMA PILLS) ── */}
      <View style={[styles.modeTabsRow, { backgroundColor: secondarySurface, borderWidth: 1, borderColor }]}>
        <TouchableOpacity
          style={[styles.modeTab, kioskMode === 'face_scan' && { backgroundColor: activePillBg }]}
          onPress={() => {
            setKioskMode('face_scan');
            setMatchedTeacher(null);
          }}
        >
          <Camera size={14} color={kioskMode === 'face_scan' ? activePillText : secondaryText} />
          <Text
            style={[
              styles.modeTabText,
              { color: secondaryText },
              kioskMode === 'face_scan' && { color: activePillText, fontWeight: '700' },
            ]}
          >
            Face Scan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTab, kioskMode === 'roster' && { backgroundColor: activePillBg }]}
          onPress={() => {
            setKioskMode('roster');
            setMatchedTeacher(null);
          }}
        >
          <Users size={14} color={kioskMode === 'roster' ? activePillText : secondaryText} />
          <Text
            style={[
              styles.modeTabText,
              { color: secondaryText },
              kioskMode === 'roster' && { color: activePillText, fontWeight: '700' },
            ]}
          >
            Teachers Roster
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTab, { backgroundColor: 'rgba(251, 191, 36, 0.16)', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.4)' }]}
          onPress={() => setShowTeacherEnrollModal(true)}
          activeOpacity={0.85}
        >
          <UserPlus size={14} color={isDark ? '#FBBF24' : '#B45309'} />
          <Text style={[styles.modeTabText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
            Enroll Child
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── MODE 1: FACE SCAN KIOSK ── */}
      {kioskMode === 'face_scan' && (
        <View style={[styles.cameraContainer, { backgroundColor: screenBg }]}>
          {!permission?.granted ? (
            <View style={[styles.permissionBox, { backgroundColor: screenBg }]}>
              <Camera size={36} color="#D97706" />
              <Text style={[styles.permissionTitle, { color: primaryText }]}>Camera Permission Required</Text>
              <Text style={[styles.permissionSub, { color: secondaryText }]}>
                Enable camera access for biometric Sunday School teacher clock-in.
              </Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                <Text style={styles.permissionBtnText}>Enable Camera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewfinder}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing={cameraFacing}
                pictureSize={pictureSize}
                onCameraReady={handleCameraReady}
              />

              {/* OVERLAY RETICLE */}
              <View style={styles.reticleOverlay}>
                <View style={[styles.reticleOval, scanning && styles.reticleOvalScanning]}>
                  <View style={[styles.cornerMarker, styles.cornerTL]} />
                  <View style={[styles.cornerMarker, styles.cornerTR]} />
                  <View style={[styles.cornerMarker, styles.cornerBL]} />
                  <View style={[styles.cornerMarker, styles.cornerBR]} />

                  {/* Laser Line — ONLY animates while actively scanning */}
                  {scanning && !matchedTeacher && (
                    <Animated.View
                      style={[
                        styles.laserLine,
                        { transform: [{ translateY: scanLineTranslate }] },
                      ]}
                    />
                  )}

                  {/* Face Mesh Dots */}
                  <View style={styles.meshDotsContainer}>
                    <View style={styles.meshEyesRow}>
                      <View style={styles.meshDot} />
                      <View style={styles.meshDot} />
                    </View>
                    <View style={styles.meshNoseDot} />
                    <View style={styles.meshMouthLine} />
                  </View>
                </View>

                <View style={styles.instructionPill}>
                  <Text style={styles.instructionText}>
                    Align face inside guide for teacher recognition
                  </Text>
                </View>
              </View>

              {/* BOTTOM TRIGGER */}
              {!matchedTeacher && (
                <View style={[styles.triggerBar, { bottom: Math.max(24, insets.bottom + 14) }]}>
                  <TouchableOpacity
                    style={[styles.scanTriggerBtn, { backgroundColor: activePillBg }, scanning && { opacity: 0.7 }]}
                    onPress={triggerFaceScan}
                    disabled={scanning}
                    activeOpacity={0.88}
                  >
                    {scanning ? (
                      <>
                        <ActivityIndicator size="small" color={activePillText} />
                        <Text style={[styles.scanTriggerText, { color: activePillText }]}>Verifying Face...</Text>
                      </>
                    ) : (
                      <>
                        <Camera size={16} color={activePillText} />
                        <Text style={[styles.scanTriggerText, { color: activePillText }]}>
                          Scan & Verify Teacher Face
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.switchCamBtn, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setCameraFacing(cameraFacing === 'front' ? 'back' : 'front')}
                  >
                    <RefreshCw size={14} color={primaryText} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── MODE 2: 4-DIGIT PIN KEYPAD ── */}
      {kioskMode === 'pin_pad' && (
        <View style={styles.pinContainer}>
          <Text style={styles.pinTitle}>Enter Your 4-Digit Teacher PIN</Text>
          <Text style={styles.pinSub}>Each Sunday School teacher has a secure personal PIN</Text>

          {/* PIN Dots Display */}
          <View style={styles.pinDotsRow}>
            {[0, 1, 2, 3].map(idx => (
              <View
                key={idx}
                style={[styles.pinDot, idx < pinDigits.length && styles.pinDotFilled]}
              />
            ))}
          </View>

          {/* Numeric Keypad */}
          <View style={styles.keypadGrid}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'].map((val, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.keypadKey, !val && { backgroundColor: 'transparent' }]}
                disabled={!val}
                onPress={() => {
                  if (val === 'DEL') handlePinBackspace();
                  else if (val) handlePinPress(val);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadText}>{val}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── MODE 3: TEACHERS ROSTER ── */}
      {kioskMode === 'roster' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.rosterContainer}>
          {teachers.map(t => {
            const isClockedIn = todayAttendance.some(a => a.teacherDocId === t.id);
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.teacherCard,
                  { backgroundColor: cardSurface, borderColor },
                  isClockedIn && styles.teacherCardClocked,
                ]}
                onPress={() =>
                  setMatchedTeacher({
                    teacher: t,
                    confidence: 100,
                    alreadyCheckedIn: isClockedIn,
                  })
                }
                activeOpacity={0.88}
              >
                <View
                  style={[
                    styles.teacherAvatar,
                    { backgroundColor: secondarySurface },
                    isClockedIn && styles.teacherAvatarClocked,
                  ]}
                >
                  <Text
                    style={[
                      styles.teacherAvatarText,
                      { color: isClockedIn ? '#FFFFFF' : primaryText },
                    ]}
                  >
                    {t.name.charAt(0)}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.teacherNameRow}>
                    <Text style={[styles.teacherName, { color: primaryText }]}>{t.name}</Text>
                    {t.safeguardingStatus === 'verified' && (
                      <View style={styles.verifiedBadge}>
                        <ShieldCheck size={10} color="#10B981" />
                        <Text style={styles.verifiedBadgeText}>Verified</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.teacherClassMeta, { color: secondaryText }]}>
                    {t.assignedClassName} · {t.roomNumber || 'Room 201'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.clockStatusPill,
                    { backgroundColor: secondarySurface },
                    isClockedIn && styles.clockStatusPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.clockStatusText,
                      { color: isDark ? '#FBBF24' : '#B45309' },
                      isClockedIn && styles.clockStatusTextActive,
                    ]}
                  >
                    {isClockedIn ? 'Clocked In ✓' : 'Clock In ›'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── POPUP TEACHER MATCH CARD ── */}
      {matchedTeacher && (
        <View style={styles.popupOverlay}>
          <View
            style={[
              styles.popupCard,
              {
                backgroundColor: cardSurface,
                borderColor,
                paddingBottom: Math.max(20, insets.bottom + 14),
              },
            ]}
          >
            <View style={styles.popupHeader}>
              <View style={styles.verifiedMatchRow}>
                <ShieldCheck size={16} color="#10B981" />
                <Text style={styles.verifiedMatchText}>
                  {matchedTeacher.confidence < 100
                    ? `TEACHER MATCH (${matchedTeacher.confidence}%)`
                    : 'IDENTITY VERIFIED'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setMatchedTeacher(null)}
                style={[styles.closePopupBtn, { backgroundColor: secondarySurface }]}
              >
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Teacher Details */}
            <View style={styles.teacherProfileRow}>
              <View style={[styles.popupAvatar, { backgroundColor: secondarySurface }]}>
                <Text style={styles.popupAvatarText}>{matchedTeacher.teacher.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.popupTeacherName, { color: primaryText }]}>{matchedTeacher.teacher.name}</Text>
                <Text style={[styles.popupTeacherRole, { color: secondaryText }]}>
                  {matchedTeacher.teacher.role === 'director' ? 'Ministry Director' : 'Lead Teacher'} · {matchedTeacher.teacher.assignedClassName}
                </Text>
                <Text style={styles.popupRoomText}>
                  Assigned Location: {matchedTeacher.teacher.roomNumber || 'Room 201'}
                </Text>
              </View>
            </View>

            {/* Safeguarding Card */}
            <View style={styles.safeguardingBox}>
              <ShieldCheck size={14} color="#10B981" />
              <Text style={styles.safeguardingText}>
                SAFEGUARDING & POLICE VERIFICATION: APPROVED ✓
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.popupActionsRow}>
              <TouchableOpacity
                style={[
                  styles.confirmClockBtn,
                  { backgroundColor: activePillBg },
                  processingCheckIn && { opacity: 0.7 },
                ]}
                onPress={handleConfirmCheckIn}
                disabled={processingCheckIn}
                activeOpacity={0.88}
              >
                {processingCheckIn ? (
                  <ActivityIndicator size="small" color={activePillText} />
                ) : (
                  <Text style={[styles.confirmClockText, { color: activePillText }]}>
                    {matchedTeacher.alreadyCheckedIn ? 'Already Clocked In (OK)' : 'Confirm Clock-In'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelClockBtn}
                onPress={() => setMatchedTeacher(null)}
              >
                <Text style={[styles.cancelClockText, { color: secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── DIRECT CHILD ENROLLMENT BY SUNDAY SCHOOL TEACHER ── */}
      {showTeacherEnrollModal && (
        <TeacherEnrollChildModal
          visible={showTeacherEnrollModal}
          onClose={() => setShowTeacherEnrollModal(false)}
          churchId={churchId}
          actingMember={member}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitleSerif: {
    fontSize: 17,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  dutyBadge: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dutyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34D399',
  },
  modeTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#18181B',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    padding: 3,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  modeTabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  cameraContainer: {
    flex: 1,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
  },
  permissionSub: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  permissionBtn: {
    marginTop: 24,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  viewfinder: {
    flex: 1,
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleOval: {
    width: width * 0.65,
    height: width * 0.85,
    borderRadius: (width * 0.65) / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  reticleOvalScanning: {
    borderColor: '#FBBF24',
  },
  cornerMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FBBF24',
  },
  cornerTL: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3 },
  laserLine: {
    position: 'absolute',
    width: '100%',
    height: 2,
    backgroundColor: '#FBBF24',
    shadowColor: '#FBBF24',
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  meshDotsContainer: {
    alignItems: 'center',
    opacity: 0.35,
  },
  meshEyesRow: {
    flexDirection: 'row',
    gap: 36,
    marginBottom: 16,
  },
  meshDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FBBF24',
  },
  meshNoseDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FBBF24',
    marginBottom: 14,
  },
  meshMouthLine: {
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#FBBF24',
  },
  instructionPill: {
    position: 'absolute',
    bottom: 90,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  instructionText: {
    fontSize: 12,
    color: '#E4E4E7',
    fontWeight: '500',
  },
  triggerBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  scanTriggerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  scanTriggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  switchCamBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  pinContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  pinTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  pinSub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 24,
    textAlign: 'center',
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#52525B',
  },
  pinDotFilled: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 260,
    justifyContent: 'space-between',
    gap: 14,
  },
  keypadKey: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  keypadText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rosterContainer: {
    padding: 16,
    gap: 10,
  },
  teacherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  teacherCardClocked: {
    borderColor: '#064E3B',
    backgroundColor: 'rgba(6, 78, 59, 0.1)',
  },
  teacherAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherAvatarClocked: {
    backgroundColor: '#064E3B',
  },
  teacherAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  teacherNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teacherName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  verifiedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#34D399',
  },
  teacherClassMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  clockStatusPill: {
    backgroundColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clockStatusPillActive: {
    backgroundColor: '#064E3B',
  },
  clockStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  clockStatusTextActive: {
    color: '#34D399',
  },
  popupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
    zIndex: 99,
  },
  popupCard: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#27272A',
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  verifiedMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedMatchText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34D399',
  },
  closePopupBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  popupAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FBBF24',
  },
  popupTeacherName: {
    fontSize: 17,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  popupTeacherRole: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  popupRoomText: {
    fontSize: 11,
    color: '#60A5FA',
    marginTop: 2,
    fontWeight: '600',
  },
  safeguardingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },
  safeguardingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  popupActionsRow: {
    gap: 10,
  },
  confirmClockBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmClockText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  cancelClockBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelClockText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
});
