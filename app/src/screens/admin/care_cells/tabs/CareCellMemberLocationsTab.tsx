import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
  Image,
  Modal,
  Alert,
  FlatList,
} from 'react-native';
import MapView, { Marker, Circle, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import {
  Search,
  MapPin,
  Users,
  Compass,
  Navigation,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Phone,
  ChevronRight,
  Filter,
  Layers,
  Sparkles,
  Route,
  RefreshCw,
  Hash,
  Home,
  Check,
} from 'lucide-react-native';
import { useAdminTheme, createAdminThemedStyles } from '../../../../utils/adminThemeHelper';
import { CareCell } from '../../../../types/CareCellTypes';
import MemberLocationService, {
  MemberLocationRecord,
  VisitStatusBadge,
  LocationAccuracyType,
} from '../../../../services/MemberLocationService';
import MemberIdService from '../../../../services/MemberIdService';
import LocationService from '../../../../services/LocationService';
import CareCellVisitModal from '../components/CareCellVisitModal';
import { useAuth } from '../../../../context/AuthContext';

const { width, height } = Dimensions.get('window');

// Default Kurnool coordinates
const DEFAULT_CENTER = {
  latitude: 15.8281,
  longitude: 78.0373,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

interface CareCellMemberLocationsTabProps {
  cells: CareCell[];
  selectedCellId?: string;
  onSelectCellId?: (id: string) => void;
  churchId?: string;
}

export default function CareCellMemberLocationsTab({
  cells,
  selectedCellId,
  churchId,
}: CareCellMemberLocationsTabProps) {
  const { isDark, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor } =
    useAdminTheme();
  const { user, member } = useAuth();
  const mapRef = useRef<MapView | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<MemberLocationRecord[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCellId, setActiveCellId] = useState<string>(selectedCellId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | VisitStatusBadge>('ALL');
  const [accuracyFilter, setAccuracyFilter] = useState<'ALL' | LocationAccuracyType>('ALL');

  // Selected Marker / Group
  const [selectedGroup, setSelectedGroup] = useState<MemberLocationRecord[] | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberLocationRecord | null>(null);

  // Smart Proximity (Nearby Members) State
  const [nearbyMode, setNearbyMode] = useState(false);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState<number>(5);
  const [multiSelectedMemberIds, setMultiSelectedMemberIds] = useState<string[]>([]);

  // Visit Scheduling Modal
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [visitTargetMemberIds, setVisitTargetMemberIds] = useState<string[]>([]);
  const [targetCellIdForVisit, setTargetCellIdForVisit] = useState<string>('');

  // ID Backfill Feedback
  const [backfilling, setBackfilling] = useState(false);

  // In-App Directions & Route Navigation State
  const [activeInAppRoute, setActiveInAppRoute] = useState<{
    origin: { latitude: number; longitude: number; label: string };
    destination: { latitude: number; longitude: number; label: string; member: MemberLocationRecord };
    stops?: Array<{ latitude: number; longitude: number; label: string; member: MemberLocationRecord }>;
    coordinates: Array<{ latitude: number; longitude: number }>;
    distanceKm: number;
    durationMins: number;
    steps: string[];
    isMultiStop?: boolean;
  } | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);

  const loadMemberLocations = useCallback(async () => {
    try {
      const activeChurchId = churchId || 'rhema';
      const list = await MemberLocationService.getMemberLocationsForMap(activeChurchId);
      setRecords(list);
    } catch (e) {
      console.error('Error loading member locations for map:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [churchId]);

  useEffect(() => {
    loadMemberLocations();
  }, [loadMemberLocations]);

  // ── Filter Records ──
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Cell filter
      if (activeCellId !== 'ALL' && r.careCellId !== activeCellId) return false;

      // Status filter
      if (statusFilter !== 'ALL' && r.visitStatus !== statusFilter) return false;

      // Accuracy filter
      if (accuracyFilter !== 'ALL' && r.locationAccuracy !== accuracyFilter) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = r.memberName.toLowerCase().includes(q);
        const matchCode = (r.memberCode || '').toLowerCase().includes(q);
        const matchVillage = (r.village || '').toLowerCase().includes(q);
        const matchCity = (r.city || '').toLowerCase().includes(q);
        const matchDistrict = (r.district || '').toLowerCase().includes(q);
        const matchCell = (r.careCellName || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchVillage && !matchCity && !matchDistrict && !matchCell) {
          return false;
        }
      }

      return true;
    });
  }, [records, activeCellId, statusFilter, accuracyFilter, searchQuery]);

  // ── Marker Clustering / Grouping by Approximate Coordinates ──
  // Groups members who share the exact coordinates or same village
  const markerGroups = useMemo(() => {
    const groups: Record<string, MemberLocationRecord[]> = {};

    filteredRecords.forEach((r) => {
      if (r.latitude === null || r.longitude === null) return;
      // Round to 3 decimals (~110 meters) to group members in the same village / street cluster
      const key = `${r.latitude.toFixed(3)}_${r.longitude.toFixed(3)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    return Object.values(groups);
  }, [filteredRecords]);

  // ── Nearby Members List (Haversine Distance) ──
  const nearbyMembers = useMemo(() => {
    if (!nearbyMode || !selectedMember) return [];
    return MemberLocationService.findNearbyMembers(selectedMember, records, nearbyRadiusKm);
  }, [nearbyMode, selectedMember, records, nearbyRadiusKm]);

  // Center map on coordinates
  const animateToLocation = (lat: number, lng: number, delta = 0.04) => {
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      600
    );
  };

  // ── Tap Marker ──
  const handleMarkerPress = (group: MemberLocationRecord[]) => {
    setSelectedGroup(group);
    if (group.length === 1) {
      setSelectedMember(group[0]);
      if (group[0].latitude && group[0].longitude) {
        animateToLocation(group[0].latitude, group[0].longitude, 0.03);
      }
    } else {
      setSelectedMember(null);
      if (group[0].latitude && group[0].longitude) {
        animateToLocation(group[0].latitude, group[0].longitude, 0.05);
      }
    }
  };

  // ── Actions ──
  const handleScheduleVisit = (memberRec: MemberLocationRecord) => {
    setVisitTargetMemberIds([memberRec.memberId]);
    setTargetCellIdForVisit(memberRec.careCellId || cells[0]?.id || '');
    setScheduleModalVisible(true);
  };

  const handleDirections = async (memberRec: MemberLocationRecord) => {
    if (!memberRec.latitude || !memberRec.longitude) {
      Alert.alert('Location Missing', 'Coordinates are not yet available for this member.');
      return;
    }

    setCalculatingRoute(true);
    try {
      let originCoords = { latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude };
      let originLabel = 'Church Office';

      try {
        const gps = await LocationService.getCurrentLocation();
        if (gps.success && gps.coords) {
          originCoords = { latitude: gps.coords.latitude, longitude: gps.coords.longitude };
          originLabel = 'Current Location';
        }
      } catch (_) {}

      const destCoords = { latitude: memberRec.latitude, longitude: memberRec.longitude };
      const routeData = await MemberLocationService.computeInAppRoute(originCoords, destCoords);

      setActiveInAppRoute({
        origin: { ...originCoords, label: originLabel },
        destination: { ...destCoords, label: `${memberRec.memberName} (${memberRec.village || 'Residence'})`, member: memberRec },
        coordinates: routeData.coordinates,
        distanceKm: routeData.distanceKm,
        durationMins: routeData.durationMins,
        steps: routeData.steps,
        isMultiStop: false,
      });

      // Close bottom detail card to let the user see the navigation route
      setSelectedMember(null);
      setSelectedGroup(null);

      // Fit route smoothly on map
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(routeData.coordinates, {
          edgePadding: { top: 100, right: 50, bottom: 280, left: 50 },
          animated: true,
        });
      }, 350);
    } catch (e: any) {
      console.error('Error starting in-app navigation:', e);
      Alert.alert('Routing Notice', 'Generating local route...');
    } finally {
      setCalculatingRoute(false);
    }
  };

  const handleToggleNearby = (memberRec: MemberLocationRecord) => {
    setSelectedMember(memberRec);
    setNearbyMode(true);
    setMultiSelectedMemberIds([memberRec.memberId]);
    if (memberRec.latitude && memberRec.longitude) {
      animateToLocation(memberRec.latitude, memberRec.longitude, nearbyRadiusKm * 0.025);
    }
  };

  const handleToggleMultiSelect = (memberId: string) => {
    setMultiSelectedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handlePlanCombinedRoute = async () => {
    const selectedRecs = records.filter((r) => multiSelectedMemberIds.includes(r.memberId));
    if (selectedRecs.length === 0) {
      Alert.alert('No Members Selected', 'Please select at least one member to navigate.');
      return;
    }

    const validMembers = selectedRecs.filter((r) => r.latitude && r.longitude);
    if (validMembers.length === 0) {
      Alert.alert('Notice', 'Selected members do not have mapped coordinates.');
      return;
    }

    setCalculatingRoute(true);
    try {
      let originCoords = { latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude };
      let originLabel = 'Church Office';
      try {
        const gps = await LocationService.getCurrentLocation();
        if (gps.success && gps.coords) {
          originCoords = { latitude: gps.coords.latitude, longitude: gps.coords.longitude };
          originLabel = 'Current Location';
        }
      } catch (_) {}

      const remainingStops = validMembers.slice(0, validMembers.length - 1).map((m) => ({
        latitude: m.latitude!,
        longitude: m.longitude!,
        label: `${m.memberName} (${m.village})`,
        member: m,
      }));

      const destMember = validMembers[validMembers.length - 1];
      const routeData = await MemberLocationService.computeInAppRoute(
        originCoords,
        { latitude: destMember.latitude!, longitude: destMember.longitude! },
        remainingStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude }))
      );

      setActiveInAppRoute({
        origin: { ...originCoords, label: originLabel },
        destination: {
          latitude: destMember.latitude!,
          longitude: destMember.longitude!,
          label: `${destMember.memberName} (${destMember.village})`,
          member: destMember,
        },
        stops: remainingStops,
        coordinates: routeData.coordinates,
        distanceKm: routeData.distanceKm,
        durationMins: routeData.durationMins,
        steps: routeData.steps,
        isMultiStop: true,
      });

      setSelectedMember(null);
      setSelectedGroup(null);

      setTimeout(() => {
        mapRef.current?.fitToCoordinates(routeData.coordinates, {
          edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
          animated: true,
        });
      }, 350);
    } catch (e: any) {
      console.error('Error generating multi-stop route:', e);
      Alert.alert('Notice', 'Could not compute combined route.');
    } finally {
      setCalculatingRoute(false);
    }
  };

  const handleBatchScheduleVisit = () => {
    if (multiSelectedMemberIds.length === 0) return;
    setVisitTargetMemberIds(multiSelectedMemberIds);
    setTargetCellIdForVisit(selectedMember?.careCellId || cells[0]?.id || '');
    setScheduleModalVisible(true);
  };

  // ── Auto-Backfill Member IDs in Real-Time ──
  const handleBackfillMemberIds = async () => {
    try {
      setBackfilling(true);
      const res = await MemberIdService.backfillExistingMembers(churchId);
      Alert.alert(
        'Member IDs Synchronized',
        `Processed ${res.totalMembers} members.\n• Newly Assigned: ${res.newlyAssigned}\n• Already Configured: ${res.alreadyAssigned}\n\nSample IDs: ${res.sampleCodes.join(', ') || 'Rhema-001...'}`
      );
      loadMemberLocations();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not backfill member IDs.');
    } finally {
      setBackfilling(false);
    }
  };

  const getStatusColor = (status: VisitStatusBadge) => {
    switch (status) {
      case 'scheduled':
        return '#3B82F6'; // Blue
      case 'awaiting_confirm':
        return '#F59E0B'; // Orange
      case 'followup_required':
        return '#EF4444'; // Red
      case 'no_pending':
      default:
        return '#10B981'; // Green
    }
  };

  const getAccuracyBadge = (accuracy: LocationAccuracyType, hasVerifiedHome: boolean) => {
    if (accuracy === 'verified_home' || hasVerifiedHome) {
      return {
        label: 'Verified Home (Exact Pin)',
        bg: isDark ? '#065F4640' : '#ECFDF5',
        border: '#10B981',
        text: isDark ? '#34D399' : '#047857',
      };
    }
    if (accuracy === 'village_approximate') {
      return {
        label: 'Village Center (Approximate)',
        bg: isDark ? '#1E3A8A40' : '#EFF6FF',
        border: '#3B82F6',
        text: isDark ? '#93C5FD' : '#1D4ED8',
      };
    }
    if (accuracy === 'city_approximate') {
      return {
        label: 'City Center (Approximate)',
        bg: isDark ? '#4C1D9540' : '#FAF5FF',
        border: '#8B5CF6',
        text: isDark ? '#C4B5FD' : '#6D28D9',
      };
    }
    return {
      label: 'Location Not Verified',
      bg: isDark ? '#7F1D1D40' : '#FEF2F2',
      border: '#EF4444',
      text: isDark ? '#F87171' : '#B91C1C',
    };
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* ── TOP CONTROLS & SEARCH BAR ── */}
      <View style={[styles.topControlsCard, { backgroundColor: cardSurface, borderColor }]}>
        {/* Search Bar */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark ? '#27272A80' : '#F8FAFC',
              borderColor,
            },
          ]}
        >
          <Search size={16} color={secondaryText} />
          <TextInput
            style={[styles.searchInput, { color: primaryText }]}
            placeholder="Search member, ID (Rhema-001), village, or city..."
            placeholderTextColor={secondaryText}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={15} color={secondaryText} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Horizontal Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
          {/* Care Cell Selector */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              {
                backgroundColor: activeCellId === 'ALL' ? (isDark ? '#3B82F6' : '#1a2d5a') : secondarySurface,
                borderColor: activeCellId === 'ALL' ? '#3B82F6' : borderColor,
              },
            ]}
            onPress={() => setActiveCellId('ALL')}
          >
            <Text
              style={[
                styles.filterPillTxt,
                { color: activeCellId === 'ALL' ? '#FFFFFF' : primaryText },
              ]}
            >
              All Cells ({records.length})
            </Text>
          </TouchableOpacity>

          {cells.map((c) => {
            const isSel = activeCellId === c.id;
            const count = records.filter((r) => r.careCellId === c.id).length;
            return (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isSel ? (isDark ? '#3B82F6' : '#1a2d5a') : secondarySurface,
                    borderColor: isSel ? '#3B82F6' : borderColor,
                  },
                ]}
                onPress={() => setActiveCellId(c.id)}
              >
                <Text style={[styles.filterPillTxt, { color: isSel ? '#FFFFFF' : primaryText }]}>
                  {c.name} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Visit Status Filter */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              {
                backgroundColor: statusFilter === 'scheduled' ? '#3B82F6' : secondarySurface,
                borderColor: statusFilter === 'scheduled' ? '#3B82F6' : borderColor,
              },
            ]}
            onPress={() => setStatusFilter(statusFilter === 'scheduled' ? 'ALL' : 'scheduled')}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' }} />
            <Text style={[styles.filterPillTxt, { color: statusFilter === 'scheduled' ? '#FFFFFF' : primaryText }]}>
              Scheduled
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              {
                backgroundColor: statusFilter === 'awaiting_confirm' ? '#F59E0B' : secondarySurface,
                borderColor: statusFilter === 'awaiting_confirm' ? '#F59E0B' : borderColor,
              },
            ]}
            onPress={() => setStatusFilter(statusFilter === 'awaiting_confirm' ? 'ALL' : 'awaiting_confirm')}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
            <Text style={[styles.filterPillTxt, { color: statusFilter === 'awaiting_confirm' ? '#FFFFFF' : primaryText }]}>
              Awaiting Confirm
            </Text>
          </TouchableOpacity>

          {/* Real-time Member ID Backfill Action */}
          <TouchableOpacity
            style={[styles.filterPill, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: '#3B82F6' }]}
            onPress={handleBackfillMemberIds}
            disabled={backfilling}
          >
            {backfilling ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <>
                <Hash size={13} color="#3B82F6" />
                <Text style={[styles.filterPillTxt, { color: '#3B82F6' }]}>Sync Member IDs</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── INTERACTIVE GOOGLE MAP ── */}
      <View style={styles.mapContainer}>
        {loading ? (
          <View style={[styles.centerLoading, { backgroundColor: screenBg }]}>
            <ActivityIndicator size="large" color={isDark ? '#60A5FA' : '#1a2d5a'} />
            <Text style={[styles.loadingTxt, { color: secondaryText }]}>
              Resolving member locations from profile records...
            </Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={DEFAULT_CENTER}
            showsUserLocation
            showsMyLocationButton
            showsCompass
          >
            {/* Proximity Radius Circle when Nearby Mode is active */}
            {nearbyMode && selectedMember && selectedMember.latitude && selectedMember.longitude && (
              <Circle
                center={{
                  latitude: selectedMember.latitude,
                  longitude: selectedMember.longitude,
                }}
                radius={nearbyRadiusKm * 1000}
                fillColor={isDark ? 'rgba(59, 130, 246, 0.18)' : 'rgba(37, 99, 235, 0.12)'}
                strokeColor="#2563EB"
                strokeWidth={2}
              />
            )}

            {/* Clustered Markers (Village Groups) */}
            {markerGroups.map((group, idx) => {
              const first = group[0];
              if (!first.latitude || !first.longitude) return null;

              const isMulti = group.length > 1;
              const hasActiveScheduled = group.some((g) => g.visitStatus === 'scheduled');
              const hasAwaiting = group.some((g) => g.visitStatus === 'awaiting_confirm');
              const hasFollowup = group.some((g) => g.visitStatus === 'followup_required');
              const hasVerified = group.some((g) => g.hasVerifiedHome);

              const dominantColor = hasFollowup
                ? '#EF4444'
                : hasAwaiting
                ? '#F59E0B'
                : hasActiveScheduled
                ? '#3B82F6'
                : '#10B981';

              const isSelected = selectedGroup === group || (selectedMember && group.includes(selectedMember));

              return (
                <Marker
                  key={`group_${idx}_${first.memberId}`}
                  coordinate={{ latitude: first.latitude, longitude: first.longitude }}
                  onPress={() => handleMarkerPress(group)}
                  anchor={{ x: 0.5, y: 1.0 }}
                  tracksViewChanges={false}
                >
                  <View style={styles.tabLollipopWrap}>
                    {/* Lollipop Head: Circular Avatar Container */}
                    <View
                      style={[
                        styles.tabLollipopHead,
                        {
                          borderColor: isSelected ? '#F59E0B' : dominantColor,
                          borderWidth: isSelected ? 3.5 : 2.5,
                          transform: [{ scale: isSelected ? 1.15 : 1 }],
                        },
                      ]}
                    >
                      {first.profilePhoto ? (
                        <Image
                          source={{ uri: first.profilePhoto }}
                          style={styles.tabLollipopAvatarImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.tabLollipopAvatarFallback, { backgroundColor: dominantColor }]}>
                          <Text style={styles.tabLollipopInitials}>
                            {(first.memberName || 'M').slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                      )}

                      {/* Multi-member cluster count pill */}
                      {isMulti && (
                        <View style={[styles.tabLollipopCountBadge, { backgroundColor: dominantColor }]}>
                          <Users size={9} color="#FFFFFF" style={{ marginRight: 2 }} />
                          <Text style={styles.tabLollipopCountTxt}>{group.length}</Text>
                        </View>
                      )}

                      {/* Verified home pin badge */}
                      {hasVerified && !isMulti && (
                        <View style={styles.tabLollipopVerifiedBadge}>
                          <Home size={8} color="#FFFFFF" />
                        </View>
                      )}
                    </View>

                    {/* Lollipop Stem / Needle pointing directly to coordinate */}
                    <View style={styles.tabLollipopStemWrap}>
                      <View
                        style={[
                          styles.tabLollipopStem,
                          { backgroundColor: isSelected ? '#F59E0B' : dominantColor },
                        ]}
                      />
                      <View
                        style={[
                          styles.tabLollipopTipDot,
                          { backgroundColor: isSelected ? '#F59E0B' : dominantColor },
                        ]}
                      />
                    </View>
                  </View>
                </Marker>
              );
            })}

            {/* In-App Route Polyline */}
            {activeInAppRoute && (
              <>
                {/* Contrast outer polyline */}
                <Polyline
                  coordinates={activeInAppRoute.coordinates}
                  strokeColor={isDark ? '#000000' : '#1E3A8A'}
                  strokeWidth={7}
                  lineCap="round"
                  lineJoin="round"
                />
                {/* Active blue polyline */}
                <Polyline
                  coordinates={activeInAppRoute.coordinates}
                  strokeColor="#2563EB"
                  strokeWidth={4.5}
                  lineCap="round"
                  lineJoin="round"
                />

                {/* Starting Location Marker (Current Location / Church) */}
                <Marker
                  coordinate={activeInAppRoute.origin}
                  title={activeInAppRoute.origin.label}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.originMarkerBadge}>
                    <Compass size={14} color="#FFFFFF" strokeWidth={2.5} />
                  </View>
                </Marker>

                {/* Multi-stop intermediate waypoints */}
                {activeInAppRoute.stops?.map((stop, sIdx) => (
                  <Marker
                    key={`inapp_stop_${sIdx}`}
                    coordinate={stop}
                    title={`Stop ${sIdx + 1}: ${stop.label}`}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.waypointMarkerBadge}>
                      <Text style={styles.waypointMarkerNum}>{sIdx + 1}</Text>
                    </View>
                  </Marker>
                ))}
              </>
            )}
          </MapView>
        )}

        {/* Floating Reset / Refresh Button */}
        <TouchableOpacity
          style={[styles.floatingActionBtn, { backgroundColor: cardSurface, borderColor }]}
          onPress={() => {
            setNearbyMode(false);
            setSelectedGroup(null);
            setSelectedMember(null);
            setActiveInAppRoute(null);
            animateToLocation(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude, 0.12);
          }}
          activeOpacity={0.8}
        >
          <Compass size={18} color={primaryText} />
        </TouchableOpacity>
      </View>

      {/* ── IN-APP NAVIGATION & DIRECTIONS CARD ── */}
      {activeInAppRoute && (
        <View
          style={[
            styles.navCardContainer,
            {
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#BFDBFE',
            },
          ]}
        >
          {/* Header Status */}
          <View style={styles.navCardHeader}>
            <View style={styles.navCardStatusPill}>
              <View style={styles.navLiveDot} />
              <Text style={styles.navCardStatusTxt}>
                {activeInAppRoute.isMultiStop ? 'MULTI-STOP ROUTE NAVIGATION' : 'IN-APP ROUTE NAVIGATION'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.navCardCloseBtn}
              onPress={() => setActiveInAppRoute(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Destination Member Info */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <View style={styles.navDestIconWrap}>
              <Navigation size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.navDestName, { color: primaryText }]} numberOfLines={1}>
                  {activeInAppRoute.destination.member.memberName}
                </Text>
                {activeInAppRoute.destination.member.memberCode ? (
                  <View style={styles.navIdBadge}>
                    <Text style={styles.navIdBadgeTxt}>{activeInAppRoute.destination.member.memberCode}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.navDestAddr, { color: secondaryText }]} numberOfLines={1}>
                {activeInAppRoute.destination.member.village || activeInAppRoute.destination.member.city || 'Church Territory'}
                {activeInAppRoute.destination.member.landmark ? ` · Near: ${activeInAppRoute.destination.member.landmark}` : ''}
              </Text>
            </View>
          </View>

          {/* Big Key Stats */}
          <View style={[styles.navStatsRow, { backgroundColor: isDark ? '#1C1917' : '#EFF6FF' }]}>
            <View style={styles.navStatItem}>
              <Text style={[styles.navStatVal, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>
                {activeInAppRoute.distanceKm} km
              </Text>
              <Text style={styles.navStatLbl}>Distance</Text>
            </View>
            <View style={styles.navStatDivider} />
            <View style={styles.navStatItem}>
              <Text style={[styles.navStatVal, { color: isDark ? '#34D399' : '#059669' }]}>
                ~{activeInAppRoute.durationMins} mins
              </Text>
              <Text style={styles.navStatLbl}>Drive Time (IST)</Text>
            </View>
            <View style={styles.navStatDivider} />
            <View style={styles.navStatItem}>
              <Text style={[styles.navStatVal, { color: isDark ? '#FBBF24' : '#D97706' }]}>
                {activeInAppRoute.isMultiStop ? `${(activeInAppRoute.stops?.length || 0) + 1} Stops` : 'Direct'}
              </Text>
              <Text style={styles.navStatLbl}>Visiting Plan</Text>
            </View>
          </View>

          {/* Turn-by-Turn Guidance Preview */}
          <View style={styles.navStepsBox}>
            {activeInAppRoute.steps.slice(0, 2).map((st, i) => (
              <View key={i} style={styles.navStepRow}>
                <Text style={styles.navStepNum}>{i + 1}.</Text>
                <Text style={[styles.navStepTxt, { color: primaryText }]} numberOfLines={1}>
                  {st}
                </Text>
              </View>
            ))}
          </View>

          {/* Navigation Action Buttons */}
          <View style={styles.navActionsRow}>
            <TouchableOpacity
              style={styles.navEndBtn}
              onPress={() => setActiveInAppRoute(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.navEndBtnTxt}>End Navigation</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.navExtBtn,
                {
                  backgroundColor: isDark ? '#27272A' : '#F1F5F9',
                  borderColor: isDark ? '#3F3F46' : '#CBD5E1',
                },
              ]}
              onPress={() => {
                MemberLocationService.openDirections(
                  activeInAppRoute.destination.latitude,
                  activeInAppRoute.destination.longitude,
                  activeInAppRoute.destination.label
                );
              }}
              activeOpacity={0.8}
            >
              <Route size={14} color={secondaryText} style={{ marginRight: 5 }} />
              <Text style={[styles.navExtBtnTxt, { color: primaryText }]}>Google Maps Voice</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── BOTTOM SHEET / ACTION CARD ── */}
      {selectedMember ? (
        /* Single Member Detailed Action Card */
        <View style={[styles.bottomDetailCard, { backgroundColor: cardSurface, borderColor }]}>
          {/* Header Row */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.memberPhotoWrap}>
              {selectedMember.profilePhoto ? (
                <Image source={{ uri: selectedMember.profilePhoto }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE' }]}>
                  <Text style={[styles.avatarInitials, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                    {selectedMember.memberName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.cardMemberName, { color: primaryText }]} numberOfLines={1}>
                  {selectedMember.memberName}
                </Text>
                {/* Custom Member ID Badge (e.g. Rhema-001) */}
                <View style={[styles.idBadge, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
                  <Text style={[styles.idBadgeTxt, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                    {selectedMember.memberCode}
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardMemberSub, { color: secondaryText }]} numberOfLines={1}>
                {selectedMember.careCellName} • {selectedMember.careCellLeaderName}
              </Text>

              {/* Accuracy Badge */}
              {(() => {
                const acc = getAccuracyBadge(selectedMember.locationAccuracy, selectedMember.hasVerifiedHome);
                return (
                  <View style={[styles.accuracyBadge, { backgroundColor: acc.bg, borderColor: acc.border }]}>
                    <Text style={[styles.accuracyBadgeTxt, { color: acc.text }]}>{acc.label}</Text>
                  </View>
                );
              })()}
            </View>

            <TouchableOpacity
              onPress={() => setSelectedMember(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeCardBtn}
            >
              <X size={18} color={secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Address Line */}
          <View style={styles.addressLineRow}>
            <MapPin size={14} color={secondaryText} style={{ marginTop: 2 }} />
            <Text style={[styles.addressText, { color: primaryText }]} numberOfLines={2}>
              {[selectedMember.village, selectedMember.city, selectedMember.district, selectedMember.state]
                .filter(Boolean)
                .join(', ')}
            </Text>
          </View>

          {/* 5 Quick Action Buttons */}
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }]}
              onPress={() => handleScheduleVisit(selectedMember)}
              activeOpacity={0.85}
            >
              <Calendar size={13} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={[styles.primaryActionTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Schedule Visit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryActionBtn, { backgroundColor: secondarySurface, borderColor }]}
              onPress={() => handleDirections(selectedMember)}
              disabled={calculatingRoute}
              activeOpacity={0.8}
            >
              {calculatingRoute ? (
                <ActivityIndicator size="small" color={primaryText} style={{ marginRight: 4 }} />
              ) : (
                <Navigation size={13} color={primaryText} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.secondaryActionTxt, { color: primaryText }]}>
                {calculatingRoute ? 'Routing...' : 'Directions'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryActionBtn,
                {
                  backgroundColor: nearbyMode ? '#3B82F620' : secondarySurface,
                  borderColor: nearbyMode ? '#3B82F6' : borderColor,
                },
              ]}
              onPress={() => handleToggleNearby(selectedMember)}
              activeOpacity={0.8}
            >
              <Sparkles size={13} color={nearbyMode ? '#3B82F6' : primaryText} />
              <Text style={[styles.secondaryActionTxt, { color: nearbyMode ? '#3B82F6' : primaryText }]}>
                {nearbyMode ? `Nearby (${nearbyMembers.length})` : 'Find Nearby'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : selectedGroup && selectedGroup.length > 1 ? (
        /* Multi-Member Village Cluster Bottom Sheet */
        <View style={[styles.bottomDetailCard, { backgroundColor: cardSurface, borderColor, maxHeight: 280 }]}>
          <View style={styles.clusterSheetHeader}>
            <View>
              <Text style={[styles.clusterSheetTitle, { color: primaryText }]}>
                {selectedGroup[0].village || selectedGroup[0].city} Area
              </Text>
              <Text style={[styles.clusterSheetSub, { color: secondaryText }]}>
                {selectedGroup.length} church members mapped to this village / locality
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedGroup(null)} style={styles.closeCardBtn}>
              <X size={18} color={secondaryText} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={selectedGroup}
            keyExtractor={(item) => item.memberId}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.memberListRow, { borderBottomColor: borderColor }]}
                onPress={() => {
                  setSelectedMember(item);
                  if (item.latitude && item.longitude) {
                    animateToLocation(item.latitude, item.longitude, 0.03);
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.miniAvatar}>
                  <Text style={styles.miniAvatarTxt}>{item.memberName.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.rowMemberName, { color: primaryText }]}>{item.memberName}</Text>
                  <Text style={[styles.rowMemberSub, { color: secondaryText }]}>
                    {item.memberCode} • {item.careCellName}
                  </Text>
                </View>
                <ChevronRight size={16} color={secondaryText} />
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {/* ── NEARBY DISCOVERY DRAWER OVERLAY ── */}
      {nearbyMode && selectedMember && (
        <View style={[styles.nearbyDrawer, { backgroundColor: cardSurface, borderColor }]}>
          <View style={styles.nearbyHeaderRow}>
            <View>
              <Text style={[styles.nearbyTitle, { color: primaryText }]}>
                Nearby Members around {selectedMember.memberName}
              </Text>
              <Text style={[styles.nearbySub, { color: secondaryText }]}>
                Found {nearbyMembers.length} members within {nearbyRadiusKm} km
              </Text>
            </View>

            {/* Radius Selectors */}
            <View style={styles.radiusPillsRow}>
              {[1, 2, 5, 10].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.radiusPill,
                    {
                      backgroundColor: nearbyRadiusKm === r ? '#3B82F6' : secondarySurface,
                      borderColor: nearbyRadiusKm === r ? '#3B82F6' : borderColor,
                    },
                  ]}
                  onPress={() => setNearbyRadiusKm(r)}
                >
                  <Text style={[styles.radiusPillTxt, { color: nearbyRadiusKm === r ? '#FFFFFF' : primaryText }]}>
                    {r}k
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setNearbyMode(false)} style={styles.closeCardBtn}>
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Multi-Member Plan Route Action */}
          {multiSelectedMemberIds.length > 1 && (
            <View style={styles.multiPlanRow}>
              <TouchableOpacity
                style={[styles.multiRouteBtn, { backgroundColor: isDark ? '#2563EB' : '#1a2d5a' }]}
                onPress={handlePlanCombinedRoute}
                activeOpacity={0.85}
              >
                <Route size={14} color="#FFFFFF" />
                <Text style={styles.multiRouteTxt}>
                  Navigate Multi-Stop Route ({multiSelectedMemberIds.length} stops)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.multiScheduleBtn, { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}
                onPress={handleBatchScheduleVisit}
                activeOpacity={0.85}
              >
                <Calendar size={13} color="#059669" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>Schedule Combined</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nearbyCardsScroll}>
            {nearbyMembers.map(({ member: nMem, distanceKm }) => {
              const isChecked = multiSelectedMemberIds.includes(nMem.memberId);
              return (
                <TouchableOpacity
                  key={nMem.memberId}
                  style={[
                    styles.nearbyMemberCard,
                    {
                      backgroundColor: secondarySurface,
                      borderColor: isChecked ? '#3B82F6' : borderColor,
                    },
                  ]}
                  onPress={() => handleToggleMultiSelect(nMem.memberId)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={[styles.distBadge, { backgroundColor: isDark ? '#1E293B' : '#DBEAFE' }]}>
                      <Text style={[styles.distBadgeTxt, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                        {distanceKm} km away
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.checkCircle,
                        { backgroundColor: isChecked ? '#3B82F6' : 'transparent', borderColor: '#3B82F6' },
                      ]}
                    >
                      {isChecked && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                  </View>

                  <Text style={[styles.nearbyMemName, { color: primaryText }]} numberOfLines={1}>
                    {nMem.memberName}
                  </Text>
                  <Text style={[styles.nearbyMemSub, { color: secondaryText }]} numberOfLines={1}>
                    {nMem.memberCode} • {nMem.village}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── CARE CELL VISIT SCHEDULER MODAL ── */}
      <CareCellVisitModal
        visible={scheduleModalVisible}
        onClose={() => setScheduleModalVisible(false)}
        cells={cells}
        initialCellId={targetCellIdForVisit}
        createdBy={user?.uid || 'admin'}
        createdByName={member?.name || user?.displayName || 'Pastor'}
        onSuccess={() => {
          setScheduleModalVisible(false);
          loadMemberLocations();
        }}
      />
    </View>
  );
}

const styles = createAdminThemedStyles(
  StyleSheet.create({
    container: { flex: 1 },

    // Top Controls
    topControlsCard: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 8,
      borderBottomWidth: 1,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      height: 40,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      paddingVertical: 0,
    },
    filterPillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
      paddingBottom: 2,
    },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    filterPillTxt: {
      fontSize: 12,
      fontWeight: '700',
    },

    // Map
    mapContainer: {
      flex: 1,
      position: 'relative',
    },
    map: {
      ...StyleSheet.absoluteFillObject,
    },
    centerLoading: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 24,
    },
    loadingTxt: {
      fontSize: 13,
      textAlign: 'center',
      fontWeight: '600',
    },

    // Markers
    tabLollipopWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabLollipopHead: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 6,
    },
    tabLollipopAvatarImg: {
      width: 38,
      height: 38,
      borderRadius: 19,
    },
    tabLollipopAvatarFallback: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabLollipopInitials: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    tabLollipopCountBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 20,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
      paddingHorizontal: 4,
      justifyContent: 'center',
    },
    tabLollipopCountTxt: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
    },
    tabLollipopVerifiedBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#10B981',
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabLollipopStemWrap: {
      alignItems: 'center',
    },
    tabLollipopStem: {
      width: 3.5,
      height: 13,
      borderRadius: 1.75,
    },
    tabLollipopTipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: -1,
    },
    clusterPin: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderWidth: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
      position: 'relative',
    },
    clusterContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    clusterCountTxt: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '800',
    },
    verifiedPinDot: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: '#059669',
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },

    floatingActionBtn: {
      position: 'absolute',
      top: 14,
      right: 14,
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },

    // Bottom Detail Card
    bottomDetailCard: {
      position: 'absolute',
      bottom: 12,
      left: 12,
      right: 12,
      borderRadius: 18,
      borderWidth: 1.5,
      padding: 14,
      elevation: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    memberPhotoWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
    },
    memberAvatar: {
      width: '100%',
      height: '100%',
    },
    avatarPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      fontSize: 15,
      fontWeight: '800',
    },
    cardMemberName: {
      fontSize: 15,
      fontWeight: '800',
    },
    idBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 6,
    },
    idBadgeTxt: {
      fontSize: 11,
      fontWeight: '800',
    },
    cardMemberSub: {
      fontSize: 12,
      marginTop: 2,
    },
    accuracyBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      marginTop: 4,
    },
    accuracyBadgeTxt: {
      fontSize: 10.5,
      fontWeight: '700',
    },
    closeCardBtn: {
      padding: 4,
      alignSelf: 'flex-start',
    },
    addressLineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(150, 150, 150, 0.2)',
    },
    addressText: {
      fontSize: 12.5,
      flex: 1,
      lineHeight: 17,
    },
    actionBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    primaryActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 10,
    },
    primaryActionTxt: {
      fontSize: 12,
      fontWeight: '700',
    },
    secondaryActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    secondaryActionTxt: {
      fontSize: 12,
      fontWeight: '700',
    },

    // Cluster Sheet
    clusterSheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(150, 150, 150, 0.2)',
    },
    clusterSheetTitle: {
      fontSize: 15,
      fontWeight: '800',
    },
    clusterSheetSub: {
      fontSize: 12,
      marginTop: 1,
    },
    memberListRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    miniAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#3B82F6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniAvatarTxt: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    rowMemberName: {
      fontSize: 13.5,
      fontWeight: '700',
    },
    rowMemberSub: {
      fontSize: 11.5,
      marginTop: 1,
    },

    // Nearby Drawer
    nearbyDrawer: {
      position: 'absolute',
      bottom: 12,
      left: 12,
      right: 12,
      borderRadius: 18,
      borderWidth: 1.5,
      padding: 12,
      elevation: 10,
    },
    nearbyHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    nearbyTitle: {
      fontSize: 13.5,
      fontWeight: '800',
    },
    nearbySub: {
      fontSize: 11.5,
      marginTop: 1,
    },
    radiusPillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    radiusPill: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
    },
    radiusPillTxt: {
      fontSize: 11,
      fontWeight: '700',
    },
    multiPlanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    multiRouteBtn: {
      flex: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
    },
    multiRouteTxt: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
    },
    multiScheduleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
    },
    nearbyCardsScroll: {
      gap: 8,
      paddingTop: 2,
    },
    nearbyMemberCard: {
      width: 140,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1.5,
    },
    distBadge: {
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: 4,
    },
    distBadgeTxt: {
      fontSize: 10,
      fontWeight: '800',
    },
    checkCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nearbyMemName: {
      fontSize: 12.5,
      fontWeight: '700',
      marginTop: 6,
    },
    nearbyMemSub: {
      fontSize: 11,
      marginTop: 2,
    },
    originMarkerBadge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: '#10B981',
      borderWidth: 2,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
    },
    waypointMarkerBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#2563EB',
      borderWidth: 2,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
    },
    waypointMarkerNum: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    navCardContainer: {
      position: 'absolute',
      bottom: 12,
      left: 12,
      right: 12,
      borderRadius: 16,
      borderWidth: 1.5,
      padding: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
    },
    navCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    navCardStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(37, 99, 235, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      gap: 5,
    },
    navLiveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#2563EB',
    },
    navCardStatusTxt: {
      fontSize: 10,
      fontWeight: '800',
      color: '#2563EB',
      letterSpacing: 0.5,
    },
    navCardCloseBtn: {
      padding: 4,
    },
    navDestIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#2563EB',
      alignItems: 'center',
      justifyContent: 'center',
    },
    navDestName: {
      fontSize: 15,
      fontWeight: '800',
    },
    navIdBadge: {
      backgroundColor: 'rgba(37, 99, 235, 0.15)',
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 4,
    },
    navIdBadgeTxt: {
      fontSize: 10,
      fontWeight: '700',
      color: '#2563EB',
    },
    navDestAddr: {
      fontSize: 11.5,
      marginTop: 2,
    },
    navStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      borderRadius: 10,
      paddingVertical: 8,
      marginTop: 10,
    },
    navStatItem: {
      alignItems: 'center',
      flex: 1,
    },
    navStatVal: {
      fontSize: 14,
      fontWeight: '800',
    },
    navStatLbl: {
      fontSize: 10,
      color: '#64748B',
      marginTop: 1,
      fontWeight: '600',
    },
    navStatDivider: {
      width: 1,
      height: 20,
      backgroundColor: 'rgba(148, 163, 184, 0.25)',
    },
    navStepsBox: {
      marginTop: 8,
      gap: 3,
    },
    navStepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    navStepNum: {
      fontSize: 11,
      fontWeight: '700',
      color: '#64748B',
    },
    navStepTxt: {
      fontSize: 11,
      flex: 1,
    },
    navActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    navEndBtn: {
      flex: 1,
      backgroundColor: '#DC2626',
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navEndBtnTxt: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '800',
    },
    navExtBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    navExtBtnTxt: {
      fontSize: 12,
      fontWeight: '700',
    },
  })
);
