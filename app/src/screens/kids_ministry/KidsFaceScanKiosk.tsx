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
  Image,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from 'expo-camera';
import {
  ArrowLeft,
  Camera,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  QrCode,
  Shield,
  ShieldCheck,
  ShieldAlert,
  X,
  Trash2,
  Lock,
  UserPlus,
  Users,
  WifiOff,
  RotateCcw,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAdminTheme } from '../../utils/adminThemeHelper';
import KidsMinistryService from '../../services/KidsMinistryService';
import KidsFaceRecognitionService, {
  FaceVerificationProgressStage,
} from '../../services/KidsFaceRecognitionService';
import { ChildRecord, KidsProgramType, KidsSessionRecord, KidsAttendanceSession } from '../../types/KidsMinistryTypes';
import { formatDateDisplay, toStandardDateString } from '../../utils/DateUtils';
import TeacherEnrollChildModal from './components/TeacherEnrollChildModal';

const { width } = Dimensions.get('window');
const OVAL_WIDTH = Math.min(width * 0.56, 215);
const OVAL_HEIGHT = Math.round(OVAL_WIDTH * 1.28);
const BARCODE_SETTINGS: { barcodeTypes: BarcodeType[] } = { barcodeTypes: ['qr'] };

type KioskMode = 'face_scan' | 'scan_qr' | 'manual';
type ScanPhase =
  | 'ready'
  | 'scanning'
  | 'verifying'
  | 'success'
  | 'mismatch'
  | 'failed'
  | 'error';

interface OutcomeDetails {
  headline: string;
  detail: string;
  differences?: string[];
  expectedChild?: ChildRecord | null;
  sourceMethod?: 'face_scan' | 'scan_qr' | 'manual';
}

