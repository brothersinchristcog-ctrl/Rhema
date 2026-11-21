import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
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
  QrCode,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  CheckCircle,
  KeyRound,
  RefreshCw,
  Search,
  Users,
  X,
  Phone,
  ShieldAlert,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAdminTheme } from '../../utils/adminThemeHelper';
import KidsMinistryService from '../../services/KidsMinistryService';
import { ChildRecord, AuthorizedGuardian, resolveChildConsentInfo } from '../../types/KidsMinistryTypes';

const { width } = Dimensions.get('window');
const BARCODE_SETTINGS: { barcodeTypes: BarcodeType[] } = { barcodeTypes: ['qr'] };

export default function KidsCheckOutScanner({ route, navigation }: any) {
  const targetSessionId: string | undefined = route?.params?.targetSessionId;
  const sessionTitle: string | undefined = route?.params?.sessionTitle;
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
  const [permission, requestPermission] = useCameraPermissions();
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Tab mode: 'scan' | 'manual_code' | 'roster'
  const [activeMode, setActiveMode] = useState<'scan' | 'manual_code' | 'roster'>('scan');

  // Input states
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [searching, setSearching] = useState(false);

  // Active in-class sessions (realtime headcount)
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Matched verification candidate
  const [matchedCandidate, setMatchedCandidate] = useState<{
    child: ChildRecord;
    session: any;
    codeMatched: boolean;
    enteredCode: string;
  } | null>(null);

  // Release processing
  const [releasing, setReleasing] = useState(false);

  // Selected guardian for pickup
  const [selectedGuardian, setSelectedGuardian] = useState<AuthorizedGuardian | null>(null);

  // Emergency override modal
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideGuardianName, setOverrideGuardianName] = useState('');
  const [overrideReason, setOverrideReason] = useState('Parent verified in person with Govt Photo ID');

  // Roster search
  const [rosterQuery, setRosterQuery] = useState('');

  // 1. Subscribe to active checked-in sessions
  useEffect(() => {
    const unsub = KidsMinistryService.subscribeToActiveSessions(churchId, sessions => {
      setActiveSessions(sessions);
      setLoadingSessions(false);
    });
    return () => unsub();
  }, [churchId]);

  // 2. Handle Barcode QR Scanned
  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (searching || matchedCandidate || releasing) return;

    try {
      setSearching(true);
      const data = result.data.trim();
      let lookupCode = data;
      let childDocId = '';

      if (data.startsWith('RHEMA_KIDS:')) {
        const parts = data.split(':');
        childDocId = parts[1] || '';
        lookupCode = parts[2] || '';
      }

      const child = await KidsMinistryService.findChildByScanQuery(churchId, data);
      if (!child) {
        Alert.alert('Child Not Found', `No registered child matches QR code:\n${data}`);
        return;
      }

      // Find active session for this child (preferring the active program session if opened from Hub)
      const session =
        (targetSessionId
          ? activeSessions.find(
              s =>
                s.programSessionId === targetSessionId &&
                (s.childDocId === child.id || s.childId === child.childId)
            )
          : null) ||
        activeSessions.find(s => s.childDocId === child.id || s.childId === child.childId);
      const expectedCode = session?.pickupCode || child.activePickupCode || '';
      const cleanInput = lookupCode.replace(/RK-/i, '').trim().toUpperCase();
      const cleanExpected = expectedCode.replace(/RK-/i, '').trim().toUpperCase();
      const codeMatched = cleanInput.length > 0 && cleanInput === cleanExpected;

      setMatchedCandidate({
        child,
        session,
        codeMatched,
        enteredCode: lookupCode,
      });

      // Default select primary guardian
      if (child.guardians && child.guardians.length > 0) {
        setSelectedGuardian(child.guardians.find(g => g.isPrimaryContact) || child.guardians[0]);
      }
    } catch (e: any) {
      Alert.alert('Scan Error', e.message || 'Could not verify QR code');
    } finally {
      setSearching(false);
    }
  };

  // 3. Handle Manual Code Verification
  const handleVerifyManualCode = async () => {
    const clean = manualCodeInput.trim().toUpperCase();
    if (!clean) {
      Alert.alert('Missing Code', 'Please enter the 4-digit pickup code or full code (e.g. RK-7942)');
      return;
    }

    try {
      setSearching(true);
      const formattedCode = clean.startsWith('RK-') ? clean : `RK-${clean}`;

      // Search active sessions first
      const session = activeSessions.find(
        s => s.pickupCode?.toUpperCase() === formattedCode || s.pickupCode?.toUpperCase().endsWith(clean)
      );

      let child: ChildRecord | null = null;
      if (session) {
        child = await KidsMinistryService.findChildByScanQuery(churchId, session.childDocId);
      } else {
        child = await KidsMinistryService.findChildByScanQuery(churchId, formattedCode);
      }

      if (!child) {
        Alert.alert(
          'Code Not Found',
          `No active Sunday School session found with pickup code "${formattedCode}". Please verify code with parent.`
        );
        return;
      }

      const matchedSession = session || activeSessions.find(s => s.childDocId === child?.id);
      const expectedCode = matchedSession?.pickupCode || child.activePickupCode || '';
      const cleanInput = clean.replace(/RK-/i, '');
      const cleanExpected = expectedCode.replace(/RK-/i, '');

      setMatchedCandidate({
        child,
        session: matchedSession,
        codeMatched: cleanInput === cleanExpected,
        enteredCode: formattedCode,
      });

      if (child.guardians && child.guardians.length > 0) {
        setSelectedGuardian(child.guardians.find(g => g.isPrimaryContact) || child.guardians[0]);
      }
    } catch (e: any) {
      Alert.alert('Verification Error', e.message || 'Could not verify code');
    } finally {
      setSearching(false);
    }
  };

  // 4. Select from Active Roster
  const handleSelectFromRoster = async (session: any) => {
    try {
      setSearching(true);
      const child = await KidsMinistryService.findChildByScanQuery(churchId, session.childDocId);
      if (!child) return;

      setMatchedCandidate({
        child,
        session,
        codeMatched: true,
        enteredCode: session.pickupCode || 'ROSTER_MANUAL',
      });

      if (child.guardians && child.guardians.length > 0) {
        setSelectedGuardian(child.guardians.find(g => g.isPrimaryContact) || child.guardians[0]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not select child');
    } finally {
      setSearching(false);
    }
  };

  // 5. Execute Authorized Release
  const handleConfirmRelease = async (isEmergencyOverride = false) => {
    if (!matchedCandidate) return;

    if (!matchedCandidate.codeMatched && !isEmergencyOverride) {
      Alert.alert('Security Block', 'Pickup security code does not match. Release cannot be approved without Emergency Teacher Override.');
      return;
    }

    try {
      setReleasing(true);
      const teacherName = member?.name || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Sunday School Teacher';
      const guardianName = isEmergencyOverride
        ? overrideGuardianName.trim() || 'Emergency Pickup'
        : selectedGuardian?.name || matchedCandidate.child.parentName || 'Authorized Parent';
      const guardianPhone = selectedGuardian?.phone || matchedCandidate.child.parentPhone || '';

      const res = await KidsMinistryService.checkOutChild({
        churchId,
        sessionId: matchedCandidate.session?.id,
        programSessionId: matchedCandidate.session?.programSessionId || targetSessionId,
        childDocId: matchedCandidate.child.id,
        pickupCode: matchedCandidate.session?.pickupCode || matchedCandidate.enteredCode,
        verifiedByTeacherId: member?.id || 'teacher_exit_station',
        checkedOutByName: `${guardianName} (${selectedGuardian?.relationship || 'Parent'})`,
        checkedOutByPhone: guardianPhone,
        overrideReason: isEmergencyOverride ? overrideReason : undefined,
      });

      if (res.success) {
        Alert.alert(
          'Custody Safely Released! 🎉',
          `${matchedCandidate.child.fullName} has been safely checked out and handed over to ${guardianName}.\n\nSunday School exit timestamp recorded.`,
          [
            {
              text: 'Done',
              onPress: () => {
                setMatchedCandidate(null);
                setManualCodeInput('');
                setShowOverrideModal(false);
              },
            },
          ]
        );
      } else {
        Alert.alert('Release Failed', res.error || 'Could not complete check-out.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Check-out release failed');
    } finally {
      setReleasing(false);
    }
  };

  // Filter roster by name or ID
  const filteredRoster = activeSessions.filter(s => {
    if (!rosterQuery.trim()) return true;
    const q = rosterQuery.toLowerCase().trim();
    return (
      (s.childName || '').toLowerCase().includes(q) ||
      (s.childId || '').toLowerCase().includes(q) ||
      (s.pickupCode || '').toLowerCase().includes(q)
    );
  });

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
          <Text style={[styles.headerTitleSerif, { color: primaryText }]} numberOfLines={1}>
            {sessionTitle ? `${sessionTitle} Dismissal` : 'Kids Ministry Dismissal'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: secondaryText }]}>
            Safeguarding Exit & Guardian Match Verification
          </Text>
        </View>

        <View style={styles.headcountBadge}>
          <Users size={12} color="#10B981" />
          <Text style={styles.headcountText}>{activeSessions.length} in class</Text>
        </View>
      </View>

      {/* ── MODE TABS (RHEMA PILLS) ── */}
      <View style={[styles.modeTabsRow, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            activeMode === 'scan' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          onPress={() => {
            setActiveMode('scan');
            setMatchedCandidate(null);
          }}
        >
          <QrCode size={14} color={activeMode === 'scan' ? activePillText : secondaryText} />
          <Text
            style={[
              styles.modeTabText,
              { color: secondaryText },
              activeMode === 'scan' && { color: activePillText, fontWeight: '800' },
            ]}
          >
            Scan Pass QR
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            activeMode === 'manual_code' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          onPress={() => {
            setActiveMode('manual_code');
            setMatchedCandidate(null);
          }}
        >
          <KeyRound size={14} color={activeMode === 'manual_code' ? activePillText : secondaryText} />
          <Text
            style={[
              styles.modeTabText,
              { color: secondaryText },
              activeMode === 'manual_code' && { color: activePillText, fontWeight: '800' },
            ]}
          >
            Enter Code
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            { backgroundColor: secondarySurface, borderColor },
            activeMode === 'roster' && { backgroundColor: activePillBg, borderColor: activePillBg },
          ]}
          onPress={() => {
            setActiveMode('roster');
            setMatchedCandidate(null);
          }}
        >
          <Users size={14} color={activeMode === 'roster' ? activePillText : secondaryText} />
          <Text
            style={[
              styles.modeTabText,
              { color: secondaryText },
              activeMode === 'roster' && { color: activePillText, fontWeight: '800' },
            ]}
          >
            Live Roster ({activeSessions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── MODE 1: CAMERA BARCODE SCANNER ── */}
      {activeMode === 'scan' && (
        <View style={[styles.scannerContainer, { backgroundColor: screenBg }]}>
          {!permission?.granted ? (
            <View style={[styles.permissionBox, { backgroundColor: screenBg }]}>
              <QrCode size={40} color="#D97706" />
              <Text style={[styles.permissionTitle, { color: primaryText }]}>Camera Access Needed</Text>
              <Text style={[styles.permissionSub, { color: secondaryText }]}>
                Allow camera permission to scan parent custody pass QR codes at exit.
              </Text>
              <TouchableOpacity
                style={[styles.permissionBtn, { backgroundColor: activePillBg }]}
                onPress={requestPermission}
              >
                <Text style={[styles.permissionBtnText, { color: activePillText }]}>Enable Camera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewfinder}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                enableTorch={isTorchOn}
                barcodeScannerSettings={BARCODE_SETTINGS}
                onBarcodeScanned={handleBarcodeScanned}
              />

              {/* RETICLE OVERLAY */}
              <View style={styles.reticleOverlay}>
                <View style={styles.reticleFrame}>
                  <View style={[styles.cornerMarker, styles.cornerTL]} />
                  <View style={[styles.cornerMarker, styles.cornerTR]} />
                  <View style={[styles.cornerMarker, styles.cornerBL]} />
                  <View style={[styles.cornerMarker, styles.cornerBR]} />

                  {searching && (
                    <View style={styles.searchingOverlay}>
                      <ActivityIndicator size="small" color="#FBBF24" />
                      <Text style={styles.searchingText}>Verifying Pass...</Text>
                    </View>
                  )}
                </View>

                <View style={styles.instructionPill}>
                  <Text style={styles.instructionText}>
                    Scan Parent Custody Pass QR from exit doorway
                  </Text>
                </View>

                {/* Torch Toggle */}
                <TouchableOpacity
                  style={styles.torchToggleBtn}
                  onPress={() => setIsTorchOn(!isTorchOn)}
                >
                  <Text style={styles.torchToggleText}>{isTorchOn ? '🔦 Torch On' : '🔦 Torch Off'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── MODE 2: MANUAL PICKUP CODE ENTRY ── */}
      {activeMode === 'manual_code' && (
        <ScrollView
          style={{ backgroundColor: screenBg }}
          contentContainerStyle={styles.manualEntryContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.codeEntryCard, { backgroundColor: cardSurface, borderColor }]}>
            <View style={styles.keyIconBubble}>
              <KeyRound size={28} color="#D97706" />
            </View>
            <Text style={[styles.codeEntryTitle, { color: primaryText }]}>Enter Custody Release Code</Text>
            <Text style={[styles.codeEntrySub, { color: secondaryText }]}>
              Parents see this 4-digit security code on their Rhema Kids pass.
            </Text>

            <View style={[styles.codeDigitsRow, { backgroundColor: secondarySurface, borderColor }]}>
              <Text style={styles.prefixDigits}>RK - </Text>
              <TextInput
                style={[styles.codeInput, { color: primaryText }]}
                value={manualCodeInput}
                onChangeText={t => setManualCodeInput(t.toUpperCase())}
                placeholder="7942"
                placeholderTextColor={secondaryText}
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.verifyCodeBtn, { backgroundColor: activePillBg }, searching && { opacity: 0.7 }]}
              onPress={handleVerifyManualCode}
              disabled={searching}
            >
              {searching ? (
                <ActivityIndicator size="small" color={activePillText} />
              ) : (
                <Text style={[styles.verifyCodeBtnText, { color: activePillText }]}>Verify Security Code</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ── MODE 3: LIVE ACTIVE ROSTER ── */}
      {activeMode === 'roster' && (
        <View style={[styles.rosterContainer, { backgroundColor: screenBg }]}>
          <View style={[styles.rosterSearchBar, { backgroundColor: cardSurface, borderColor }]}>
            <Search size={16} color={secondaryText} />
            <TextInput
              style={[styles.rosterSearchInput, { color: primaryText }]}
              value={rosterQuery}
              onChangeText={setRosterQuery}
              placeholder="Filter active children by name or code..."
              placeholderTextColor={secondaryText}
            />
            {rosterQuery.length > 0 && (
              <TouchableOpacity onPress={() => setRosterQuery('')}>
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          {loadingSessions ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color="#D97706" />
              <Text style={[styles.loadingText, { color: secondaryText }]}>Syncing Sunday School Roster...</Text>
            </View>
          ) : filteredRoster.length === 0 ? (
            <View style={styles.emptyRosterCard}>
              <Text style={[styles.emptyRosterTitle, { color: primaryText }]}>
                {rosterQuery.trim() ? 'No Matching Child' : 'No Active Children in Class'}
              </Text>
              <Text style={[styles.emptyRosterSub, { color: secondaryText }]}>
                {rosterQuery.trim()
                  ? `No child in today's session matches "${rosterQuery}"`
                  : 'All children have been safely checked out or class has not started yet.'}
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.rosterList}>
              {filteredRoster.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.rosterCard, { backgroundColor: cardSurface, borderColor }]}
                  onPress={() => handleSelectFromRoster(s)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.rosterAvatar, { overflow: 'hidden' }]}>
                    {s.childPhotoUrl ? (
                      <Image
                        source={{ uri: s.childPhotoUrl }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.rosterAvatarText}>
                        {(s.childName || 'K').charAt(0)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rosterChildName, { color: primaryText }]}>{s.childName}</Text>
                    <Text style={[styles.rosterMeta, { color: secondaryText }]}>
                      {s.className || 'Sunday School'} · In since {s.checkInTime?.toDate ? s.checkInTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                    </Text>
                  </View>
                  <View style={styles.pickupCodeBadge}>
                    <Text style={styles.pickupCodeBadgeText}>{s.pickupCode}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── GUARDIAN MATCH & CUSTODY RELEASE CARD MODAL ── */}
      {matchedCandidate && (
        <View style={[styles.candidateOverlay, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          <View style={[styles.candidateCard, { backgroundColor: cardSurface, borderColor }]}>
            {/* Header */}
            <View style={styles.candidateHeader}>
              <View style={styles.verifiedTag}>
                {matchedCandidate.codeMatched ? (
                  <>
                    <ShieldCheck size={16} color="#10B981" />
                    <Text style={styles.verifiedTagText}>CODE MATCH CONFIRMED</Text>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} color="#EF4444" />
                    <Text style={[styles.verifiedTagText, { color: '#EF4444' }]}>
                      CODE MISMATCH
                    </Text>
                  </>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setMatchedCandidate(null)}
                style={[styles.closeCardBtn, { backgroundColor: secondarySurface }]}
              >
                <X size={18} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.65 }}>
              {/* CHILD IDENTITY */}
              <View style={styles.childProfileRow}>
                {matchedCandidate.child.photoUrl ? (
                  <Image source={{ uri: matchedCandidate.child.photoUrl }} style={styles.childPhoto} />
                ) : (
                  <View style={styles.childAvatarFallback}>
                    <Text style={styles.childAvatarFallbackText}>
                      {matchedCandidate.child.firstName.charAt(0)}
                    </Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={[styles.childNameSerif, { color: primaryText }]}>
                    {matchedCandidate.child.fullName}
                  </Text>
                  <Text style={[styles.childClassSub, { color: secondaryText }]}>
                    {matchedCandidate.child.assignedClassName} · Age {matchedCandidate.child.age}
                  </Text>
                  <Text style={styles.childIdSub}>ID: {matchedCandidate.child.childId}</Text>
                </View>
              </View>

              {/* MEDICAL & ALLERGY ALERT */}
              {matchedCandidate.child.medical?.hasAllergies && (
                <View style={styles.allergyAlertBox}>
                  <AlertTriangle size={16} color="#EF4444" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.allergyTitle}>CRITICAL ALLERGY ALERT</Text>
                    <Text style={[styles.allergyDesc, { color: isDark ? '#FCA5A5' : '#DC2626' }]}>
                      {matchedCandidate.child.medical.allergiesList.join(', ')}
                    </Text>
                  </View>
                </View>
              )}

              {/* SECURITY CODE COMPARISON */}
              <View style={[styles.codeComparisonBox, { backgroundColor: secondarySurface, borderColor }]}>
                <View style={styles.codeColumn}>
                  <Text style={[styles.codeColLabel, { color: secondaryText }]}>PARENT CODE</Text>
                  <Text style={[styles.codeColValue, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    {matchedCandidate.enteredCode}
                  </Text>
                </View>
                <View style={[styles.codeDivider, { backgroundColor: borderColor }]} />
                <View style={styles.codeColumn}>
                  <Text style={[styles.codeColLabel, { color: secondaryText }]}>TODAY'S ACTIVE CODE</Text>
                  <Text style={[styles.codeColValue, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    {matchedCandidate.session?.pickupCode || matchedCandidate.child.activePickupCode || 'N/A'}
                  </Text>
                </View>
              </View>

              {/* PARENT CONSENT & RELEASE SAFETY CHECK */}
              {(() => {
                const consent = resolveChildConsentInfo(matchedCandidate.child);
                return (
                  <View
                    style={[
                      styles.consentSafetyCard,
                      {
                        backgroundColor: consent.isConfirmed
                          ? secondarySurface
                          : isDark
                          ? 'rgba(239, 68, 68, 0.14)'
                          : '#FEF2F2',
                        borderColor: consent.isConfirmed
                          ? borderColor
                          : '#FCA5A5',
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {consent.isConfirmed ? (
                        <ShieldCheck size={14} color="#10B981" />
                      ) : (
                        <ShieldAlert size={14} color="#EF4444" />
                      )}
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: consent.isConfirmed ? '#10B981' : '#EF4444',
                          letterSpacing: 0.4,
                        }}
                      >
                        {consent.isConfirmed
                          ? 'PARENT CONSENT CONFIRMED ✓'
                          : 'CONSENT MISSING / PENDING — GUARDIAN HANDOVER REQUIRED'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: primaryText, fontWeight: '600' }}>
                      Classroom Exit: {consent.isConfirmed && consent.canLeaveClassroomIndependently ? 'Independent OK' : 'Escort Required'}  ·  Premises: {consent.isConfirmed && consent.canLeavePremisesIndependently ? 'Independent OK' : 'Pickup Only'}
                    </Text>
                    {consent.teacherInstructions ? (
                      <Text style={{ fontSize: 11.5, color: secondaryText, marginTop: 3 }}>
                        Note from Parent: "{consent.teacherInstructions}"
                      </Text>
                    ) : null}
                  </View>
                );
              })()}

              {/* AUTHORIZED GUARDIAN PHOTO MATCH */}
              <Text style={[styles.sectionTitle, { color: primaryText }]}>AUTHORIZED PICKUP GUARDIANS</Text>
              <Text style={[styles.sectionSubtitle, { color: secondaryText }]}>
                Compare the person standing in front of you with the authorized family members below:
              </Text>

              <View style={styles.guardiansList}>
                {resolveChildConsentInfo(matchedCandidate.child).authorizedPickups.length > 0 ? (
                  resolveChildConsentInfo(matchedCandidate.child).authorizedPickups.map(g => {
                    const isSelected = selectedGuardian?.id === g.id;
                    return (
                      <TouchableOpacity
                        key={g.id}
                        style={[
                          styles.guardianCard,
                          { backgroundColor: secondarySurface, borderColor },
                          isSelected && styles.guardianCardSelected,
                        ]}
                        onPress={() => setSelectedGuardian(g)}
                        activeOpacity={0.88}
                      >
                        <View style={[styles.guardianAvatar, isSelected && styles.guardianAvatarSelected]}>
                          <Text style={styles.guardianAvatarText}>{g.name.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.guardianNameRow}>
                            <Text style={[styles.guardianName, { color: primaryText }]}>{g.name}</Text>
                            {g.isPrimaryContact && (
                              <View style={styles.primaryBadge}>
                                <Text style={styles.primaryBadgeText}>Primary</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.guardianRel, { color: secondaryText }]}>
                            {g.relationship} · 📞 {g.phone}
                          </Text>
                        </View>
                        <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={[styles.guardianCard, { backgroundColor: secondarySurface, borderColor }]}>
                    <Text style={[styles.guardianName, { color: primaryText }]}>
                      {matchedCandidate.child.parentName} (Parent)
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* ACTION BUTTONS */}
            <View style={styles.actionButtonsCol}>
              {matchedCandidate.codeMatched ? (
                <TouchableOpacity
                  style={[styles.releaseBtn, { backgroundColor: activePillBg }, releasing && { opacity: 0.7 }]}
                  onPress={() => handleConfirmRelease(false)}
                  disabled={releasing}
                  activeOpacity={0.88}
                >
                  {releasing ? (
                    <ActivityIndicator size="small" color={activePillText} />
                  ) : (
                    <>
                      <UserCheck size={18} color={activePillText} strokeWidth={2.6} />
                      <Text style={[styles.releaseBtnText, { color: activePillText }]}>
                        Authorize Custody Release
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.mismatchAlertBox}>
                  <Text style={styles.mismatchAlertText}>
                    Code does not match. Handover blocked to safeguard child.
                  </Text>
                </View>
              )}

              {/* EMERGENCY OVERRIDE BUTTON */}
              <TouchableOpacity
                style={[styles.overrideBtn, { backgroundColor: secondarySurface, borderColor }]}
                onPress={() => {
                  setOverrideGuardianName(selectedGuardian?.name || matchedCandidate.child.parentName || '');
                  setShowOverrideModal(true);
                }}
              >
                <ShieldAlert size={14} color="#D97706" />
                <Text style={[styles.overrideBtnText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                  Teacher Emergency Override
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── EMERGENCY OVERRIDE MODAL ── */}
      <Modal visible={showOverrideModal} transparent animationType="fade" onRequestClose={() => setShowOverrideModal(false)}>
        <View style={styles.overrideOverlay}>
          <View style={[styles.overrideCard, { backgroundColor: cardSurface, borderColor }]}>
            <View style={styles.overrideHeader}>
              <ShieldAlert size={20} color="#D97706" />
              <Text style={[styles.overrideTitle, { color: primaryText }]}>Teacher Custody Override</Text>
            </View>
            <Text style={[styles.overrideSubtitle, { color: secondaryText }]}>
              Use this safeguard override if the parent forgot their phone but physical photo identity has been verified in person.
            </Text>

            <Text style={[styles.inputLabel, { color: secondaryText }]}>Guardian Claiming Child:</Text>
            <TextInput
              style={[styles.overrideInput, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
              value={overrideGuardianName}
              onChangeText={setOverrideGuardianName}
              placeholder="e.g. John Doe (Father)"
              placeholderTextColor={secondaryText}
            />

            <Text style={[styles.inputLabel, { color: secondaryText }]}>Verification Reason & Notes (Audited):</Text>
            <TextInput
              style={[
                styles.overrideInput,
                { backgroundColor: secondarySurface, borderColor, color: primaryText, height: 70, textAlignVertical: 'top' },
              ]}
              value={overrideReason}
              onChangeText={setOverrideReason}
              placeholder="e.g. Physical Driver's License inspected by Bro. Rajesh"
              placeholderTextColor={secondaryText}
              multiline
            />

            <View style={styles.overrideActionsRow}>
              <TouchableOpacity
                style={[styles.overrideCancelBtn, { backgroundColor: secondarySurface, borderWidth: 1, borderColor }]}
                onPress={() => setShowOverrideModal(false)}
              >
                <Text style={[styles.overrideCancelText, { color: primaryText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.overrideConfirmBtn, releasing && { opacity: 0.7 }]}
                onPress={() => handleConfirmRelease(true)}
                disabled={releasing}
              >
                {releasing ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.overrideConfirmText}>Approve Override</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const { height } = Dimensions.get('window');

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
  headcountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#064E3B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  headcountText: {
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
  scannerContainer: {
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
    lineHeight: 18,
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
    position: 'relative',
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleFrame: {
    width: width * 0.72,
    height: width * 0.72,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerMarker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#FBBF24',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  searchingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchingText: {
    fontSize: 12,
    color: '#FBBF24',
    fontWeight: '600',
  },
  instructionPill: {
    position: 'absolute',
    bottom: 90,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 18,
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
  torchToggleBtn: {
    position: 'absolute',
    bottom: 30,
    backgroundColor: '#18181B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  torchToggleText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  manualEntryContainer: {
    padding: 24,
    alignItems: 'center',
  },
  codeEntryCard: {
    width: '100%',
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  keyIconBubble: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  codeEntryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  codeEntrySub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  codeDigitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FBBF24',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 24,
  },
  prefixDigits: {
    fontSize: 26,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 2,
  },
  codeInput: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 4,
    minWidth: 100,
  },
  verifyCodeBtn: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyCodeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  rosterContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  rosterSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  rosterSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  emptyRosterCard: {
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyRosterTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  emptyRosterSub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
  rosterList: {
    gap: 8,
    paddingBottom: 24,
  },
  rosterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  rosterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rosterChildName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rosterMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  pickupCodeBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  pickupCodeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1,
  },
  candidateOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
    zIndex: 99,
  },
  consentSafetyCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  candidateCard: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#27272A',
  },
  candidateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  closeCardBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  childPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  childAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAvatarFallbackText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FBBF24',
  },
  childNameSerif: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  childClassSub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  childIdSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  allergyAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 10,
    borderRadius: 10,
    gap: 10,
    marginBottom: 14,
  },
  allergyTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  allergyDesc: {
    fontSize: 12,
    color: '#FCA5A5',
    fontWeight: '600',
    marginTop: 1,
  },
  codeComparisonBox: {
    flexDirection: 'row',
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  codeColumn: {
    flex: 1,
    alignItems: 'center',
  },
  codeColLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  codeColValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  codeDivider: {
    width: 1,
    backgroundColor: '#27272A',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 10,
  },
  guardiansList: {
    gap: 8,
    marginBottom: 16,
  },
  guardianCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  guardianCardSelected: {
    borderColor: '#34D399',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  guardianAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardianAvatarSelected: {
    backgroundColor: '#064E3B',
  },
  guardianAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guardianNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guardianName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  primaryBadge: {
    backgroundColor: '#27272A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  primaryBadgeText: {
    fontSize: 9,
    color: '#FBBF24',
    fontWeight: '700',
  },
  guardianRel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#52525B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#34D399',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34D399',
  },
  actionButtonsCol: {
    gap: 10,
    marginTop: 8,
  },
  releaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  releaseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  mismatchAlertBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  mismatchAlertText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
    textAlign: 'center',
  },
  overrideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  overrideBtnText: {
    fontSize: 12,
    color: '#FBBF24',
    fontWeight: '600',
  },
  overrideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 24,
  },
  overrideCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  overrideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  overrideTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  overrideSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E4E4E7',
    marginBottom: 6,
  },
  overrideInput: {
    backgroundColor: '#09090B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    padding: 10,
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 14,
  },
  overrideActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  overrideCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272A',
    borderRadius: 10,
  },
  overrideCancelText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  overrideConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBBF24',
    borderRadius: 10,
  },
  overrideConfirmText: {
    fontSize: 13,
    color: '#000000',
    fontWeight: '700',
  },
});
