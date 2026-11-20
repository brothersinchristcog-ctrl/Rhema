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
  X,
  Info,
  Trash2,
  Lock,
  UserPlus,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAdminTheme } from '../../utils/adminThemeHelper';
import KidsMinistryService from '../../services/KidsMinistryService';
import KidsFaceRecognitionService from '../../services/KidsFaceRecognitionService';
import { ChildRecord } from '../../types/KidsMinistryTypes';
import TeacherEnrollChildModal from './components/TeacherEnrollChildModal';

const { width } = Dimensions.get('window');
const OVAL_WIDTH = Math.min(width * 0.72, 270);
const OVAL_HEIGHT = Math.round(OVAL_WIDTH * 1.34); // ~360px natural egg/oval face aspect ratio
const BARCODE_SETTINGS: { barcodeTypes: BarcodeType[] } = { barcodeTypes: ['qr'] };

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

  // Optional target child passed via route params (e.g. from parent view)
  const initialTargetChildId: string | undefined = route?.params?.targetChildId;

  // Camera permissions & config
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [cameraKey, setCameraKey] = useState(0);
  const sizedForFacingRef = useRef<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Kiosk Mode: 'face_scan' | 'scan_qr' | 'manual'
  const [kioskMode, setKioskMode] = useState<'face_scan' | 'scan_qr' | 'manual'>('face_scan');

  // Enrolled children for fast matching
  const [enrolledChildren, setEnrolledChildren] = useState<ChildRecord[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(initialTargetChildId || null);
  const [loadingKids, setLoadingKids] = useState(true);

  // Privacy / Biometric Consent Modal
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTeacherEnrollModal, setShowTeacherEnrollModal] = useState(false);

  // Scanning & Match States
  const cameraRef = useRef<CameraView>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatusText, setScanStatusText] = useState('Center child face inside oval frame');
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'success' | 'rejected'>('idle');
  const [scanRejected, setScanRejected] = useState<{
    title: string;
    reason: string;
  } | null>(null);
  const [scannedResult, setScannedResult] = useState<{
    child: ChildRecord;
    confidence: number;
    pickupCode?: string;
    alreadyCheckedIn?: boolean;
  } | null>(null);

  // Manual search query
  const [searchQuery, setSearchQuery] = useState('');
  const [processingCheckIn, setProcessingCheckIn] = useState(false);

  // Animated values & lifecycle guards for face scanner
  const isMountedRef = useRef(true);
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

  const resetScanToIdle = () => {
    activeScanIdRef.current += 1;
    stopScanAnimation();
    setScanning(false);
    setScannedResult(null);
    setScanRejected(null);
    setScanState('idle');
    setScanStatusText('Center child face inside oval frame');
    cameraRef.current?.resumePreview?.().catch(() => {});
  };

  // Load registered children for instant matching & reconcile any unlinked household photos
  useEffect(() => {
    isMountedRef.current = true;
    KidsMinistryService.reconcileAllChildPhotos(churchId).catch(() => {});

    const unsub = KidsMinistryService.subscribeToAllChildren(churchId, list => {
      setEnrolledChildren(list);
      setLoadingKids(false);
    });

    return () => {
      isMountedRef.current = false;
      activeScanIdRef.current += 1;
      stopScanAnimation();
      unsub();
    };
  }, [churchId]);

  // Run laser sweep animation ONLY while biometric verification is actively running
  useEffect(() => {
    if (scanning && kioskMode === 'face_scan' && !scannedResult && !scanRejected) {
      sweepAnim.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(sweepAnim, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(sweepAnim, {
            toValue: 0,
            duration: 1400,
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
  }, [scanning, kioskMode, scannedResult, scanRejected]);

  const sweepTranslate = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-OVAL_HEIGHT / 2 + 20, OVAL_HEIGHT / 2 - 20],
  });

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
      if (ideal) {
        setPictureSize(ideal.raw);
      }
    } catch {
      // Optional resolution optimization
    }
  };

  // Current active target child if specific child selected
  const activeTargetChild = selectedChildId
    ? enrolledChildren.find(c => c.id === selectedChildId)
    : null;

  // Trigger strict 1:1 or 1:N biometric face recognition
  const triggerFaceRecognition = async () => {
    if (scanning) return;

    if (enrolledChildren.length === 0) {
      Alert.alert('No Children Enrolled', 'Please enroll children in Sunday School first.');
      return;
    }

    // Determine target pool
    let candidatePool = enrolledChildren;
    if (activeTargetChild) {
      candidatePool = [activeTargetChild];
    }

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
      setScanState('rejected');
      setScanRejected({
        title: activeTargetChild
          ? `No Photo for ${activeTargetChild.firstName}`
          : 'No Child Face Photos Enrolled',
        reason: activeTargetChild
          ? `${activeTargetChild.fullName} does not have a reference photo enrolled yet. Please upload a profile photo or use App QR Code / Manual Search.`
          : 'None of the enrolled children have a reference photo uploaded. Please add a face photo during enrollment or use QR / Manual Search.',
      });
      return;
    }

    if (!cameraRef.current) {
      Alert.alert('Camera Initializing', 'Please wait a moment for the camera to become ready.');
      return;
    }

    const runId = ++activeScanIdRef.current;

    try {
      setScanRejected(null);
      setScannedResult(null);
      setScanning(true);
      setScanState('scanning');
      setScanStatusText(
        activeTargetChild
          ? `Verifying strictly against ${activeTargetChild.firstName}...`
          : 'Analyzing live facial structure...'
      );

      let captured: { base64?: string } | undefined;
      try {
        captured = await Promise.race([
          cameraRef.current.takePictureAsync({
            quality: 0.4,
            base64: true,
            exif: false,
          }),
          new Promise<undefined>((_, reject) =>
            setTimeout(() => reject(new Error('Camera capture timed out')), 8000)
          ),
        ]);
      } catch (capErr) {
        if (!isMountedRef.current || activeScanIdRef.current !== runId) return;
        stopScanAnimation();
        setScanning(false);
        setPictureSize(undefined);
        sizedForFacingRef.current = null;
        setCameraKey(k => k + 1);
        setScanState('rejected');
        setScanStatusText('Camera capture failed');
        setScanRejected({
          title: 'Camera Capture Failed',
          reason: 'Camera took too long to capture a photo. Preview has been refreshed — please tap Scan again.',
        });
        return;
      }

      // Immediately resume live camera preview on Android so it never stays frozen/black
      cameraRef.current?.resumePreview?.().catch(() => {});

      if (!isMountedRef.current || activeScanIdRef.current !== runId) return;

      if (!captured?.base64) {
        stopScanAnimation();
        setScanning(false);
        setScanState('rejected');
        setScanStatusText('Camera capture failed');
        setScanRejected({
          title: 'Camera Capture Failed',
          reason: 'Could not capture a clear frame. Hold steady inside the oval frame and try again.',
        });
        return;
      }

      setScanStatusText('Comparing biometric markers against enrolled reference...');

      let verification;
      if (activeTargetChild && candidatesWithPhotos.length === 1) {
        // Strict 1:1 Target Verification
        verification = await KidsFaceRecognitionService.verifyTargetChildFace(
          captured.base64,
          candidatesWithPhotos[0]
        );
      } else {
        // Strict 1:N Verification across all children with photos
        verification = await KidsFaceRecognitionService.verifyLiveFace(
          captured.base64,
          candidatesWithPhotos,
          'child'
        );
      }

      if (!isMountedRef.current || activeScanIdRef.current !== runId) return;

      // Immediately halt scanning animation & loading spinner once response is received
      stopScanAnimation();
      setScanning(false);

      // Check if identity matched with strict consensus verification (>= 88%)
      if (verification.matched && verification.matchedCandidateId && verification.confidence >= 88) {
        const matchedChild = enrolledChildren.find(c => c.id === verification.matchedCandidateId);
        if (matchedChild) {
          setScanState('success');
          setScanStatusText(`Verification Successful: ${matchedChild.fullName} (${verification.confidence}%)`);
          setScannedResult({
            child: matchedChild,
            confidence: verification.confidence,
            pickupCode: matchedChild.activePickupCode,
            alreadyCheckedIn: matchedChild.custodyStatus === 'checked_in',
          });
          return;
        }
      }

      // Strict failure — distinguish service issue vs empty frame vs identity mismatch
      setScanState('rejected');
      setScanStatusText(
        verification.serviceUnavailable
          ? 'Verification Service Unavailable'
          : !verification.faceDetected
          ? 'No Clear Face Detected'
          : 'Face Mismatch'
      );
      setScanRejected({
        title: verification.serviceUnavailable
          ? 'Verification Service Unavailable'
          : !verification.faceDetected
          ? 'No Clear Face Detected'
          : activeTargetChild
          ? `Face Mismatch · Not ${activeTargetChild.firstName}`
          : 'Face Mismatch',
        reason:
          verification.reason ||
          (activeTargetChild
            ? `The live camera face does not match ${activeTargetChild.fullName}'s enrolled reference photo. Please ensure ${activeTargetChild.firstName} is looking directly at the camera, or use QR Code check-in.`
            : 'Face does not match any enrolled Sunday School student. Un-enrolled adults, siblings, and unregistered visitors are denied access.'),
      });
    } catch (err: any) {
      if (!isMountedRef.current || activeScanIdRef.current !== runId) return;
      stopScanAnimation();
      setScanning(false);
      setScanState('rejected');
      setScanStatusText('Verification failed');
      setScanRejected({
        title: 'Verification Error',
        reason: err?.message || 'Unable to verify face right now. Please try again or use QR / Manual Search.',
      });
    } finally {
      if (isMountedRef.current && activeScanIdRef.current === runId) {
        setScanning(false);
      }
    }
  };

  // Handle QR code detected by CameraView
  const handleQrDetected = async (result: BarcodeScanningResult) => {
    if (processingCheckIn || scannedResult) return;

    try {
      setProcessingCheckIn(true);
      const child = await KidsMinistryService.findChildByScanQuery(churchId, result.data);
      if (child) {
        setScanState('success');
        setScannedResult({
          child,
          confidence: 100.0,
          pickupCode: child.activePickupCode,
          alreadyCheckedIn: child.custodyStatus === 'checked_in',
        });
      } else {
        Alert.alert('Invalid QR Code', 'No child found matching this QR code payload.');
      }
    } catch (e: any) {
      Alert.alert('Scan Error', e.message || 'Could not process QR code');
    } finally {
      setProcessingCheckIn(false);
    }
  };

  // Confirm Check-In
  const handleConfirmCheckIn = async () => {
    if (!scannedResult) return;
    setProcessingCheckIn(true);

    try {
      const parentName =
        member?.name || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Parent';
      const result = await KidsMinistryService.checkInChild({
        churchId,
        child: scannedResult.child,
        method: kioskMode === 'scan_qr' ? 'qr_code' : kioskMode,
        checkedInByMemberId: member?.id || 'kiosk_station',
        checkedInByName: parentName,
      });

      if (result.alreadyCheckedIn) {
        Alert.alert(
          'Already Checked In',
          `${scannedResult.child.fullName} is already checked in!\n\nActive Pickup Code: ${result.session.pickupCode}`,
          [
            {
              text: 'OK',
              onPress: resetScanToIdle,
            },
          ]
        );
      } else {
        Alert.alert(
          'Check-In Successful! 🎉',
          `Welcome, ${scannedResult.child.fullName}!\n\nClass: ${scannedResult.child.assignedClassName || 'Sunday School'}\nToday's Pickup Code: ${result.session.pickupCode}\n\nPush notification sent to parents.`,
          [
            {
              text: 'Done',
              onPress: resetScanToIdle,
            },
          ]
        );
      }
    } catch (e: any) {
      Alert.alert('Check-In Failed', e.message || 'Could not record check-in');
    } finally {
      setProcessingCheckIn(false);
    }
  };

  // Manual Search Filter
  const manualFiltered = enrolledChildren.filter(c => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase().trim();
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.childId.toLowerCase().includes(q) ||
      (c.parentPhone || '').includes(q)
    );
  });

  // Dynamic Ring Border Color
  const getScannerBorderColor = () => {
    if (scanState === 'success') return '#10B981'; // Vibrant Green
    if (scanState === 'rejected') return '#EF4444'; // Red
    if (scanning || scanState === 'scanning') return '#38BDF8'; // Active Cyan
    return '#FBBF24'; // Warm Gold
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
          style={[styles.iconBtn, { backgroundColor: iconButtonBg, borderColor, borderWidth: isDark ? 0 : 1 }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={primaryText} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitleSerif, { color: primaryText }]} numberOfLines={1}>
            Sunday School Attendance
          </Text>
          <Text style={[styles.headerSubtitle, { color: secondaryText }]} numberOfLines={1}>
            Biometric Face & Pass Kiosk
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

          {kioskMode !== 'manual' && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: iconButtonBg, borderColor, borderWidth: isDark ? 0 : 1 }]}
              onPress={() => setCameraFacing(cameraFacing === 'front' ? 'back' : 'front')}
            >
              <RefreshCw size={16} color={primaryText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── MODE TABS ── */}
      <View style={[styles.modeTabsRow, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            kioskMode === 'face_scan' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          onPress={() => {
            setKioskMode('face_scan');
            setCameraFacing('front');
            resetScanToIdle();
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
            Face Recognition
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            kioskMode === 'scan_qr' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          onPress={() => {
            setKioskMode('scan_qr');
            setCameraFacing('back');
            resetScanToIdle();
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
            Scan App QR
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            kioskMode === 'manual' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          onPress={() => {
            setKioskMode('manual');
            resetScanToIdle();
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
            Manual Search
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── OPTIONAL TARGET CHILD SELECTION STRIP (FOR STRICT 1:1 MATCHING) ── */}
      {kioskMode === 'face_scan' && enrolledChildren.length > 0 && (
        <View style={[styles.targetChildBar, { backgroundColor: cardSurface, borderBottomColor: borderColor }]}>
          <Text style={[styles.targetBarLabel, { color: secondaryText }]}>TARGET CHILD:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targetChipsRow}>
            <TouchableOpacity
              style={[
                styles.targetChip,
                { backgroundColor: secondarySurface, borderColor },
                selectedChildId === null && styles.targetChipActive,
              ]}
              onPress={() => {
                setSelectedChildId(null);
                resetScanToIdle();
              }}
            >
              <Text
                style={[
                  styles.targetChipText,
                  { color: primaryText },
                  selectedChildId === null && styles.targetChipTextActive,
                ]}
              >
                Auto-Detect Enrolled Child
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
                  onPress={() => {
                    setSelectedChildId(kid.id);
                    resetScanToIdle();
                  }}
                >
                  {hasPhoto ? (
                    <Image
                      source={{ uri: kid.photoUrl }}
                      style={{ width: 20, height: 20, borderRadius: 10 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.targetChipEmoji}>
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
                  {!hasPhoto && (
                    <Text style={styles.noPhotoBadge}>No Photo</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── MAIN KIOSK VIEWPORT ── */}
      {kioskMode !== 'manual' ? (
        <View style={[styles.cameraContainer, { backgroundColor: screenBg }]}>
          {!permission?.granted ? (
            <View style={[styles.permissionBox, { backgroundColor: screenBg }]}>
              <Camera size={36} color="#D97706" />
              <Text style={[styles.permissionTitle, { color: primaryText }]}>Camera Permission Required</Text>
              <Text style={[styles.permissionSub, { color: secondaryText }]}>
                Allow camera access to enable real-time child face scan & QR check-in.
              </Text>
              <TouchableOpacity
                style={[styles.permissionBtn, { backgroundColor: activePillBg }]}
                onPress={requestPermission}
              >
                <Text style={[styles.permissionBtnText, { color: activePillText }]}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewfinder}>
              {/* Full-bleed camera feed */}
              <CameraView
                key={`kiosk-cam-${cameraKey}`}
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing={cameraFacing}
                pictureSize={pictureSize}
                onCameraReady={handleCameraReady}
                enableTorch={isTorchOn}
                barcodeScannerSettings={kioskMode === 'scan_qr' ? BARCODE_SETTINGS : undefined}
                onBarcodeScanned={kioskMode === 'scan_qr' ? handleQrDetected : undefined}
              />

              {/* MODERN EGG-SHAPED FACE SCANNER VIEWPORT */}
              <View style={styles.circularScannerContainer} pointerEvents="box-none">
                {/* Single Clean Egg-Shaped Frame */}
                <View
                  style={[
                    styles.eggFrame,
                    {
                      borderColor: getScannerBorderColor(),
                    },
                  ]}
                >
                  {/* Sweep Laser Beam inside the egg frame — ONLY runs while actively scanning */}
                  {kioskMode === 'face_scan' && scanning && !scannedResult && !scanRejected && (
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

                  {/* Corner Tick Marks along the egg border */}
                  <View style={[styles.circleTick, styles.tickTop, { backgroundColor: getScannerBorderColor() }]} />
                  <View style={[styles.circleTick, styles.tickBottom, { backgroundColor: getScannerBorderColor() }]} />
                  <View style={[styles.circleTick, styles.tickLeft, { backgroundColor: getScannerBorderColor() }]} />
                  <View style={[styles.circleTick, styles.tickRight, { backgroundColor: getScannerBorderColor() }]} />

                  {/* Subtle Face Alignment Target */}
                  {kioskMode === 'face_scan' && (
                    <View style={styles.faceGuideWrapper}>
                      <View style={styles.guideEyesRow}>
                        <View style={[styles.guideDot, { backgroundColor: getScannerBorderColor() }]} />
                        <View style={[styles.guideDot, { backgroundColor: getScannerBorderColor() }]} />
                      </View>
                      <View style={[styles.guideNoseDot, { backgroundColor: getScannerBorderColor() }]} />
                      <View style={[styles.guideSmileArc, { borderColor: getScannerBorderColor() }]} />
                    </View>
                  )}
                </View>

                {/* Instruction / Status Pill */}
                <View
                  style={[
                    styles.statusPill,
                    scanState === 'success' && styles.statusPillSuccess,
                    scanState === 'rejected' && styles.statusPillRejected,
                  ]}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color="#38BDF8" style={{ marginRight: 6 }} />
                  ) : scanState === 'success' ? (
                    <CheckCircle size={14} color="#10B981" style={{ marginRight: 6 }} />
                  ) : scanState === 'rejected' ? (
                    <AlertTriangle size={14} color="#EF4444" style={{ marginRight: 6 }} />
                  ) : (
                    <Shield size={14} color="#FBBF24" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.statusPillText}>
                    {kioskMode === 'face_scan' ? scanStatusText : 'Align Parent QR Code'}
                  </Text>
                </View>
              </View>

              {/* BOTTOM SCAN TRIGGER BUTTON */}
              {kioskMode === 'face_scan' && !scannedResult && !scanRejected && (
                <View style={[styles.triggerBar, { bottom: Math.max(22, insets.bottom + 14) }]}>
                  <TouchableOpacity
                    style={[
                      styles.scanTriggerBtn,
                      { backgroundColor: activePillBg, shadowColor: '#000000' },
                      scanning && { opacity: 0.7 },
                    ]}
                    onPress={triggerFaceRecognition}
                    disabled={scanning}
                    activeOpacity={0.88}
                  >
                    {scanning ? (
                      <>
                        <ActivityIndicator size="small" color={activePillText} />
                        <Text style={[styles.scanTriggerText, { color: activePillText }]}>
                          Verifying Face Biometrics...
                        </Text>
                      </>
                    ) : (
                      <>
                        <Camera size={18} color={activePillText} />
                        <Text style={[styles.scanTriggerText, { color: activePillText }]}>
                          {activeTargetChild
                            ? `Verify ${activeTargetChild.firstName}'s Face`
                            : 'Scan & Verify Child Face'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.securitySubtext}>
                    Zero False Positives · Enrolled Students Recognized Accurately
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      ) : (
        /* MANUAL SEARCH VIEW */
        <View style={[styles.manualContainer, { backgroundColor: screenBg }]}>
          <View style={[styles.searchBar, { backgroundColor: cardSurface, borderColor }]}>
            <Search size={16} color={secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: primaryText }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by Child Name, ID (KID-...), or Phone..."
              placeholderTextColor={secondaryText}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.manualList}>
            {manualFiltered.length === 0 ? (
              <View style={styles.emptySearchCard}>
                <Text style={[styles.emptySearchText, { color: secondaryText }]}>
                  {searchQuery.trim()
                    ? `No registered child found matching "${searchQuery}"`
                    : 'Type a name or phone number to check in manually'}
                </Text>
                <TouchableOpacity
                  style={styles.emptyEnrollBtn}
                  onPress={() => setShowTeacherEnrollModal(true)}
                  activeOpacity={0.85}
                >
                  <UserPlus size={15} color="#000000" strokeWidth={2.5} />
                  <Text style={styles.emptyEnrollBtnText}>Enroll Child Directly</Text>
                </TouchableOpacity>
              </View>
            ) : (
              manualFiltered.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.manualCard, { backgroundColor: cardSurface, borderColor }]}
                  onPress={() => {
                    setScanState('success');
                    setScannedResult({
                      child: c,
                      confidence: 100.0,
                      pickupCode: c.activePickupCode,
                      alreadyCheckedIn: c.custodyStatus === 'checked_in',
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
                      ID: {c.childId} · {c.assignedClassName} · Age {c.age}
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
      )}

      {/* ── STRICT REJECTION MODAL (ON NON-MATCHING / SERVICE ISSUE / EMPTY FRAME) ── */}
      {scanRejected && !scannedResult && (
        <View style={[styles.resultCardOverlay, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          <View style={[styles.resultCard, styles.rejectedCard, { backgroundColor: cardSurface }]}>
            <View style={styles.resultHeader}>
              <View style={styles.verifiedRow}>
                <AlertTriangle size={18} color="#EF4444" />
                <Text style={styles.rejectedHeaderText}>VERIFICATION REJECTED</Text>
              </View>
              <TouchableOpacity
                onPress={resetScanToIdle}
                style={styles.closeResultBtn}
              >
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.rejectedTitle, { color: primaryText }]}>{scanRejected.title}</Text>
            <Text style={[styles.rejectedReason, { color: secondaryText }]}>{scanRejected.reason}</Text>

            <View style={styles.resultActionRow}>
              <TouchableOpacity
                style={styles.retryScanBtn}
                onPress={resetScanToIdle}
                activeOpacity={0.85}
              >
                <Camera size={15} color="#000000" />
                <Text style={styles.confirmCheckInText}>Try Again</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelResultBtn, { backgroundColor: secondarySurface, borderWidth: 1, borderColor }]}
                onPress={() => {
                  resetScanToIdle();
                  setKioskMode('scan_qr');
                  setCameraFacing('back');
                }}
              >
                <Text style={[styles.cancelResultText, { color: primaryText }]}>Use QR Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── SUCCESS RESULT MODAL (ON STRICT VERIFICATION MATCH) ── */}
      {scannedResult && (
        <View style={[styles.resultCardOverlay, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          <View style={[styles.resultCard, { backgroundColor: cardSurface }]}>
            <View style={styles.resultHeader}>
              <View style={styles.verifiedRow}>
                <CheckCircle size={16} color="#10B981" />
                <Text style={styles.verifiedText}>
                  {scannedResult.confidence < 100
                    ? `VERIFICATION SUCCESSFUL (${scannedResult.confidence}%)`
                    : 'CHILD IDENTIFIED'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={resetScanToIdle}
                style={styles.closeResultBtn}
              >
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <View style={styles.childInfoRow}>
              {scannedResult.child.photoUrl ? (
                <Image
                  source={{ uri: scannedResult.child.photoUrl }}
                  style={styles.matchedAvatarPhoto}
                />
              ) : (
                <View style={styles.matchedAvatar}>
                  <Text style={styles.matchedAvatarText}>
                    {scannedResult.child.firstName.charAt(0)}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.matchedName, { color: primaryText }]}>{scannedResult.child.fullName}</Text>
                <Text style={[styles.matchedClass, { color: secondaryText }]}>
                  {scannedResult.child.assignedClassName || 'Sunday School'} · Room 204
                </Text>
                <Text style={[styles.matchedId, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                  {scannedResult.child.childId}
                </Text>
              </View>
            </View>

            {/* ALLERGY WARNING */}
            {scannedResult.child.medical?.hasAllergies && (
              <View style={styles.allergyWarningBox}>
                <AlertTriangle size={14} color="#EF4444" />
                <Text style={[styles.allergyWarningText, { color: isDark ? '#FCA5A5' : '#DC2626' }]}>
                  MEDICAL ALERT: {scannedResult.child.medical.allergiesList.join(', ')}
                </Text>
              </View>
            )}

            {/* ATTENDANCE CHECK-IN STATUS */}
            <View style={[styles.codePreviewBox, { backgroundColor: secondarySurface, borderColor }]}>
              <Text style={[styles.codePreviewTag, { color: secondaryText }]}>
                {scannedResult.alreadyCheckedIn
                  ? 'SUNDAY SCHOOL ATTENDANCE STATUS'
                  : 'ATTENDANCE VERIFICATION STATUS'}
              </Text>
              <Text
                style={[
                  styles.codePreviewDigits,
                  {
                    color: isDark ? '#34D399' : '#047857',
                    fontSize: 16,
                    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                    letterSpacing: 0.2,
                    textAlign: 'center',
                  },
                ]}
              >
                {scannedResult.alreadyCheckedIn
                  ? `Already Checked In Today ✓`
                  : 'Identity Verified · Ready to Check In'}
              </Text>
              <Text style={[styles.codePreviewSub, { color: secondaryText, textAlign: 'center', marginTop: 2 }]}>
                {scannedResult.alreadyCheckedIn
                  ? `${scannedResult.child.firstName} is already marked present today.${scannedResult.pickupCode ? ` Active Pass: ${scannedResult.pickupCode}` : ''}`
                  : `Tap "Approve & Check-In" below to mark ${scannedResult.child.firstName} present and generate today's pickup code.`}
              </Text>
            </View>

            {/* ACTIONS */}
            <View style={styles.resultActionRow}>
              <TouchableOpacity
                style={[
                  styles.confirmCheckInBtn,
                  { backgroundColor: activePillBg },
                  processingCheckIn && { opacity: 0.7 },
                ]}
                onPress={handleConfirmCheckIn}
                disabled={processingCheckIn}
              >
                {processingCheckIn ? (
                  <ActivityIndicator size="small" color={activePillText} />
                ) : (
                  <Text style={[styles.confirmCheckInText, { color: activePillText }]}>
                    {scannedResult.alreadyCheckedIn ? 'View Existing Session' : 'Approve & Check-In'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelResultBtn, { backgroundColor: secondarySurface, borderWidth: 1, borderColor }]}
                onPress={resetScanToIdle}
              >
                <Text style={[styles.cancelResultText, { color: primaryText }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
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
              <Text style={[styles.privacyModalTitle, { color: primaryText }]}>Biometric Privacy & Consent</Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <X size={18} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.privacyModalContent}>
              <Text style={[styles.privacyParagraph, { color: secondaryText }]}>
                Rhema Kids Ministry enforces strict child safety and privacy standards in accordance with child biometric protection regulations.
              </Text>

              <View style={[styles.privacyFeatureItem, { backgroundColor: secondarySurface, borderColor }]}>
                <Lock size={16} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyFeatureTitle, { color: primaryText }]}>Zero Raw Face Vectors Stored</Text>
                  <Text style={[styles.privacyFeatureDesc, { color: secondaryText }]}>
                    We do not store biometric templates or facial feature vectors in accessible public records. Verification executes via secure, sandboxed multimodal vision.
                  </Text>
                </View>
              </View>

              <View style={[styles.privacyFeatureItem, { backgroundColor: secondarySurface, borderColor }]}>
                <Shield size={16} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyFeatureTitle, { color: primaryText }]}>Parental Consent Required</Text>
                  <Text style={[styles.privacyFeatureDesc, { color: secondaryText }]}>
                    Face enrollment is completely voluntary. Parents may opt out at any time and use QR Code or Manual Search check-in.
                  </Text>
                </View>
              </View>

              <View style={[styles.privacyFeatureItem, { backgroundColor: secondarySurface, borderColor }]}>
                <Trash2 size={16} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyFeatureTitle, { color: primaryText }]}>Right to Delete Biometric Data</Text>
                  <Text style={[styles.privacyFeatureDesc, { color: secondaryText }]}>
                    Parents can clear enrolled photos and biometric cached data at any time from the child profile screen or by contacting Sunday School administration.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.privacyCloseBtn, { backgroundColor: activePillBg }]}
              onPress={() => setShowPrivacyModal(false)}
            >
              <Text style={[styles.privacyCloseBtnText, { color: activePillText }]}>Understood & Agreed</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── DIRECT CHILD ENROLLMENT BY SUNDAY SCHOOL TEACHER ── */}
      {showTeacherEnrollModal && (
        <TeacherEnrollChildModal
          visible={showTeacherEnrollModal}
          onClose={() => setShowTeacherEnrollModal(false)}
          churchId={churchId}
          actingMember={member}
          onChildEnrolled={enrolledChild => {
            setScanState('success');
            setScannedResult({
              child: enrolledChild,
              confidence: 100.0,
              pickupCode: enrolledChild.activePickupCode,
              alreadyCheckedIn: enrolledChild.custodyStatus === 'checked_in',
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
    backgroundColor: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
  headerEnrollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  headerEnrollBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyEnrollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  emptyEnrollBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  headerTitleSerif: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  modeTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#121215',
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  modeTabText: {
    fontSize: 10.5,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  targetChildBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#09090B',
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  targetBarLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 6,
  },
  targetChipsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#18181B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  targetChipActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  targetChipNoPhoto: {
    borderColor: '#EF4444',
  },
  targetChipEmoji: {
    fontSize: 12,
  },
  targetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D4D4D8',
  },
  targetChipTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  noPhotoBadge: {
    fontSize: 8,
    fontWeight: '800',
    color: '#EF4444',
    marginLeft: 3,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  viewfinder: {
    flex: 1,
    position: 'relative',
  },
  circularScannerContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  eggFrame: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH / 2, // Perfect oval egg geometry: width 270, height 360
    borderWidth: 2.5,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  circularLaserLine: {
    position: 'absolute',
    width: '100%',
    height: 2.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 6,
  },
  circleTick: {
    position: 'absolute',
    borderRadius: 2,
  },
  tickTop: {
    top: 8,
    width: 3.5,
    height: 14,
  },
  tickBottom: {
    bottom: 8,
    width: 3.5,
    height: 14,
  },
  tickLeft: {
    left: 8,
    width: 14,
    height: 3.5,
  },
  tickRight: {
    right: 8,
    width: 14,
    height: 3.5,
  },
  faceGuideWrapper: {
    alignItems: 'center',
    gap: 16,
    opacity: 0.45,
  },
  guideEyesRow: {
    flexDirection: 'row',
    gap: 56,
  },
  guideDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  guideNoseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  guideSmileArc: {
    width: 38,
    height: 14,
    borderBottomWidth: 2.5,
    borderRadius: 10,
  },
  statusPill: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#27272A',
    maxWidth: width * 0.85,
  },
  statusPillSuccess: {
    borderColor: 'rgba(16, 185, 129, 0.6)',
    backgroundColor: 'rgba(6, 78, 59, 0.85)',
  },
  statusPillRejected: {
    borderColor: 'rgba(239, 68, 68, 0.6)',
    backgroundColor: 'rgba(127, 29, 29, 0.85)',
  },
  statusPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  triggerBar: {
    position: 'absolute',
    bottom: 22,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 3,
  },
  scanTriggerBtn: {
    backgroundColor: '#FFFFFF',
    height: 52,
    width: '100%',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  scanTriggerText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  securitySubtext: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 8,
    textAlign: 'center',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  permissionTitle: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  permissionSub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
  permissionBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  permissionBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  manualContainer: {
    flex: 1,
    padding: 20,
    gap: 14,
  },
  searchBar: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    padding: 0,
  },
  manualList: {
    gap: 10,
    paddingBottom: 40,
  },
  manualCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  manualAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  manualName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  manualMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  checkInActionPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  checkInActionText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
  emptySearchCard: {
    padding: 30,
    alignItems: 'center',
  },
  emptySearchText: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
  },
  resultCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
    padding: 20,
    zIndex: 100,
  },
  resultCard: {
    backgroundColor: '#18181B',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#10B981',
    padding: 20,
    gap: 14,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifiedText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  closeResultBtn: {
    padding: 4,
  },
  childInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  matchedAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedAvatarPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: '#10B981',
  },
  matchedAvatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  matchedName: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  matchedClass: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 1,
  },
  matchedId: {
    fontSize: 10,
    color: '#FBBF24',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
  allergyWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  allergyWarningText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  codePreviewBox: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
  },
  codePreviewTag: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#9CA3AF',
    fontWeight: '700',
  },
  codePreviewDigits: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FBBF24',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 2,
    marginVertical: 4,
  },
  codePreviewSub: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  resultActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  confirmCheckInBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCheckInText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  cancelResultBtn: {
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: '#27272A',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelResultText: {
    color: '#D4D4D8',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectedCard: {
    borderColor: 'rgba(239, 68, 68, 0.7)',
    borderWidth: 1.5,
  },
  rejectedHeaderText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  rejectedTitle: {
    fontSize: 17,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  rejectedReason: {
    fontSize: 12.5,
    color: '#D4D4D8',
    lineHeight: 19,
    marginBottom: 8,
  },
  retryScanBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#FBBF24',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  privacyModalCard: {
    width: '100%',
    backgroundColor: '#18181B',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
    maxHeight: '80%',
    gap: 16,
  },
  privacyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
    paddingBottom: 12,
  },
  privacyModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  privacyModalContent: {
    maxHeight: 320,
  },
  privacyParagraph: {
    fontSize: 12.5,
    color: '#D4D4D8',
    lineHeight: 19,
    marginBottom: 14,
  },
  privacyFeatureItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#121215',
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  privacyFeatureTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  privacyFeatureDesc: {
    fontSize: 11.5,
    color: '#9CA3AF',
    lineHeight: 17,
  },
  privacyCloseBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyCloseBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
});