export default function KidsFaceScanKiosk({ route, navigation }: any) {
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

  const initialTargetChildId: string | undefined = route?.params?.targetChildId;
  const targetSessionId: string | undefined = route?.params?.targetSessionId;
  const sessionTitle: string | undefined = route?.params?.sessionTitle;
  const programType: KidsProgramType | undefined = route?.params?.programType;
  const sessionDate: string | undefined = route?.params?.sessionDate;

  // Camera permissions & config
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');

  // Kiosk Mode
  const [kioskMode, setKioskMode] = useState<KioskMode>('face_scan');

  // Enrolled children & custody records scoped strictly to targetSessionId
  const [enrolledChildren, setEnrolledChildren] = useState<ChildRecord[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(initialTargetChildId || null);
  const [loadingKids, setLoadingKids] = useState(true);
  const [sessionCustodyRecords, setSessionCustodyRecords] = useState<KidsSessionRecord[]>([]);

  // Modals
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTeacherEnrollModal, setShowTeacherEnrollModal] = useState(false);

  // Unified Verification State Machine
  const cameraRef = useRef<CameraView>(null);
  const [scanPhase, setScanPhase] = useState<ScanPhase>('ready');
  const [statusMessage, setStatusMessage] = useState('Ready to Scan');
  const [statusSubMessage, setStatusSubMessage] = useState(
    'Center face inside the frame and tap Start Face Scan.'
  );
  const [outcomeDetails, setOutcomeDetails] = useState<OutcomeDetails | null>(null);
  const [scannedResult, setScannedResult] = useState<{
    child: ChildRecord;
    confidence: number;
    pickupCode?: string;
    alreadyCheckedIn?: boolean;
    method: 'face_scan' | 'scan_qr' | 'manual';
  } | null>(null);

  // Manual search query & check-in submission
  const [searchQuery, setSearchQuery] = useState('');
  const [processingCheckIn, setProcessingCheckIn] = useState(false);

  // Strict lifecycle & duplicate-scan prevention guards
  const isMountedRef = useRef(true);
  const scanInFlightRef = useRef(false);
  const activeScanIdRef = useRef(0);
  const sweepLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const sweepAnim = useRef(new Animated.Value(0.5)).current;

  const stopScanAnimation = () => {
    if (sweepLoopRef.current) {
      sweepLoopRef.current.stop();
      sweepLoopRef.current = null;
    }
    sweepAnim.stopAnimation();
    sweepAnim.setValue(0.5);
  };

  const resetScanStateOnly = () => {
    activeScanIdRef.current += 1;
    scanInFlightRef.current = false;
    stopScanAnimation();
    setScannedResult(null);
    setOutcomeDetails(null);
    setScanPhase('ready');
    setStatusMessage('Ready to Scan');
    setStatusSubMessage('Center face inside the frame and tap Start Face Scan.');
  };

  const resetScanToReady = () => {
    resetScanStateOnly();
  };

  const switchCameraFacing = (nextFacing: 'front' | 'back') => {
    setCameraFacing(nextFacing);
  };

  // Load registered children & reconcile profile photos
  useEffect(() => {
    isMountedRef.current = true;
    KidsMinistryService.reconcileAllChildPhotos(churchId).catch(() => {});

    const unsub = KidsMinistryService.subscribeToAllChildren(churchId, list => {
      if (!isMountedRef.current) return;
      setEnrolledChildren(list);
      setLoadingKids(false);
    });

    let unsubCustody: (() => void) | null = null;
    if (targetSessionId) {
      const dummySession = {
        id: targetSessionId,
        programType: programType || 'sunday_school',
        programTitle: sessionTitle || 'Sunday School',
        date: sessionDate || toStandardDateString(new Date()),
        status: 'active',
        churchId,
      } as KidsAttendanceSession;
      unsubCustody = KidsMinistryService.subscribeToSessionCustodyRecords(
        churchId,
        dummySession,
        recs => {
          if (!isMountedRef.current) return;
          setSessionCustodyRecords(recs || []);
        }
      );
    } else {
      setSessionCustodyRecords([]);
    }

    return () => {
      isMountedRef.current = false;
      activeScanIdRef.current += 1;
      scanInFlightRef.current = false;
      stopScanAnimation();
      unsub();
      if (unsubCustody) unsubCustody();
    };
  }, [churchId, targetSessionId, sessionDate, programType, sessionTitle]);

  const getChildSessionCheckInStatus = (
    child: ChildRecord
  ): { alreadyCheckedIn: boolean; pickupCode?: string } => {
    if (targetSessionId) {
      const activeRec = sessionCustodyRecords.find(
        r => r.childDocId === child.id && r.status === 'active'
      );
      return {
        alreadyCheckedIn: Boolean(activeRec),
        pickupCode: activeRec?.pickupCode,
      };
    }
    return {
      alreadyCheckedIn: child.custodyStatus === 'checked_in',
      pickupCode: child.activePickupCode,
    };
  };

  const isScanningOrVerifying = scanPhase === 'scanning' || scanPhase === 'verifying';

  // Run sweep beam strictly ONLY while actively scanning/verifying in face_scan mode
  useEffect(() => {
    if (kioskMode === 'face_scan' && isScanningOrVerifying) {
      sweepAnim.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(sweepAnim, {
            toValue: 1,
            duration: 1300,
            useNativeDriver: true,
          }),
          Animated.timing(sweepAnim, {
            toValue: 0,
            duration: 1300,
            useNativeDriver: true,
          }),
        ])
      );
      sweepLoopRef.current = loop;
      loop.start();
    } else {
      stopScanAnimation();
    }

    return () => {
      stopScanAnimation();
    };
  }, [kioskMode, scanPhase]);

  const sweepTranslate = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-OVAL_HEIGHT / 2 + 16, OVAL_HEIGHT / 2 - 16],
  });

  const activeTargetChild = selectedChildId
    ? enrolledChildren.find(c => c.id === selectedChildId) || null
    : null;

  const childrenWithPhotos = enrolledChildren.filter(c =>
    Boolean(c.photoUrl && c.photoUrl.trim().length > 10)
  );

  // Trigger strict 1:1 or 1:N biometric face recognition
  const triggerFaceRecognition = async () => {
    if (scanInFlightRef.current || isScanningOrVerifying) return;

    if (enrolledChildren.length === 0) {
      Alert.alert('No Children Enrolled', 'Please enroll children in Sunday School first.');
      return;
    }

    const candidatePool = activeTargetChild ? [activeTargetChild] : enrolledChildren;
    const candidatesWithPhotos = candidatePool
      .filter(c => Boolean(c.photoUrl && c.photoUrl.trim().length > 10))
      .map(c => ({
        id: c.id,
        name: c.fullName,
        photoUrl: c.photoUrl!,
        role: 'child' as const,
        age: c.age,
        gender: c.gender,
      }));

    if (candidatesWithPhotos.length === 0) {
      stopScanAnimation();
      setScanPhase('error');
      setStatusMessage('Unable to Complete Face Verification. Please Try Again.');
      setOutcomeDetails({
        headline: activeTargetChild
          ? `No Reference Photo for ${activeTargetChild.fullName}`
          : 'No Registered Child Photos Found',
        detail: activeTargetChild
          ? `${activeTargetChild.fullName} does not have a registered face photo yet. Upload a profile photo or use QR Code / Manual Search.`
          : 'No enrolled children have profile photos uploaded yet. Please enroll a photo or check in via QR Code / Manual Search.',
        expectedChild: activeTargetChild,
      });
      return;
    }

    if (!cameraRef.current) {
      Alert.alert('Camera Initializing', 'Please wait a moment for the camera to become ready.');
      return;
    }

    scanInFlightRef.current = true;
    const runId = ++activeScanIdRef.current;

    try {
      // Stage 1: Detecting Face
      setScannedResult(null);
      setOutcomeDetails(null);
      setScanPhase('scanning');
      setStatusMessage('Detecting Face...');
      setStatusSubMessage(
        activeTargetChild
          ? `Capturing live photo to verify ${activeTargetChild.fullName}...`
          : `Capturing live photo to search ${candidatesWithPhotos.length} registered child profiles...`
      );

      let captured: { base64?: string } | undefined;
      try {
        captured = await Promise.race([
          cameraRef.current.takePictureAsync({
            quality: 0.45,
            base64: true,
            exif: false,
          }),
          new Promise<undefined>((_, reject) =>
            setTimeout(() => reject(new Error('Camera capture timed out')), 9000)
          ),
        ]);
      } catch {
        if (!isMountedRef.current || activeScanIdRef.current !== runId) return;
        stopScanAnimation();
        setScanPhase('error');
        setStatusMessage('Unable to Complete Face Verification. Please Try Again.');
        setOutcomeDetails({
          headline: 'Camera Capture Timed Out',
          detail: 'The camera could not capture a steady photo in time. Please tap Try Again or use QR / Manual check-in.',
          expectedChild: activeTargetChild,
        });
        return;
      }

      if (!isMountedRef.current || activeScanIdRef.current !== runId) return;

      if (!captured?.base64) {
        stopScanAnimation();
        setScanPhase('failed');
        setStatusMessage('Face Not Recognized');
        setOutcomeDetails({
          headline: 'No Clear Photo Captured',
          detail: 'Could not read a clear image from the camera. Hold steady in good lighting and try again.',
          expectedChild: activeTargetChild,
        });
        return;
      }

      // Stage 2: Verifying Identity
      setScanPhase('verifying');
      setStatusMessage('Verifying Identity...');
      setStatusSubMessage(
        activeTargetChild
          ? `Comparing captured face against ${activeTargetChild.fullName}'s profile...`
          : `Comparing captured face across ${candidatesWithPhotos.length} registered children...`
      );

      const onProgress = (stage: FaceVerificationProgressStage) => {
        if (!isMountedRef.current || activeScanIdRef.current !== runId) return;
        if (stage === 'loading_photos') {
          setStatusSubMessage('Loading registered reference photo(s)...');
        } else if (stage === 'comparing') {
          setStatusSubMessage(
            activeTargetChild
              ? `Checking facial match with ${activeTargetChild.fullName}...`
              : `Searching ${candidatesWithPhotos.length} registered child profiles...`
          );
        } else if (stage === 'confirming') {
          setStatusSubMessage('Confirming verified identity match...');
        }
      };

      const verification =
        activeTargetChild && candidatesWithPhotos.length === 1
          ? await KidsFaceRecognitionService.verifyTargetChildFace(
              captured.base64,
              candidatesWithPhotos[0],
              onProgress
            )
          : await KidsFaceRecognitionService.verifyLiveFace(
              captured.base64,
              candidatesWithPhotos,
              'child',
              onProgress
            );

      if (!isMountedRef.current || activeScanIdRef.current !== runId) return;

      // Immediately stop scanning animation & transition off camera view upon receiving response
      stopScanAnimation();

      // Strict check: only show success when backend confirms match + valid enrolled child exists
      if (
        verification.status === 'matched' &&
        verification.matched &&
        verification.matchedCandidateId &&
        verification.confidence >= 88
      ) {
        const matchedChild = enrolledChildren.find(c => c.id === verification.matchedCandidateId);
        if (matchedChild) {
          // Extra guard in 1:1 mode: returned ID must strictly match the expected child
          if (activeTargetChild && matchedChild.id !== activeTargetChild.id) {
            setScanPhase('mismatch');
            setStatusMessage('Face Does Not Match This Child');
            setOutcomeDetails({
              headline: `Face Does Not Match ${activeTargetChild.fullName}`,
              detail: `The scanned face did not verify as ${activeTargetChild.fullName}. Check-in was blocked.`,
              expectedChild: activeTargetChild,
            });
            return;
          }

          const sessionStatus = getChildSessionCheckInStatus(matchedChild);
          setScanPhase('success');
          setStatusMessage('Face Verified Successfully');
          setScannedResult({
            child: matchedChild,
            confidence: verification.confidence,
            pickupCode: sessionStatus.pickupCode,
            alreadyCheckedIn: sessionStatus.alreadyCheckedIn,
            method: 'face_scan',
          });
          setOutcomeDetails({
            headline: `Verified: ${matchedChild.fullName}`,
            detail: verification.reason || 'Biometric identity confirmed against registered profile.',
          });
          return;
        }
      }

      // Error / Timeout / Service Unavailable
      if (
        verification.status === 'timeout' ||
        verification.status === 'service_unavailable' ||
        verification.status === 'error' ||
        verification.serviceUnavailable
      ) {
        setScanPhase('error');
        setStatusMessage('Unable to Complete Face Verification. Please Try Again.');
        setOutcomeDetails({
          headline: verification.timedOut
            ? 'Verification Request Timed Out'
            : 'Face Verification Unavailable',
          detail:
            verification.reason ||
            'Unable to complete face verification right now. Please try again, or switch to QR Code or Manual Search.',
          expectedChild: activeTargetChild,
        });
        return;
      }

      // No clear face detected
      if (!verification.faceDetected || verification.status === 'no_face') {
        setScanPhase('failed');
        setStatusMessage('Face Not Recognized');
        setOutcomeDetails({
          headline: 'No Clear Face Detected',
          detail:
            verification.reason ||
            'Make sure the child is facing the camera directly inside the oval frame with clear lighting.',
          expectedChild: activeTargetChild,
        });
        return;
      }

      // Face detected but does not match expected child (1:1) vs unrecognized in 1:N search
      if (activeTargetChild) {
        setScanPhase('mismatch');
        setStatusMessage('Face Does Not Match This Child');
        setOutcomeDetails({
          headline: `Expected ${activeTargetChild.fullName}`,
          detail:
            verification.reason ||
            `The scanned face does not match ${activeTargetChild.fullName}'s registered profile photo. No other child was selected.`,
          differences: verification.differencesFound,
          expectedChild: activeTargetChild,
        });
      } else {
        setScanPhase('failed');
        setStatusMessage('Face Not Recognized');
        setOutcomeDetails({
          headline: 'Face Not Recognized Among Registered Children',
          detail:
            verification.reason ||
            'The captured face does not match any enrolled child profile. Please verify enrollment or use Manual Search / QR Code.',
          differences: verification.differencesFound,
        });
      }
    } catch (err: any) {
      if (!isMountedRef.current || activeScanIdRef.current !== runId) return;
      stopScanAnimation();
      setScanPhase('error');
      setStatusMessage('Unable to Complete Face Verification. Please Try Again.');
      setOutcomeDetails({
        headline: 'Verification Service Error',
        detail:
          err?.message ||
          'An unexpected error occurred while verifying identity. Please try again or use QR / Manual check-in.',
        expectedChild: activeTargetChild,
      });
    } finally {
      scanInFlightRef.current = false;
    }
  };

  // Handle QR code detected by CameraView
  const handleQrDetected = async (result: BarcodeScanningResult) => {
    if (processingCheckIn || scanPhase === 'success') return;

    try {
      setProcessingCheckIn(true);
      const child = await KidsMinistryService.findChildByScanQuery(churchId, result.data);
      if (child) {
        stopScanAnimation();
        const sessionStatus = getChildSessionCheckInStatus(child);
        setScanPhase('success');
        setStatusMessage('Child Identified via QR Code');
        setScannedResult({
          child,
          confidence: 100,
          pickupCode: sessionStatus.pickupCode,
          alreadyCheckedIn: sessionStatus.alreadyCheckedIn,
          method: 'scan_qr',
        });
      } else {
        Alert.alert('Invalid QR Code', 'No registered child found matching this QR code.');
      }
    } catch (e: any) {
      Alert.alert('Scan Error', e?.message || 'Could not process QR code.');
    } finally {
      setProcessingCheckIn(false);
    }
  };

  // Confirm Check-In
  const handleConfirmCheckIn = async () => {
    if (!scannedResult || processingCheckIn) return;
    setProcessingCheckIn(true);

    try {
      const staffName =
        member?.name || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Admin';
      const result = await KidsMinistryService.checkInChild({
        churchId,
        child: scannedResult.child,
        method: scannedResult.method === 'scan_qr' ? 'qr_code' : scannedResult.method,
        checkedInByMemberId: member?.id || 'kiosk_station',
        checkedInByName: staffName,
        programSessionId: targetSessionId,
        programType: programType || 'sunday_school',
        programTitle: sessionTitle || 'Sunday School',
        sessionDate: sessionDate || undefined,
      });

      if (result.alreadyCheckedIn) {
        Alert.alert(
          'Already Checked In',
          `${scannedResult.child.fullName} is already checked in!\n\nActive Pickup Code: ${result.session.pickupCode}`,
          [{ text: 'OK', onPress: resetScanToReady }]
        );
      } else {
        Alert.alert(
          'Check-In Confirmed',
          `${scannedResult.child.fullName} has been checked in.\n\nClass: ${scannedResult.child.assignedClassName || 'Sunday School'}\nPickup Code: ${result.session.pickupCode}`,
          [{ text: 'Done', onPress: resetScanToReady }]
        );
      }
    } catch (e: any) {
      Alert.alert('Check-In Failed', e?.message || 'Could not record check-in.');
    } finally {
      setProcessingCheckIn(false);
    }
  };

  // Manual Search Filter
  const manualFiltered = enrolledChildren.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.childId.toLowerCase().includes(q) ||
      (c.parentPhone || '').includes(q)
    );
  });

  const getScannerBorderColor = () => {
    if (scanPhase === 'verifying') return '#818CF8';
    if (scanPhase === 'scanning') return '#38BDF8';
    return '#FBBF24';
  };

  const activePillBg = isDark ? '#FFFFFF' : '#0F172A';
  const activePillText = isDark ? '#000000' : '#FFFFFF';
  const iconButtonBg = isDark ? '#18181B' : secondarySurface;

  const isOutcomePhase =
    scanPhase === 'success' ||
    scanPhase === 'mismatch' ||
    scanPhase === 'failed' ||
    scanPhase === 'error';

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

      {/* ── HEADER ── */}
      <View style={[styles.headerRow, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: iconButtonBg, borderColor, borderWidth: isDark ? 0 : 1 }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={primaryText} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitleSerif, { color: primaryText }]} numberOfLines={1}>
            {sessionTitle || 'Child Check-In'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: secondaryText }]} numberOfLines={1}>
            {targetSessionId
              ? `${sessionDate ? `${formatDateDisplay(sessionDate)} · ` : ''}Program Attendance`
              : 'Verify Identity & Attendance'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={styles.headerEnrollBtn}
            onPress={() => setShowTeacherEnrollModal(true)}
            activeOpacity={0.85}
          >
            <UserPlus size={13} color="#000000" strokeWidth={2.5} />
            <Text style={styles.headerEnrollBtnText}>Enroll</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: iconButtonBg, borderColor, borderWidth: isDark ? 0 : 1 }]}
            onPress={() => setShowPrivacyModal(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ShieldCheck size={18} color="#10B981" />
          </TouchableOpacity>

          {kioskMode !== 'manual' && !isOutcomePhase && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: iconButtonBg, borderColor, borderWidth: isDark ? 0 : 1 }]}
              onPress={() => switchCameraFacing(cameraFacing === 'front' ? 'back' : 'front')}
              disabled={isScanningOrVerifying}
            >
              <RefreshCw size={16} color={primaryText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── CHECK-IN MODE TABS ── */}
      <View style={[styles.modeTabsRow, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            kioskMode === 'face_scan' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          disabled={isScanningOrVerifying}
          onPress={() => {
            setKioskMode('face_scan');
            switchCameraFacing('front');
            resetScanStateOnly();
          }}
        >
          <Camera size={14} color={kioskMode === 'face_scan' ? activePillText : secondaryText} />
          <Text
            style={[
              styles.modeTabText,
              { color: secondaryText },
              kioskMode === 'face_scan' && { color: activePillText, fontWeight: '800' },
            ]}
          >
            Face Scan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            kioskMode === 'scan_qr' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          disabled={isScanningOrVerifying}
          onPress={() => {
            setKioskMode('scan_qr');
            switchCameraFacing('back');
            resetScanStateOnly();
          }}
        >
          <QrCode size={14} color={kioskMode === 'scan_qr' ? activePillText : secondaryText} />
          <Text
            style={[
              styles.modeTabText,
              { color: secondaryText },
              kioskMode === 'scan_qr' && { color: activePillText, fontWeight: '800' },
            ]}
          >
            Parent QR
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            kioskMode === 'manual' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          disabled={isScanningOrVerifying}
          onPress={() => {
            setKioskMode('manual');
            resetScanToReady();
          }}
        >
          <Search size={14} color={kioskMode === 'manual' ? activePillText : secondaryText} />
          <Text
            style={[
              styles.modeTabText,
              { color: secondaryText },
              kioskMode === 'manual' && { color: activePillText, fontWeight: '800' },
            ]}
          >
            Manual List
          </Text>
        </TouchableOpacity>
      </View>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* DEDICATED VERIFICATION OUTCOME VIEW (STOPS SCANNING SCREEN!)    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {isOutcomePhase ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.outcomeScroll,
            { paddingBottom: Math.max(28, insets.bottom + 18) },
          ]}
        >
          {/* 1. VERIFICATION SUCCESS */}
          {scanPhase === 'success' && scannedResult && (
            <View
              style={[
                styles.outcomeCard,
                {
                  backgroundColor: cardSurface,
                  borderColor: '#10B981',
                },
              ]}
            >
              <View
                style={[
                  styles.outcomeStatusBanner,
                  { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5' },
                ]}
              >
                <CheckCircle size={20} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.outcomeBannerLabel, { color: '#10B981' }]}>
                    {scannedResult.method === 'face_scan'
                      ? 'Face Verified Successfully'
                      : scannedResult.method === 'scan_qr'
                      ? 'QR Pass Verified'
                      : 'Child Selected Manually'}
                  </Text>
                  <Text style={[styles.outcomeBannerSub, { color: secondaryText }]}>
                    {scannedResult.method === 'face_scan'
                      ? `Identity confirmed against registered profile (${scannedResult.confidence}% match)`
                      : 'Ready to complete Sunday School attendance'}
                  </Text>
                </View>
              </View>

              {/* Verified Child Profile */}
              <View style={[styles.verifiedProfileBox, { backgroundColor: secondarySurface, borderColor }]}>
                {scannedResult.child.photoUrl ? (
                  <Image
                    source={{ uri: scannedResult.child.photoUrl }}
                    style={styles.verifiedAvatarPhoto}
                  />
                ) : (
                  <View style={styles.verifiedAvatarFallback}>
                    <Text style={styles.verifiedAvatarLetter}>
                      {scannedResult.child.firstName.charAt(0)}
                    </Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={[styles.verifiedChildName, { color: primaryText }]}>
                    {scannedResult.child.fullName}
                  </Text>
                  <Text style={[styles.verifiedChildMeta, { color: secondaryText }]}>
                    {scannedResult.child.assignedClassName || 'Sunday School'} · Age {scannedResult.child.age}
                  </Text>
                  <Text style={[styles.verifiedChildId, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    ID: {scannedResult.child.childId}
                  </Text>
                </View>
              </View>

              {scannedResult.child.medical?.hasAllergies && (
                <View style={styles.allergyWarningBox}>
                  <AlertTriangle size={15} color="#EF4444" />
                  <Text style={[styles.allergyWarningText, { color: isDark ? '#FCA5A5' : '#DC2626' }]}>
                    MEDICAL ALERT: {scannedResult.child.medical.allergiesList.join(', ')}
                  </Text>
                </View>
              )}

              <View style={[styles.attendanceNoteBox, { backgroundColor: secondarySurface, borderColor }]}>
                <Text style={[styles.attendanceNoteTitle, { color: isDark ? '#34D399' : '#047857' }]}>
                  {scannedResult.alreadyCheckedIn
                    ? 'Already Checked In Today'
                    : 'Ready to Mark Present'}
                </Text>
                <Text style={[styles.attendanceNoteSub, { color: secondaryText }]}>
                  {scannedResult.alreadyCheckedIn
                    ? `${scannedResult.child.firstName} is already checked in.${scannedResult.pickupCode ? ` Active Pickup Code: ${scannedResult.pickupCode}` : ''}`
                    : `Tap "Confirm Check-In" below to check in ${scannedResult.child.firstName} and issue today's pickup code.`}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryOutcomeBtn, { backgroundColor: '#10B981' }]}
                onPress={handleConfirmCheckIn}
                disabled={processingCheckIn}
                activeOpacity={0.86}
              >
                {processingCheckIn ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle size={18} color="#FFFFFF" />
                    <Text style={styles.primaryOutcomeBtnText}>
                      {scannedResult.alreadyCheckedIn ? 'View Active Session' : 'Confirm Check-In'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryOutcomeBtn, { backgroundColor: secondarySurface, borderColor }]}
                onPress={resetScanToReady}
                activeOpacity={0.85}
              >
                <RotateCcw size={15} color={primaryText} />
                <Text style={[styles.secondaryOutcomeBtnText, { color: primaryText }]}>
                  Scan Another Child
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 2. FACE MISMATCH WARNING (STRICT 1:1 FAILURE) */}
          {scanPhase === 'mismatch' && (
            <View
              style={[
                styles.outcomeCard,
                {
                  backgroundColor: cardSurface,
                  borderColor: '#EF4444',
                },
              ]}
            >
              <View
                style={[
                  styles.outcomeStatusBanner,
                  { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2' },
                ]}
              >
                <ShieldAlert size={22} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.outcomeBannerLabel, { color: '#EF4444' }]}>
                    Face Does Not Match This Child
                  </Text>
                  <Text style={[styles.outcomeBannerSub, { color: secondaryText }]}>
                    Check-in blocked · Please verify the child standing at check-in
                  </Text>
                </View>
              </View>

              {outcomeDetails?.expectedChild && (
                <View style={[styles.verifiedProfileBox, { backgroundColor: secondarySurface, borderColor }]}>
                  {outcomeDetails.expectedChild.photoUrl ? (
                    <Image
                      source={{ uri: outcomeDetails.expectedChild.photoUrl }}
                      style={styles.verifiedAvatarPhoto}
                    />
                  ) : (
                    <View style={styles.verifiedAvatarFallback}>
                      <Text style={styles.verifiedAvatarLetter}>
                        {outcomeDetails.expectedChild.firstName.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expectedLabel, { color: '#EF4444' }]}>
                      EXPECTED CHILD PROFILE
                    </Text>
                    <Text style={[styles.verifiedChildName, { color: primaryText }]}>
                      {outcomeDetails.expectedChild.fullName}
                    </Text>
                    <Text style={[styles.verifiedChildMeta, { color: secondaryText }]}>
                      The live camera face did not match this registered profile.
                    </Text>
                  </View>
                </View>
              )}

              <Text style={[styles.outcomeBodyText, { color: secondaryText }]}>
                {outcomeDetails?.detail ||
                  'The captured face does not match this child. Another child was not selected automatically.'}
              </Text>

              <TouchableOpacity
                style={[styles.primaryOutcomeBtn, { backgroundColor: activePillBg }]}
                onPress={resetScanToReady}
                activeOpacity={0.86}
              >
                <Camera size={17} color={activePillText} />
                <Text style={[styles.primaryOutcomeBtnText, { color: activePillText }]}>
                  Retry Face Scan
                </Text>
              </TouchableOpacity>

              <View style={styles.altActionsRow}>
                <TouchableOpacity
                  style={[styles.altActionBtn, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={() => {
                    resetScanToReady();
                    setKioskMode('manual');
                  }}
                >
                  <Search size={14} color={primaryText} />
                  <Text style={[styles.altActionText, { color: primaryText }]}>Manual Select</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.altActionBtn, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={() => {
                    setKioskMode('scan_qr');
                    switchCameraFacing('back');
                    resetScanStateOnly();
                  }}
                >
                  <QrCode size={14} color={primaryText} />
                  <Text style={[styles.altActionText, { color: primaryText }]}>Use QR Code</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 3. FACE NOT RECOGNIZED (NO FACE OR 1:N UNRECOGNIZED) */}
          {scanPhase === 'failed' && (
            <View
              style={[
                styles.outcomeCard,
                {
                  backgroundColor: cardSurface,
                  borderColor: '#F59E0B',
                },
              ]}
            >
              <View
                style={[
                  styles.outcomeStatusBanner,
                  { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FFFBEB' },
                ]}
              >
                <AlertTriangle size={22} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.outcomeBannerLabel, { color: '#D97706' }]}>
                    Face Not Recognized
                  </Text>
                  <Text style={[styles.outcomeBannerSub, { color: secondaryText }]}>
                    {outcomeDetails?.headline || 'Could not match a registered child profile'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.outcomeBodyText, { color: secondaryText }]}>
                {outcomeDetails?.detail ||
                  'No matching enrolled child was found. Make sure the child is looking straight into the frame with good lighting, or select them manually.'}
              </Text>

              <TouchableOpacity
                style={[styles.primaryOutcomeBtn, { backgroundColor: activePillBg }]}
                onPress={resetScanToReady}
                activeOpacity={0.86}
              >
                <Camera size={17} color={activePillText} />
                <Text style={[styles.primaryOutcomeBtnText, { color: activePillText }]}>
                  Retry Face Scan
                </Text>
              </TouchableOpacity>

              <View style={styles.altActionsRow}>
                <TouchableOpacity
                  style={[styles.altActionBtn, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={() => {
                    resetScanToReady();
                    setKioskMode('manual');
                  }}
                >
                  <Search size={14} color={primaryText} />
                  <Text style={[styles.altActionText, { color: primaryText }]}>Manual Select</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.altActionBtn, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={() => {
                    setKioskMode('scan_qr');
                    switchCameraFacing('back');
                    resetScanStateOnly();
                  }}
                >
                  <QrCode size={14} color={primaryText} />
                  <Text style={[styles.altActionText, { color: primaryText }]}>Use QR Code</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 4. ERROR / TIMEOUT / SERVICE UNAVAILABLE */}
          {scanPhase === 'error' && (
            <View
              style={[
                styles.outcomeCard,
                {
                  backgroundColor: cardSurface,
                  borderColor: '#EF4444',
                },
              ]}
            >
              <View
                style={[
                  styles.outcomeStatusBanner,
                  { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2' },
                ]}
              >
                <WifiOff size={22} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.outcomeBannerLabel, { color: '#EF4444' }]}>
                    Unable to Complete Face Verification. Please Try Again.
                  </Text>
                  <Text style={[styles.outcomeBannerSub, { color: secondaryText }]}>
                    {outcomeDetails?.headline || 'Verification service could not finish'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.outcomeBodyText, { color: secondaryText }]}>
                {outcomeDetails?.detail ||
                  'Face verification is temporarily unavailable. You can retry scanning or check the child in using QR Code or Manual List.'}
              </Text>

              <TouchableOpacity
                style={[styles.primaryOutcomeBtn, { backgroundColor: activePillBg }]}
                onPress={resetScanToReady}
                activeOpacity={0.86}
              >
                <RotateCcw size={17} color={activePillText} />
                <Text style={[styles.primaryOutcomeBtnText, { color: activePillText }]}>
                  Try Again
                </Text>
              </TouchableOpacity>

              <View style={styles.altActionsRow}>
                <TouchableOpacity
                  style={[styles.altActionBtn, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={() => {
                    setKioskMode('scan_qr');
                    switchCameraFacing('back');
                    resetScanStateOnly();
                  }}
                >
                  <QrCode size={14} color={primaryText} />
                  <Text style={[styles.altActionText, { color: primaryText }]}>Use QR Code</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.altActionBtn, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={() => {
                    resetScanToReady();
                    setKioskMode('manual');
                  }}
                >
                  <Search size={14} color={primaryText} />
                  <Text style={[styles.altActionText, { color: primaryText }]}>Manual List</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      ) : kioskMode === 'manual' ? (
        /* ════════════════════════════════════════════════════════════════ */
        /* MANUAL SEARCH VIEW                                              */
        /* ════════════════════════════════════════════════════════════════ */
        <View style={[styles.manualContainer, { backgroundColor: screenBg }]}>
          <View style={[styles.searchBar, { backgroundColor: cardSurface, borderColor }]}>
            <Search size={16} color={secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: primaryText }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search Child Name, ID (KID-...), or Phone..."
              placeholderTextColor={secondaryText}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.manualList}>
            {loadingKids ? (
              <View style={styles.emptySearchCard}>
                <ActivityIndicator size="large" color="#FBBF24" />
                <Text style={[styles.emptySearchText, { color: secondaryText, marginTop: 10 }]}>
                  Loading enrolled children...
                </Text>
              </View>
            ) : manualFiltered.length === 0 ? (
              <View style={styles.emptySearchCard}>
                <Text style={[styles.emptySearchText, { color: secondaryText }]}>
                  {searchQuery.trim()
                    ? `No registered child found matching "${searchQuery}"`
                    : 'No children enrolled yet.'}
                </Text>
                <TouchableOpacity
                  style={styles.emptyEnrollBtn}
                  onPress={() => setShowTeacherEnrollModal(true)}
                  activeOpacity={0.85}
                >
                  <UserPlus size={15} color="#000000" strokeWidth={2.5} />
                  <Text style={styles.emptyEnrollBtnText}>Enroll Child Now</Text>
                </TouchableOpacity>
              </View>
            ) : (
              manualFiltered.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.manualCard, { backgroundColor: cardSurface, borderColor }]}
                  onPress={() => {
                    const sessionStatus = getChildSessionCheckInStatus(c);
                    setScanPhase('success');
                    setStatusMessage('Child Selected Manually');
                    setScannedResult({
                      child: c,
                      confidence: 100,
                      pickupCode: sessionStatus.pickupCode,
                      alreadyCheckedIn: sessionStatus.alreadyCheckedIn,
                      method: 'manual',
                    });
                  }}
                >
                  <View style={[styles.manualAvatar, { overflow: 'hidden' }]}>
                    {c.photoUrl ? (
                      <Image
                        source={{ uri: c.photoUrl }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.manualAvatarText}>{c.firstName.charAt(0)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.manualName, { color: primaryText }]}>{c.fullName}</Text>
                    <Text style={[styles.manualMeta, { color: secondaryText }]}>
                      ID: {c.childId} · {c.assignedClassName || 'Sunday School'} · Age {c.age}
                    </Text>
                  </View>
                  <View style={[styles.checkInActionPill, { backgroundColor: activePillBg }]}>
                    <Text style={[styles.checkInActionText, { color: activePillText }]}>Select</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        /* ════════════════════════════════════════════════════════════════ */
        /* LIVE CAMERA VIEW (READY / SCANNING / VERIFYING)                 */
        /* ════════════════════════════════════════════════════════════════ */
        <View style={{ flex: 1 }}>
          {/* 1. Target Scope Banner: Clearly Explains WHO Is Being Scanned */}
          {kioskMode === 'face_scan' && (
            <View style={[styles.targetBannerWrap, { backgroundColor: cardSurface, borderBottomColor: borderColor }]}>
              <View style={styles.targetContextCard}>
                {activeTargetChild ? (
                  activeTargetChild.photoUrl ? (
                    <Image
                      source={{ uri: activeTargetChild.photoUrl }}
                      style={styles.targetContextPhoto}
                    />
                  ) : (
                    <View style={[styles.targetContextIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
                      <Text style={styles.targetContextInitial}>{activeTargetChild.firstName.charAt(0)}</Text>
                    </View>
                  )
                ) : (
                  <View style={[styles.targetContextIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.16)' }]}>
                    <Users size={18} color="#3B82F6" />
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={[styles.targetContextTitle, { color: primaryText }]} numberOfLines={1}>
                    {activeTargetChild
                      ? `Scanning for: ${activeTargetChild.fullName}`
                      : `Searching: All Enrolled Children (${childrenWithPhotos.length} photos)`}
                  </Text>
                  <Text style={[styles.targetContextSub, { color: secondaryText }]} numberOfLines={2}>
                    {activeTargetChild
                      ? `1:1 Check · Verifying live face strictly against ${activeTargetChild.firstName}'s registered photo.`
                      : '1:N Search · Scanning across all enrolled children to identify who is checking in.'}
                  </Text>
                </View>
              </View>

              {/* Child Selector Chips */}
              {enrolledChildren.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.targetChipsRow}
                >
                  <TouchableOpacity
                    style={[
                      styles.targetChip,
                      { backgroundColor: secondarySurface, borderColor },
                      selectedChildId === null && styles.targetChipActive,
                    ]}
                    disabled={isScanningOrVerifying}
                    onPress={() => {
                      setSelectedChildId(null);
                      resetScanToReady();
                    }}
                  >
                    <Text
                      style={[
                        styles.targetChipText,
                        { color: primaryText },
                        selectedChildId === null && styles.targetChipTextActive,
                      ]}
                    >
                      All Children
                    </Text>
                  </TouchableOpacity>

                  {enrolledChildren.map(kid => {
                    const isSelected = selectedChildId === kid.id;
                    const hasPhoto = Boolean(kid.photoUrl && kid.photoUrl.trim().length > 10);
                    return (
                      <TouchableOpacity
                        key={kid.id}
                        style={[
                          styles.targetChip,
                          { backgroundColor: secondarySurface, borderColor },
                          isSelected && styles.targetChipActive,
                          !hasPhoto && styles.targetChipNoPhoto,
                        ]}
                        disabled={isScanningOrVerifying}
                        onPress={() => {
                          setSelectedChildId(kid.id);
                          resetScanToReady();
                        }}
                      >
                        {hasPhoto ? (
                          <Image
                            source={{ uri: kid.photoUrl }}
                            style={{ width: 18, height: 18, borderRadius: 9 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={{ fontSize: 12 }}>
                            {kid.gender === 'female' ? '👧' : '🧒'}
                          </Text>
                        )}
                        <Text
                          style={[
                            styles.targetChipText,
                            { color: primaryText },
                            isSelected && styles.targetChipTextActive,
                          ]}
                        >
                          {kid.fullName}
                        </Text>
                        {!hasPhoto && <Text style={styles.noPhotoBadge}>No Photo</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}

          {/* 1b. Parent QR Mode Clear Explanation Banner */}
          {kioskMode === 'scan_qr' && (
            <View style={[styles.targetBannerWrap, { backgroundColor: cardSurface, borderBottomColor: borderColor }]}>
              <View style={styles.targetContextCard}>
                <View style={[styles.targetContextIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.16)' }]}>
                  <QrCode size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.targetContextTitle, { color: primaryText }]}>
                    Parent Check-In Pass Scanner
                  </Text>
                  <Text style={[styles.targetContextSub, { color: secondaryText }]}>
                    Ask the parent to show their child's QR Pass from the Rhema app, then point the camera at their screen for instant attendance.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* 2. Camera Viewport */}
          <View style={[styles.cameraContainer, { backgroundColor: screenBg }]}>
            {!permission?.granted ? (
              <View style={[styles.permissionBox, { backgroundColor: screenBg }]}>
                <Camera size={38} color="#D97706" />
                <Text style={[styles.permissionTitle, { color: primaryText }]}>
                  Camera Permission Required
                </Text>
                <Text style={[styles.permissionSub, { color: secondaryText }]}>
                  Allow camera access to scan registered child faces or parent QR passes.
                </Text>
                <TouchableOpacity
                  style={[styles.permissionBtn, { backgroundColor: activePillBg }]}
                  onPress={requestPermission}
                >
                  <Text style={[styles.permissionBtnText, { color: activePillText }]}>
                    Grant Camera Access
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.viewfinder}>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFillObject}
                  facing={cameraFacing}
                  barcodeScannerSettings={BARCODE_SETTINGS}
                  onBarcodeScanned={kioskMode === 'scan_qr' ? handleQrDetected : undefined}
                />

                {/* Quick Camera Flip Button (e.g. in QR mode or Face Scan) */}
                {!isScanningOrVerifying && (
                  <TouchableOpacity
                    style={[
                      styles.viewfinderFlipBtn,
                      kioskMode === 'face_scan' && { top: 16, right: 16, bottom: undefined },
                    ]}
                    onPress={() => switchCameraFacing(cameraFacing === 'front' ? 'back' : 'front')}
                    activeOpacity={0.85}
                  >
                    <RefreshCw size={17} color="#FFFFFF" strokeWidth={2.2} />
                  </TouchableOpacity>
                )}

                {/* Top Floating Status Pill */}
                <View style={styles.topStatusWrapper} pointerEvents="none">
                  <View
                    style={[
                      styles.statusPill,
                      scanPhase === 'scanning' && { borderColor: '#38BDF8' },
                      scanPhase === 'verifying' && { borderColor: '#818CF8' },
                    ]}
                  >
                    {isScanningOrVerifying ? (
                      <ActivityIndicator
                        size="small"
                        color={scanPhase === 'verifying' ? '#818CF8' : '#38BDF8'}
                        style={{ marginRight: 7 }}
                      />
                    ) : (
                      <Shield size={14} color="#FBBF24" style={{ marginRight: 7 }} />
                    )}
                    <Text style={styles.statusPillText}>
                      {kioskMode === 'scan_qr'
                        ? 'Align Parent Check-In QR Code'
                        : statusMessage}
                    </Text>
                  </View>
                </View>

                {/* Clean Centered Frame */}
                <View style={styles.circularScannerContainer} pointerEvents="none">
                  <View
                    style={[
                      kioskMode === 'scan_qr' ? styles.qrFrame : styles.eggFrame,
                      { borderColor: getScannerBorderColor() },
                    ]}
                  >
                    {kioskMode === 'face_scan' && isScanningOrVerifying && (
                      <Animated.View
                        style={[
                          styles.circularLaserLine,
                          {
                            backgroundColor: getScannerBorderColor(),
                            shadowColor: getScannerBorderColor(),
                            transform: [{ translateY: sweepTranslate }],
                          },
                        ]}
                      />
                    )}
                  </View>

                  <Text style={styles.instructionFloatText}>
                    {kioskMode === 'scan_qr'
                      ? 'Hold QR code steady inside the square frame'
                      : statusSubMessage}
                  </Text>
                </View>

                {/* Bottom Action Trigger Bar (Face Scan mode only) */}
                {kioskMode === 'face_scan' && (
                  <View style={[styles.triggerBar, { bottom: Math.max(18, insets.bottom + 12) }]}>
                    <TouchableOpacity
                      style={[
                        styles.scanTriggerBtn,
                        { backgroundColor: activePillBg },
                        isScanningOrVerifying && { opacity: 0.85 },
                      ]}
                      onPress={triggerFaceRecognition}
                      disabled={isScanningOrVerifying}
                      activeOpacity={0.88}
                    >
                      {isScanningOrVerifying ? (
                        <>
                          <ActivityIndicator size="small" color={activePillText} />
                          <Text style={[styles.scanTriggerText, { color: activePillText }]}>
                            {statusMessage}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Camera size={18} color={activePillText} />
                          <Text style={[styles.scanTriggerText, { color: activePillText }]}>
                            {activeTargetChild
                              ? `Scan & Verify ${activeTargetChild.firstName}`
                              : 'Start Face Scan'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── PARENTAL CONSENT & BIOMETRIC DATA PRIVACY MODAL ── */}
      <Modal
        visible={showPrivacyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.privacyModalCard, { backgroundColor: cardSurface, borderColor }]}>
            <View style={[styles.privacyModalHeader, { borderBottomColor: borderColor }]}>
              <ShieldCheck size={24} color="#10B981" />
              <Text style={[styles.privacyModalTitle, { color: primaryText }]}>
                Biometric Privacy & Consent
              </Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <X size={18} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.privacyModalContent}>
              <Text style={[styles.privacyParagraph, { color: secondaryText }]}>
                Rhema Kids Ministry enforces strict child safety and privacy standards in accordance
                with child biometric protection policies.
              </Text>

              <View style={[styles.privacyFeatureItem, { backgroundColor: secondarySurface, borderColor }]}>
                <Lock size={16} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyFeatureTitle, { color: primaryText }]}>
                    Zero Raw Face Vectors Stored
                  </Text>
                  <Text style={[styles.privacyFeatureDesc, { color: secondaryText }]}>
                    Verification compares the live check-in photo against registered profile photos
                    without storing extracted biometric templates in public records.
                  </Text>
                </View>
              </View>

              <View style={[styles.privacyFeatureItem, { backgroundColor: secondarySurface, borderColor }]}>
                <Shield size={16} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyFeatureTitle, { color: primaryText }]}>
                    Parental Consent & Alternatives
                  </Text>
                  <Text style={[styles.privacyFeatureDesc, { color: secondaryText }]}>
                    Face scan is optional. Parents and teachers can always check in via App QR Code
                    or Manual List.
                  </Text>
                </View>
              </View>

              <View style={[styles.privacyFeatureItem, { backgroundColor: secondarySurface, borderColor }]}>
                <Trash2 size={16} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyFeatureTitle, { color: primaryText }]}>
                    Right to Remove Photos
                  </Text>
                  <Text style={[styles.privacyFeatureDesc, { color: secondaryText }]}>
                    Enrolled photos can be updated or removed at any time from the child profile
                    screen.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.privacyCloseBtn, { backgroundColor: activePillBg }]}
              onPress={() => setShowPrivacyModal(false)}
            >
              <Text style={[styles.privacyCloseBtnText, { color: activePillText }]}>
                Understood & Agreed
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── DIRECT CHILD ENROLLMENT BY TEACHER/ADMIN ── */}
      {showTeacherEnrollModal && (
        <TeacherEnrollChildModal
          visible={showTeacherEnrollModal}
          onClose={() => setShowTeacherEnrollModal(false)}
          churchId={churchId}
          actingMember={member}
          onChildEnrolled={enrolledChild => {
            const sessionStatus = getChildSessionCheckInStatus(enrolledChild);
            setScanPhase('success');
            setStatusMessage('Child Enrolled Successfully');
            setScannedResult({
              child: enrolledChild,
              confidence: 100,
              pickupCode: sessionStatus.pickupCode,
              alreadyCheckedIn: sessionStatus.alreadyCheckedIn,
              method: 'manual',
            });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEnrollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  headerEnrollBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitleSerif: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 10.5,
    marginTop: 1,
  },
  modeTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  modeTabText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  targetBannerWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 9,
  },
  targetContextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  targetContextPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FBBF24',
  },
  targetContextIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetContextInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: '#D97706',
  },
  targetContextTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  targetContextSub: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 1,
  },
  targetChipsRow: {
    gap: 7,
    paddingRight: 8,
  },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  targetChipActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  targetChipNoPhoto: {
    opacity: 0.72,
  },
  targetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  targetChipTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  noPhotoBadge: {
    fontSize: 9.5,
    color: '#EF4444',
    fontWeight: '800',
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  permissionTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  permissionBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 6,
  },
  permissionBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  viewfinder: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  viewfinderFlipBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 10,
    elevation: 6,
  },
  topStatusWrapper: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#FBBF24',
  },
  statusPillText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  circularScannerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 56,
    gap: 14,
  },
  eggFrame: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH / 2,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  qrFrame: {
    width: OVAL_WIDTH,
    height: OVAL_WIDTH,
    borderRadius: 22,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  circularLaserLine: {
    width: '86%',
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  instructionFloatText: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: '86%',
    overflow: 'hidden',
  },
  triggerBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  scanTriggerBtn: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  scanTriggerText: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  // Outcome Screen (Dedicated non-scanning view)
  outcomeScroll: {
    padding: 18,
    flexGrow: 1,
    justifyContent: 'center',
  },
  outcomeCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 18,
    gap: 14,
  },
  outcomeStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderRadius: 16,
  },
  outcomeBannerLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  outcomeBannerSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  verifiedProfileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  verifiedAvatarPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  verifiedAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedAvatarLetter: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  expectedLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  verifiedChildName: {
    fontSize: 17.5,
    fontWeight: '800',
  },
  verifiedChildMeta: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 2,
  },
  verifiedChildId: {
    fontSize: 11.5,
    fontWeight: '800',
    marginTop: 3,
  },
  allergyWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  allergyWarningText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '800',
  },
  attendanceNoteBox: {
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  attendanceNoteTitle: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  attendanceNoteSub: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  outcomeBodyText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  primaryOutcomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
  },
  primaryOutcomeBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  secondaryOutcomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  secondaryOutcomeBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  altActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  altActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  altActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Manual search styles
  manualContainer: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  manualList: {
    gap: 10,
    paddingBottom: 32,
  },
  emptySearchCard: {
    alignItems: 'center',
    paddingVertical: 38,
    paddingHorizontal: 20,
  },
  emptySearchText: {
    fontSize: 13.5,
    textAlign: 'center',
  },
  emptyEnrollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 14,
  },
  emptyEnrollBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  manualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  manualAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  manualName: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  manualMeta: {
    fontSize: 11.5,
    marginTop: 2,
  },
  checkInActionPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  checkInActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  // Privacy modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  privacyModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    maxHeight: '80%',
  },
  privacyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  privacyModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  privacyModalContent: {
    marginVertical: 14,
  },
  privacyParagraph: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  privacyFeatureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  privacyFeatureTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  privacyFeatureDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  privacyCloseBtn: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  privacyCloseBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
});
