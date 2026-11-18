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
  type BarcodeScanningResult,
  type BarcodeType,
} from 'expo-camera';
import {
  ArrowLeft,
  Camera,
  RefreshCw,
  Zap,
  Search,
  CheckCircle,
  AlertTriangle,
  QrCode,
  User,
  Shield,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import KidsMinistryService from '../../services/KidsMinistryService';
import { ChildRecord } from '../../types/KidsMinistryTypes';

const { width, height } = Dimensions.get('window');
const BARCODE_SETTINGS: { barcodeTypes: BarcodeType[] } = { barcodeTypes: ['qr'] };

export default function KidsFaceScanKiosk({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const churchId = member?.churchId || 'rhema';

  // Camera permissions & config
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Kiosk Mode: 'face_scan' | 'scan_qr' | 'manual'
  const [kioskMode, setKioskMode] = useState<'face_scan' | 'scan_qr' | 'manual'>('face_scan');

  // Enrolled children for fast matching
  const [enrolledChildren, setEnrolledChildren] = useState<ChildRecord[]>([]);
  const [loadingKids, setLoadingKids] = useState(true);

  // Scanning & Match States
  const [scanning, setScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<{
    child: ChildRecord;
    confidence: number;
    pickupCode?: string;
    alreadyCheckedIn?: boolean;
  } | null>(null);

  // Manual search query
  const [searchQuery, setSearchQuery] = useState('');
  const [processingCheckIn, setProcessingCheckIn] = useState(false);

  // Animation values
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // Load registered children for instant matching
  useEffect(() => {
    const unsub = KidsMinistryService.subscribeToAllChildren(churchId, list => {
      setEnrolledChildren(list);
      setLoadingKids(false);
    });

    // Start scanning laser line animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => unsub();
  }, [churchId]);

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  // Handle Face Scan Trigger (Simulated matching against registered children)
  const triggerFaceRecognition = async () => {
    if (enrolledChildren.length === 0) {
      Alert.alert('No Children Enrolled', 'Please enroll children in Sunday School first.');
      return;
    }

    setScanning(true);

    // Simulate real-time face detection & cosine embedding comparison
    setTimeout(() => {
      setScanning(false);
      // Pick first child or child with faceEnrolled
      const matchedChild = enrolledChildren.find(c => c.faceEnrolled) || enrolledChildren[0];
      const confidence = 96.4;

      setScannedResult({
        child: matchedChild,
        confidence,
        pickupCode: matchedChild.activePickupCode,
        alreadyCheckedIn: matchedChild.custodyStatus === 'checked_in',
      });
    }, 1200);
  };

  // Handle QR code detected by CameraView
  const handleQrDetected = async (result: BarcodeScanningResult) => {
    if (processingCheckIn || scannedResult) return;

    try {
      setProcessingCheckIn(true);
      const child = await KidsMinistryService.findChildByScanQuery(churchId, result.data);
      if (child) {
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
      const parentName = member?.name || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Parent';
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
          [{ text: 'OK', onPress: () => setScannedResult(null) }]
        );
      } else {
        Alert.alert(
          'Check-In Successful! 🎉',
          `Welcome, ${scannedResult.child.fullName}!\n\nClass: ${scannedResult.child.assignedClassName}\nToday's Pickup Code: ${result.session.pickupCode}\n\nPush notification sent to parents.`,
          [{ text: 'Done', onPress: () => setScannedResult(null) }]
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
          <Text style={styles.headerTitleSerif}>Sunday School Entrance Kiosk</Text>
          <Text style={styles.headerSubtitle}>Live Face Scan & Rapid Attendance</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setCameraFacing(cameraFacing === 'front' ? 'back' : 'front')}
          >
            <RefreshCw size={16} color="#FFFFFF" />
          </TouchableOpacity>
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
          }}
        >
          <Camera size={14} color={kioskMode === 'face_scan' ? '#000000' : '#9CA3AF'} />
          <Text style={[styles.modeTabText, kioskMode === 'face_scan' && styles.modeTabTextActive]}>
            Face Recognition
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTab, kioskMode === 'scan_qr' && styles.modeTabActive]}
          onPress={() => {
            setKioskMode('scan_qr');
            setCameraFacing('back');
            setScannedResult(null);
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
          }}
        >
          <Search size={14} color={kioskMode === 'manual' ? '#000000' : '#9CA3AF'} />
          <Text style={[styles.modeTabText, kioskMode === 'manual' && styles.modeTabTextActive]}>
            Manual Search
          </Text>
        </TouchableOpacity>
      </View>

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
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing={cameraFacing}
                enableTorch={isTorchOn}
                barcodeScannerSettings={kioskMode === 'scan_qr' ? BARCODE_SETTINGS : undefined}
                onBarcodeScanned={kioskMode === 'scan_qr' ? handleQrDetected : undefined}
              />

              {/* OVERLAY RETICLE */}
              <View style={styles.reticleOverlay}>
                <View style={[styles.reticleOval, scanning && styles.reticleOvalScanning]}>
                  {/* Corner Markers */}
                  <View style={[styles.cornerMarker, styles.cornerTL]} />
                  <View style={[styles.cornerMarker, styles.cornerTR]} />
                  <View style={[styles.cornerMarker, styles.cornerBL]} />
                  <View style={[styles.cornerMarker, styles.cornerBR]} />

                  {/* Laser Beam Animation */}
                  <Animated.View
                    style={[
                      styles.laserLine,
                      {
                        transform: [{ translateY: scanLineTranslate }],
                      },
                    ]}
                  />

                  {/* Face Mesh Points Guide */}
                  {kioskMode === 'face_scan' && (
                    <View style={styles.meshDotsContainer}>
                      <View style={styles.meshEyesRow}>
                        <View style={styles.meshDot} />
                        <View style={styles.meshDot} />
                      </View>
                      <View style={styles.meshNoseDot} />
                      <View style={styles.meshMouthLine} />
                    </View>
                  )}
                </View>

                {/* Prompt Label */}
                <View style={styles.instructionPill}>
                  <Text style={styles.instructionText}>
                    {kioskMode === 'face_scan'
                      ? 'Align child face inside the oval guide'
                      : 'Align Parent App QR Code'}
                  </Text>
                </View>
              </View>

              {/* BOTTOM SCAN TRIGGER (FOR FACE RECOGNITION) */}
              {kioskMode === 'face_scan' && !scannedResult && (
                <View style={styles.triggerBar}>
                  <TouchableOpacity
                    style={[styles.scanTriggerBtn, scanning && { opacity: 0.7 }]}
                    onPress={triggerFaceRecognition}
                    disabled={scanning}
                    activeOpacity={0.88}
                  >
                    {scanning ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <>
                        <Zap size={16} color="#000000" />
                        <Text style={styles.scanTriggerText}>Simulate Child Step-Up (Scan)</Text>
                      </>
                    )}
                  </TouchableOpacity>
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
                  onPress={() =>
                    setScannedResult({
                      child: c,
                      confidence: 100.0,
                      pickupCode: c.activePickupCode,
                      alreadyCheckedIn: c.custodyStatus === 'checked_in',
                    })
                  }
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

      {/* ── POPUP RESULT CARD (ON SCAN MATCH) ── */}
      {scannedResult && (
        <View style={styles.resultCardOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View style={styles.verifiedRow}>
                <CheckCircle size={16} color="#34D399" />
                <Text style={styles.verifiedText}>
                  {scannedResult.confidence < 100
                    ? `FACE MATCHED (${scannedResult.confidence}%)`
                    : 'CHILD IDENTIFIED'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setScannedResult(null)} style={styles.closeResultBtn}>
                <X size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.childInfoRow}>
              <View style={styles.matchedAvatar}>
                <Text style={styles.matchedAvatarText}>
                  {scannedResult.child.firstName.charAt(0)}
                </Text>
              </View>
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
                  : 'RK - • • • • (Will Generate)'}
              </Text>
              <Text style={styles.codePreviewSub}>
                {scannedResult.alreadyCheckedIn
                  ? 'Child is already checked in to Sunday School'
                  : 'Dynamic code will be sent to parents automatically'}
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
                onPress={() => setScannedResult(null)}
              >
                <Text style={styles.cancelResultText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  modeTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
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
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: '#000000',
    fontWeight: '800',
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
  reticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleOval: {
    width: width * 0.65,
    height: width * 0.8,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.6)',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  reticleOvalScanning: {
    borderColor: '#34D399',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 8,
  },
  cornerMarker: {
    position: 'absolute',
    width: 20,
    height: 20,
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
    backgroundColor: '#34D399',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  meshDotsContainer: {
    alignItems: 'center',
    gap: 16,
    opacity: 0.4,
  },
  meshEyesRow: {
    flexDirection: 'row',
    gap: 40,
  },
  meshDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FBBF24',
  },
  meshNoseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FBBF24',
  },
  meshMouthLine: {
    width: 30,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#FBBF24',
  },
  instructionPill: {
    marginTop: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  instructionText: {
    color: '#D4D4D8',
    fontSize: 12,
    fontWeight: '600',
  },
  triggerBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
  },
  scanTriggerBtn: {
    backgroundColor: '#FFFFFF',
    height: 52,
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
    padding: 20,
    zIndex: 100,
  },
  resultCard: {
    backgroundColor: '#18181B',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#34D399',
    padding: 20,
    gap: 12,
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
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
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
  matchedAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
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
});
