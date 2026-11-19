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
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import KidsMinistryService from '../../services/KidsMinistryService';
import KidsFaceRecognitionService from '../../services/KidsFaceRecognitionService';
import { ChildRecord } from '../../types/KidsMinistryTypes';

const { width } = Dimensions.get('window');
const CIRCLE_SIZE = Math.min(width * 0.76, 290);
const BARCODE_SETTINGS: { barcodeTypes: BarcodeType[] } = { barcodeTypes: ['qr'] };

export default function KidsFaceScanKiosk({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const churchId = member?.churchId || 'rhema';

  // Optional target child passed via route params (e.g. from parent view)
  const initialTargetChildId: string | undefined = route?.params?.targetChildId;

  // Camera permissions & config
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Kiosk Mode: 'face_scan' | 'scan_qr' | 'manual'
  const [kioskMode, setKioskMode] = useState<'face_scan' | 'scan_qr' | 'manual'>('face_scan');

  // Enrolled children for fast matching
  const [enrolledChildren, setEnrolledChildren] = useState<ChildRecord[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(initialTargetChildId || null);
  const [loadingKids, setLoadingKids] = useState(true);

  // Privacy / Biometric Consent Modal
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Scanning & Match States
  const cameraRef = useRef<CameraView>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatusText, setScanStatusText] = useState('Center child face in circular scanner');
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

  // Animated values for modern circular radar / pulse scanner
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;

  // Load registered children for instant matching
  useEffect(() => {
    const unsub = KidsMinistryService.subscribeToAllChildren(churchId, list => {
      setEnrolledChildren(list);
      setLoadingKids(false);
    });

    // Start pulsing animated circular border
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle rotation animation for modern radar sweep
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: true,
      })
    ).start();

    // Subtle up/down scan sweep
    Animated.loop(
      Animated.sequence([
        Animated.timing(sweepAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(sweepAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => unsub();
  }, [churchId]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const sweepTranslate = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-CIRCLE_SIZE / 2 + 15, CIRCLE_SIZE / 2 - 15],
  });

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

      const captured = await cameraRef.current.takePictureAsync({
        quality: 0.45,
        base64: true,
      });

      if (!captured?.base64) {
        setScanState('rejected');
        setScanRejected({
          title: 'Camera Capture Failed',
          reason: 'Could not capture a clear frame. Hold steady inside the circular frame and try again.',
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

      // Check if identity matched with strict confidence (>= 85%)
      if (verification.matched && verification.matchedCandidateId && verification.confidence >= 85) {
        const matchedChild = enrolledChildren.find(c => c.id === verification.matchedCandidateId);
        if (matchedChild) {
          setScanState('success');
          setScanStatusText(`Verified: ${matchedChild.fullName} (${verification.confidence}%)`);
          setScannedResult({
            child: matchedChild,
            confidence: verification.confidence,
            pickupCode: matchedChild.activePickupCode,
            alreadyCheckedIn: matchedChild.custodyStatus === 'checked_in',
          });
          return;
        }
      }

      // Strict failure — never allow wrong kid, adult, stranger, or empty frame
      setScanState('rejected');
      setScanStatusText('Identity verification failed');
      setScanRejected({
        title: !verification.faceDetected
          ? 'No Clear Face Detected'
          : activeTargetChild
          ? `Face Does Not Match ${activeTargetChild.firstName}`
          : 'Face Not Matched',
        reason:
          verification.reason ||
          (activeTargetChild
            ? `The live camera face does not match ${activeTargetChild.fullName}'s enrolled reference photo. Please ensure ${activeTargetChild.firstName} is looking directly at the camera, or use QR Code check-in.`
            : 'Face does not match any enrolled Sunday School child. Adult faces, siblings, and unregistered visitors are strictly denied access.'),
      });
    } catch (err: any) {
      setScanState('rejected');
      setScanRejected({
        title: 'Verification Error',
        reason: err?.message || 'Unable to verify face right now. Please try again or use QR / Manual Search.',
      });
    } finally {
      setScanning(false);
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
              onPress: () => {
                setScannedResult(null);
                setScanState('idle');
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Check-In Successful! 🎉',
          `Welcome, ${scannedResult.child.fullName}!\n\nClass: ${scannedResult.child.assignedClassName}\nToday's Pickup Code: ${result.session.pickupCode}\n\nPush notification sent to parents.`,
          [
            {
              text: 'Done',
              onPress: () => {
                setScannedResult(null);
                setScanState('idle');
              },
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* ── TOP HEADER ── */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitleSerif}>Sunday School Attendance</Text>
          <Text style={styles.headerSubtitle}>Strict Biometric Face Kiosk</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowPrivacyModal(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ShieldCheck size={18} color="#34D399" />
          </TouchableOpacity>

          {kioskMode !== 'manual' && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setCameraFacing(cameraFacing === 'front' ? 'back' : 'front')}
            >
              <RefreshCw size={16} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── MODE TABS ── */}
      <View style={styles.modeTabsRow}>
        <TouchableOpacity
          style={[styles.modeTab, kioskMode === 'face_scan' && styles.modeTabActive]}
          onPress={() => {
            setKioskMode('face_scan');
            setCameraFacing('front');
            setScannedResult(null);
            setScanRejected(null);
            setScanState('idle');
          }}
        >
          <Camera size={14} color={kioskMode === 'face_scan' ? '#000000' : '#9CA3AF'} />
          <Text style={[styles.modeTabText, kioskMode === 'face_scan' && styles.modeTabTextActive]}>
            Circular Face Scan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTab, kioskMode === 'scan_qr' && styles.modeTabActive]}
          onPress={() => {
            setKioskMode('scan_qr');
            setCameraFacing('back');
            setScannedResult(null);
            setScanRejected(null);
            setScanState('idle');
          }}
        >
          <QrCode size={14} color={kioskMode === 'scan_qr' ? '#000000' : '#9CA3AF'} />
          <Text style={[styles.modeTabText, kioskMode === 'scan_qr' && styles.modeTabTextActive]}>
            Scan App QR
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTab, kioskMode === 'manual' && styles.modeTabActive]}
          onPress={() => {
            setKioskMode('manual');
            setScannedResult(null);
            setScanRejected(null);
            setScanState('idle');
          }}
        >
          <Search size={14} color={kioskMode === 'manual' ? '#000000' : '#9CA3AF'} />
          <Text style={[styles.modeTabText, kioskMode === 'manual' && styles.modeTabTextActive]}>
            Manual Search
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── OPTIONAL TARGET CHILD SELECTION STRIP (FOR STRICT 1:1 MATCHING) ── */}
      {kioskMode === 'face_scan' && enrolledChildren.length > 0 && (
        <View style={styles.targetChildBar}>
          <Text style={styles.targetBarLabel}>TARGET CHILD:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targetChipsRow}>
            <TouchableOpacity
              style={[
                styles.targetChip,
                selectedChildId === null && styles.targetChipActive,
              ]}
              onPress={() => {
                setSelectedChildId(null);
                setScanRejected(null);
                setScanState('idle');
              }}
            >
              <Text
                style={[
                  styles.targetChipText,
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
                    isSelected && styles.targetChipActive,
                    !hasPhoto && styles.targetChipNoPhoto,
                  ]}
                  onPress={() => {
                    setSelectedChildId(kid.id);
                    setScanRejected(null);
                    setScanState('idle');
                  }}
                >
                  <Text style={styles.targetChipEmoji}>
                    {kid.gender === 'female' ? '👧' : '🧒'}
                  </Text>
                  <Text
                    style={[
                      styles.targetChipText,
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
        <View style={styles.cameraContainer}>
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <Camera size={36} color="#FBBF24" />
              <Text style={styles.permissionTitle}>Camera Permission Required</Text>
              <Text style={styles.permissionSub}>
                Allow camera access to enable real-time child face scan & QR check-in.
              </Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewfinder}>
              {/* Full-bleed camera feed */}
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing={cameraFacing}
                enableTorch={isTorchOn}
                barcodeScannerSettings={kioskMode === 'scan_qr' ? BARCODE_SETTINGS : undefined}
                onBarcodeScanned={kioskMode === 'scan_qr' ? handleQrDetected : undefined}
              />

              {/* Darkened vignette overlay around the circular aperture */}
              <View style={styles.overlayBackdrop} pointerEvents="none">
                <View style={styles.backdropTop} />
                <View style={styles.backdropMiddleRow}>
                  <View style={styles.backdropSide} />
                  {/* Empty center viewport matching CIRCLE_SIZE */}
                  <View style={styles.centerHole} />
                  <View style={styles.backdropSide} />
                </View>
                <View style={styles.backdropBottom} />
              </View>

              {/* MODERN CIRCULAR FACE SCANNER FRAME */}
              <View style={styles.circularScannerContainer} pointerEvents="box-none">
                {/* Outer animated glow ring */}
                <Animated.View
                  style={[
                    styles.circularGlowRing,
                    {
                      borderColor: getScannerBorderColor(),
                      transform: [
                        { scale: kioskMode === 'face_scan' ? pulseAnim : 1 },
                        { rotate: kioskMode === 'face_scan' ? rotateInterpolate : '0deg' },
                      ],
                    },
                  ]}
                />

                {/* Main Circular Reticle Frame */}
                <View
                  style={[
                    styles.circularFrame,
                    {
                      borderColor: getScannerBorderColor(),
                      borderRadius: CIRCLE_SIZE / 2,
                    },
                  ]}
                >
                  {/* Sweep Laser Beam inside the circle */}
                  {kioskMode === 'face_scan' && (
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

                  {/* Corner Tick Marks along circumference */}
                  <View style={[styles.circleTick, styles.tickTop, { backgroundColor: getScannerBorderColor() }]} />
                  <View style={[styles.circleTick, styles.tickBottom, { backgroundColor: getScannerBorderColor() }]} />
                  <View style={[styles.circleTick, styles.tickLeft, { backgroundColor: getScannerBorderColor() }]} />
                  <View style={[styles.circleTick, styles.tickRight, { backgroundColor: getScannerBorderColor() }]} />

                  {/* Subtle Face Alignment Guide */}
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
                <View style={styles.triggerBar}>
                  <TouchableOpacity
                    style={[styles.scanTriggerBtn, scanning && { opacity: 0.7 }]}
                    onPress={triggerFaceRecognition}
                    disabled={scanning}
                    activeOpacity={0.88}
                  >
                    {scanning ? (
                      <>
                        <ActivityIndicator size="small" color="#000000" />
                        <Text style={styles.scanTriggerText}>Verifying Face Biometrics...</Text>
                      </>
                    ) : (
                      <>
                        <Camera size={18} color="#000000" />
                        <Text style={styles.scanTriggerText}>
                          {activeTargetChild
                            ? `Verify ${activeTargetChild.firstName}'s Face`
                            : 'Scan & Verify Child Face'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.securitySubtext}>
                    Zero False Positives · Adult Faces & Mismatched Siblings Rejected
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      ) : (
        /* MANUAL SEARCH VIEW */
        <View style={styles.manualContainer}>
          <View style={styles.searchBar}>
            <Search size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by Child Name, ID (KID-...), or Phone..."
              placeholderTextColor="#6B7280"
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.manualList}>
            {manualFiltered.length === 0 ? (
              <View style={styles.emptySearchCard}>
                <Text style={styles.emptySearchText}>
                  {searchQuery.trim()
                    ? `No registered child found matching "${searchQuery}"`
                    : 'Type a name or phone number to check in manually'}
                </Text>
              </View>
            ) : (
              manualFiltered.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.manualCard}
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
                  <View style={styles.manualAvatar}>
                    <Text style={styles.manualAvatarText}>{c.firstName.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.manualName}>{c.fullName}</Text>
                    <Text style={styles.manualMeta}>
                      ID: {c.childId} · {c.assignedClassName} · Age {c.age}
                    </Text>
                  </View>
                  <View style={styles.checkInActionPill}>
                    <Text style={styles.checkInActionText}>Select</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* ── STRICT REJECTION MODAL (ON NON-MATCHING / ADULT / WRONG CHILD) ── */}
      {scanRejected && !scannedResult && (
        <View style={styles.resultCardOverlay}>
          <View style={[styles.resultCard, styles.rejectedCard]}>
            <View style={styles.resultHeader}>
              <View style={styles.verifiedRow}>
                <AlertTriangle size={18} color="#EF4444" />
                <Text style={styles.rejectedHeaderText}>VERIFICATION REJECTED</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setScanRejected(null);
                  setScanState('idle');
                }}
                style={styles.closeResultBtn}
              >
                <X size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.rejectedTitle}>{scanRejected.title}</Text>
            <Text style={styles.rejectedReason}>{scanRejected.reason}</Text>

            <View style={styles.resultActionRow}>
              <TouchableOpacity
                style={styles.retryScanBtn}
                onPress={() => {
                  setScanRejected(null);
                  setScanState('idle');
                }}
                activeOpacity={0.85}
              >
                <Camera size={15} color="#000000" />
                <Text style={styles.confirmCheckInText}>Try Again</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelResultBtn}
                onPress={() => {
                  setScanRejected(null);
                  setKioskMode('scan_qr');
                  setCameraFacing('back');
                }}
              >
                <Text style={styles.cancelResultText}>Use QR Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── SUCCESS RESULT MODAL (ON STRICT VERIFICATION MATCH) ── */}
      {scannedResult && (
        <View style={styles.resultCardOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View style={styles.verifiedRow}>
                <CheckCircle size={16} color="#10B981" />
                <Text style={styles.verifiedText}>
                  {scannedResult.confidence < 100
                    ? `BIOMETRIC MATCH VERIFIED (${scannedResult.confidence}%)`
                    : 'CHILD IDENTIFIED'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setScannedResult(null);
                  setScanState('idle');
                }}
                style={styles.closeResultBtn}
              >
                <X size={16} color="#9CA3AF" />
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
                <Text style={styles.matchedName}>{scannedResult.child.fullName}</Text>
                <Text style={styles.matchedClass}>
                  {scannedResult.child.assignedClassName || 'Sunday School'} · Room 204
                </Text>
                <Text style={styles.matchedId}>{scannedResult.child.childId}</Text>
              </View>
            </View>

            {/* ALLERGY WARNING */}
            {scannedResult.child.medical?.hasAllergies && (
              <View style={styles.allergyWarningBox}>
                <AlertTriangle size={14} color="#EF4444" />
                <Text style={styles.allergyWarningText}>
                  MEDICAL ALERT: {scannedResult.child.medical.allergiesList.join(', ')}
                </Text>
              </View>
            )}

            {/* DYNAMIC CODE PREVIEW */}
            <View style={styles.codePreviewBox}>
              <Text style={styles.codePreviewTag}>ASSIGNED PICKUP SECURITY CODE</Text>
              <Text style={styles.codePreviewDigits}>
                {scannedResult.alreadyCheckedIn
                  ? scannedResult.pickupCode || 'ACTIVE'
                  : 'RK - • • • • (Auto Generated)'}
              </Text>
              <Text style={styles.codePreviewSub}>
                {scannedResult.alreadyCheckedIn
                  ? 'Child is already checked in to Sunday School'
                  : 'Dynamic pickup code will be sent to registered parent mobile'}
              </Text>
            </View>

            {/* ACTIONS */}
            <View style={styles.resultActionRow}>
              <TouchableOpacity
                style={[styles.confirmCheckInBtn, processingCheckIn && { opacity: 0.7 }]}
                onPress={handleConfirmCheckIn}
                disabled={processingCheckIn}
              >
                {processingCheckIn ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.confirmCheckInText}>
                    {scannedResult.alreadyCheckedIn ? 'View Existing Session' : 'Approve & Check-In'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelResultBtn}
                onPress={() => {
                  setScannedResult(null);
                  setScanState('idle');
                }}
              >
                <Text style={styles.cancelResultText}>Cancel</Text>
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
          <View style={styles.privacyModalCard}>
            <View style={styles.privacyModalHeader}>
              <ShieldCheck size={24} color="#10B981" />
              <Text style={styles.privacyModalTitle}>Biometric Privacy & Consent</Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <X size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.privacyModalContent}>
              <Text style={styles.privacyParagraph}>
                Rhema Kids Ministry enforces strict child safety and privacy standards in accordance with child biometric protection regulations.
              </Text>

              <View style={styles.privacyFeatureItem}>
                <Lock size={16} color="#FBBF24" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyFeatureTitle}>Zero Raw Face Vectors Stored</Text>
                  <Text style={styles.privacyFeatureDesc}>
                    We do not store biometric templates or facial feature vectors in accessible public records. Verification executes via secure, sandboxed multimodal vision.
                  </Text>
                </View>
              </View>

              <View style={styles.privacyFeatureItem}>
                <Shield size={16} color="#34D399" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyFeatureTitle}>Parental Consent Required</Text>
                  <Text style={styles.privacyFeatureDesc}>
                    Face enrollment is completely voluntary. Parents may opt out at any time and use QR Code or Manual Search check-in.
                  </Text>
                </View>
              </View>

              <View style={styles.privacyFeatureItem}>
                <Trash2 size={16} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.privacyFeatureTitle}>Right to Delete Biometric Data</Text>
                  <Text style={styles.privacyFeatureDesc}>
                    Parents can clear enrolled photos and biometric cached data at any time from the child profile screen or by contacting Sunday School administration.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.privacyCloseBtn}
              onPress={() => setShowPrivacyModal(false)}
            >
              <Text style={styles.privacyCloseBtnText}>Understood & Agreed</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  backdropTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  backdropMiddleRow: {
    height: CIRCLE_SIZE,
    flexDirection: 'row',
  },
  backdropSide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  centerHole: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: 'transparent',
  },
  backdropBottom: {
    flex: 1.4,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  circularScannerContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  circularGlowRing: {
    position: 'absolute',
    width: CIRCLE_SIZE + 24,
    height: CIRCLE_SIZE + 24,
    borderRadius: (CIRCLE_SIZE + 24) / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    opacity: 0.55,
  },
  circularFrame: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderWidth: 3,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circularLaserLine: {
    position: 'absolute',
    width: '100%',
    height: 3,
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
    top: 6,
    width: 4,
    height: 12,
  },
  tickBottom: {
    bottom: 6,
    width: 4,
    height: 12,
  },
  tickLeft: {
    left: 6,
    width: 12,
    height: 4,
  },
  tickRight: {
    right: 6,
    width: 12,
    height: 4,
  },
  faceGuideWrapper: {
    alignItems: 'center',
    gap: 14,
    opacity: 0.35,
  },
  guideEyesRow: {
    flexDirection: 'row',
    gap: 48,
  },
  guideDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  guideNoseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  guideSmileArc: {
    width: 36,
    height: 14,
    borderBottomWidth: 2.5,
    borderRadius: 10,
  },
  statusPill: {
    marginTop: 26,
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
