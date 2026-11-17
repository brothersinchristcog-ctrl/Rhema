import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
  Linking,
  Alert,
  ScrollView,
  Image,
  FlatList,
  StatusBar,
  ActivityIndicator,
  PixelRatio,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import {
  ArrowLeft,
  Navigation,
  Phone,
  MessageCircle,
  MapPin,
  Calendar,
  AlertTriangle,
  Heart,
  CheckCircle2,
  Users,
  Compass,
  Layers,
  List,
  Map as MapIcon,
  X,
  Plus,
  Route,
  Home,
  Save,
} from 'lucide-react-native';
import { CareCell, CareCellMembership, formatCareCellCode, formatCareCellDisplayName } from '../../../../types/CareCellTypes';
import { useAdminTheme, createAdminThemedStyles } from '../../../../utils/adminThemeHelper';
import MemberLocationService from '../../../../services/MemberLocationService';
import CareCellService, { calculateDistanceKm, KNOWN_REGION_COORDS } from '../../../../services/CareCellService';

const { width, height } = Dimensions.get('window');

// Android New Architecture fabric marker sizing
const ANDROID_MARKER_BOX =
  Platform.OS === 'android'
    ? Math.min(38, Math.max(26, Math.floor(96 / Math.max(1, PixelRatio.get()))))
    : 56;
const PIN_HEAD_SIZE = Platform.OS === 'android' ? ANDROID_MARKER_BOX - 6 : 44;
const PIN_BORDER_WIDTH = Platform.OS === 'android' ? 2 : 2.5;
const PIN_IMAGE_SIZE = PIN_HEAD_SIZE - PIN_BORDER_WIDTH * 2;

// Default Kurnool coordinates if cell doesn't have coordinates
const DEFAULT_KURNOOL_LAT = 15.8281;
const DEFAULT_KURNOOL_LNG = 78.0373;

interface EnrichedCareCellMembership extends CareCellMembership {
  distanceKm?: number;
  profilePhoto?: string;
  locationAccuracy?: string;
}

interface CareCellMapModalProps {
  visible: boolean;
  onClose: () => void;
  cell: CareCell;
  members: CareCellMembership[];
  inactiveMembers?: Array<{ memberId: string; missedCount: number; memberName?: string }>;
  onLogFollowup?: (member: CareCellMembership) => void;
  // Visiting Route extensions
  initialPlannedRouteIds?: string[];
  visitMemberMeta?: Record<string, { response?: any; preferredTime?: string }>;
  visitDefaultTime?: string;
  onSaveVisitRoute?: (stops: any[]) => void;
  visitTitle?: string;
}

export default function CareCellMapModal({
  visible,
  onClose,
  cell,
  members,
  inactiveMembers = [],
  onLogFollowup,
  initialPlannedRouteIds,
  visitMemberMeta,
  visitDefaultTime,
  onSaveVisitRoute,
  visitTitle,
}: CareCellMapModalProps) {
  const insets = useSafeAreaInsets();
  const { isDark, primaryText, secondaryText, cardSurface, borderColor } = useAdminTheme();
  const primaryBtnBg = isDark ? '#FFFFFF' : '#0F172A';
  const primaryBtnText = isDark ? '#000000' : '#FFFFFF';
  const secondaryBtnBg = isDark ? '#27272A' : '#F8FAFC';
  const secondaryBtnBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1';
  const secondaryBtnText = isDark ? '#E4E4E7' : '#334155';

  const mapRef = useRef<MapView | null>(null);

  // Top Inset ensuring zero status bar overlap on any Android / iOS device
  const topHeaderInset =
    Platform.OS === 'android'
      ? (StatusBar.currentHeight || 28) + 16
      : insets.top + 12;

  // View mode: 'map' or 'list'
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedLocality, setSelectedLocality] = useState<string>('ALL');
  const [filterNeedsVisitOnly, setFilterNeedsVisitOnly] = useState<boolean>(false);
  const [visitResponseFilter, setVisitResponseFilter] = useState<'ALL' | 'ACCEPTED_ONLY' | 'NON_DECLINED'>('ALL');

  // Marker tracking state so images snapshot properly
  const [loadedMarkerPhotos, setLoadedMarkerPhotos] = useState<Record<string, boolean>>({});
  const [refreshMarkersCount, setRefreshMarkersCount] = useState<number>(0);

  // Loading & Enriched data state
  const [loadingLocations, setLoadingLocations] = useState<boolean>(true);
  const [enrichedMembers, setEnrichedMembers] = useState<EnrichedCareCellMembership[]>([]);

  // Resolve Initial Cell Center immediately from known regions if coordinates missing
  const getInitialCenter = () => {
    if (cell.meetingLatitude && cell.meetingLongitude) {
      return { latitude: cell.meetingLatitude, longitude: cell.meetingLongitude };
    }
    const locLower = (cell.location || cell.meetingLocation || '').toLowerCase().trim();
    if (locLower && KNOWN_REGION_COORDS[locLower]) {
      return { latitude: KNOWN_REGION_COORDS[locLower].lat, longitude: KNOWN_REGION_COORDS[locLower].lng };
    }
    if (locLower.includes('koila')) {
      return { latitude: 15.2333, longitude: 78.3167 };
    }
    return { latitude: DEFAULT_KURNOOL_LAT, longitude: DEFAULT_KURNOOL_LNG };
  };

  const [resolvedCenter, setResolvedCenter] = useState<{ latitude: number; longitude: number }>(getInitialCenter);

  // Selected member card on map
  const [selectedMember, setSelectedMember] = useState<EnrichedCareCellMembership | null>(null);

  // Route Planning: list of member IDs in visit order
  const [plannedRouteMemberIds, setPlannedRouteMemberIds] = useState<string[]>(
    initialPlannedRouteIds || []
  );

  useEffect(() => {
    if (initialPlannedRouteIds && initialPlannedRouteIds.length > 0) {
      setPlannedRouteMemberIds(initialPlannedRouteIds);
    }
  }, [initialPlannedRouteIds]);

  // Marker view refresh timers to snapshot lollipop pins cleanly
  useEffect(() => {
    if (!visible) return;
    const t1 = setTimeout(() => setRefreshMarkersCount((c) => c + 1), 300);
    const t2 = setTimeout(() => setRefreshMarkersCount((c) => c + 1), 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [visible, loadingLocations]);

  // Inactive Member IDs set for fast lookup
  const inactiveMemberIdSet = useMemo(() => {
    return new Set(inactiveMembers.map((im) => im.memberId));
  }, [inactiveMembers]);

  // Resolve locations and coordinates from Firestore / Member profiles
  useEffect(() => {
    let isMounted = true;
    async function loadLocations() {
      if (!visible) return;
      setLoadingLocations(true);
      try {
        const churchId = await CareCellService.getChurchId();
        const res = await MemberLocationService.resolveCareCellMemberLocations(churchId, cell, members);
        if (isMounted) {
          if (res.cellCenter && res.cellCenter.latitude && res.cellCenter.longitude) {
            setResolvedCenter(res.cellCenter);
          }
          setEnrichedMembers(res.resolvedMembers);
        }
      } catch (err) {
        console.error('Failed to resolve member locations for map:', err);
        if (isMounted) {
          setEnrichedMembers(members);
        }
      } finally {
        if (isMounted) setLoadingLocations(false);
      }
    }

    loadLocations();
    return () => {
      isMounted = false;
    };
  }, [visible, cell, members]);

  // Initial map region centered on resolved cell center
  const initialRegion = useMemo(() => {
    return {
      latitude: resolvedCenter.latitude,
      longitude: resolvedCenter.longitude,
      latitudeDelta: 0.045,
      longitudeDelta: 0.045,
    };
  }, [resolvedCenter]);

  // Auto-fit map camera when coordinates are ready
  useEffect(() => {
    if (!loadingLocations && enrichedMembers.length > 0 && mapRef.current) {
      const validCoords = enrichedMembers
        .filter((m) => typeof m.latitude === 'number' && typeof m.longitude === 'number' && !isNaN(m.latitude))
        .map((m) => ({ latitude: m.latitude!, longitude: m.longitude! }));

      if (resolvedCenter.latitude && resolvedCenter.longitude) {
        validCoords.push(resolvedCenter);
      }

      if (validCoords.length > 0) {
        const timer = setTimeout(() => {
          mapRef.current?.fitToCoordinates(validCoords, {
            edgePadding: { top: 120, right: 60, bottom: 240, left: 60 },
            animated: true,
          });
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [loadingLocations, enrichedMembers, resolvedCenter]);

  // Compute distinct localities from members
  const localities = useMemo(() => {
    const set = new Set<string>();
    enrichedMembers.forEach((m) => {
      if (m.locality && m.locality.trim()) {
        set.add(m.locality.trim());
      }
    });
    return Array.from(set).sort();
  }, [enrichedMembers]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    let list = enrichedMembers;
    if (filterNeedsVisitOnly) {
      list = list.filter((m) => inactiveMemberIdSet.has(m.memberId));
    }
    if (selectedLocality !== 'ALL') {
      list = list.filter((m) => (m.locality || '').trim().toLowerCase() === selectedLocality.toLowerCase());
    }
    return list;
  }, [enrichedMembers, filterNeedsVisitOnly, selectedLocality, inactiveMemberIdSet]);

  // Members to render on the map with slight radial offset for identical village coordinates
  const membersToRenderOnMap = useMemo(() => {
    const coordSeenCount = new Map<string, number>();

    return filteredMembers
      .filter(
        (m) =>
          typeof m.latitude === 'number' &&
          typeof m.longitude === 'number' &&
          !isNaN(m.latitude) &&
          !isNaN(m.longitude)
      )
      .map((m) => {
        const key = `${m.latitude!.toFixed(4)}_${m.longitude!.toFixed(4)}`;
        const seen = coordSeenCount.get(key) || 0;
        coordSeenCount.set(key, seen + 1);

        if (seen > 0) {
          // Jitter by ~22 meters radially so lollipop pins never hide each other
          const angle = (seen * 2 * Math.PI) / 3;
          const offsetLat = 0.00022 * Math.cos(angle);
          const offsetLng = 0.00022 * Math.sin(angle);
          return {
            ...m,
            plotLat: m.latitude! + offsetLat,
            plotLng: m.longitude! + offsetLng,
          };
        }

        return {
          ...m,
          plotLat: m.latitude!,
          plotLng: m.longitude!,
        };
      });
  }, [filteredMembers]);

  // Total sequential route distance in kilometers
  const totalRouteDistanceKm = useMemo(() => {
    if (plannedRouteMemberIds.length === 0) return 0;
    const ordered = plannedRouteMemberIds
      .map((id) => enrichedMembers.find((m) => m.memberId === id))
      .filter((m): m is EnrichedCareCellMembership => !!m && typeof m.latitude === 'number' && typeof m.longitude === 'number');

    if (ordered.length === 0) return 0;

    let total = 0;
    let prevLat = resolvedCenter.latitude;
    let prevLng = resolvedCenter.longitude;

    for (const stop of ordered) {
      total += calculateDistanceKm(prevLat, prevLng, stop.latitude!, stop.longitude!);
      prevLat = stop.latitude!;
      prevLng = stop.longitude!;
    }
    return Math.round(total * 10) / 10;
  }, [plannedRouteMemberIds, enrichedMembers, resolvedCenter]);

  // Navigation: Open Google Maps directions to a single member
  const handleNavigateToMember = (m: EnrichedCareCellMembership) => {
    if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
      const lat = m.latitude;
      const lng = m.longitude;
      const label = encodeURIComponent(`${m.memberName}'s House`);
      const url = Platform.select({
        ios: `maps:0,0?q=${lat},${lng}(${label})`,
        android: `google.navigation:q=${lat},${lng}`,
        default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      });

      Linking.openURL(url!).catch(() => {
        const webFallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        Linking.openURL(webFallback).catch(() => {
          Alert.alert('Navigation Error', 'Could not open Google Maps.');
        });
      });
    } else if (m.address || m.locality) {
      const query = encodeURIComponent(`${m.address || ''}, ${m.locality || ''}, Andhra Pradesh`);
      const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('Navigation Error', 'Could not open Google Maps.');
      });
    } else {
      Alert.alert('No Address', 'Member does not have GPS coordinates or an address saved.');
    }
  };

  // Phone call trigger
  const handleCall = (phone?: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No contact number available.');
      return;
    }
    const clean = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => {
      Alert.alert('Call Failed', 'Unable to initiate call.');
    });
  };

  // WhatsApp trigger
  const handleWhatsApp = (phone?: string, name?: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No phone number available for WhatsApp.');
      return;
    }
    const clean = phone.replace(/[^0-9]/g, '');
    const text = encodeURIComponent(`Praise the Lord ${name || 'brother/sister'}! Grace and peace to you from Rhema Care Cell.`);
    Linking.openURL(`whatsapp://send?phone=${clean}&text=${text}`).catch(() => {
      Alert.alert('WhatsApp Required', 'WhatsApp is not installed on this device.');
    });
  };

  // Toggle member into planned route
  const handleToggleRouteMember = (memberId: string) => {
    setPlannedRouteMemberIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      } else {
        return [...prev, memberId];
      }
    });
  };

  // Open multi-stop route in Google Maps
  const handleOpenMultiStopRoute = () => {
    if (plannedRouteMemberIds.length === 0) return;

    const routeMembers = plannedRouteMemberIds
      .map((id) => enrichedMembers.find((m) => m.memberId === id))
      .filter((m): m is EnrichedCareCellMembership => !!m && typeof m.latitude === 'number' && typeof m.longitude === 'number');

    if (routeMembers.length === 0) {
      Alert.alert('Missing Coordinates', 'The selected members for the visit route do not have GPS coordinates.');
      return;
    }

    if (routeMembers.length === 1) {
      handleNavigateToMember(routeMembers[0]);
      return;
    }

    // Build Google Maps Multi-Stop URL
    const destination = `${routeMembers[routeMembers.length - 1].latitude},${routeMembers[routeMembers.length - 1].longitude}`;
    const midWaypoints = routeMembers
      .slice(0, routeMembers.length - 1)
      .map((m) => `${m.latitude},${m.longitude}`)
      .join('|');

    const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${midWaypoints}&travelmode=driving`;

    Linking.openURL(routeUrl).catch(() => {
      Alert.alert('Route Error', 'Unable to open Google Maps route navigation.');
    });
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent={true} onRequestClose={onClose}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />
      <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FAF7F2' }]}>
        {/* Top Header Bar with Safe Top Inset */}
        <View
          style={[
            styles.header,
            {
              paddingTop: topHeaderInset,
              backgroundColor: isDark ? '#000000' : '#FFFFFF',
              borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.circularBackBtn,
              {
                backgroundColor: isDark ? '#18181B' : '#F8FAFC',
                borderColor: isDark ? '#27272A' : '#E2E8F0',
              },
            ]}
            onPress={onClose}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={20} color={primaryText} strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
              {visitTitle || formatCareCellDisplayName(cell.name, cell.cellCode)}
            </Text>
            <Text style={[styles.headerSub, { color: secondaryText }]} numberOfLines={1}>
              {formatCareCellCode(cell.cellCode)} · {cell.location || 'Local Area'} · {members.length} Members
            </Text>
          </View>
          <View style={[styles.viewModeToggleRow, { backgroundColor: isDark ? '#18181B' : '#F1F5F9' }]}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, viewMode === 'map' && { backgroundColor: primaryBtnBg }]}
              onPress={() => setViewMode('map')}
            >
              <MapIcon size={14} color={viewMode === 'map' ? primaryBtnText : secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeToggleBtn, viewMode === 'list' && { backgroundColor: primaryBtnBg }]}
              onPress={() => setViewMode('list')}
            >
              <List size={14} color={viewMode === 'list' ? primaryBtnText : secondaryText} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Pills Bar */}
        <View style={[styles.filterBar, { backgroundColor: cardSurface, borderBottomColor: borderColor }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                selectedLocality === 'ALL' && !filterNeedsVisitOnly && {
                  backgroundColor: isDark ? '#2563EB' : '#1E3A8A',
                  borderColor: isDark ? '#3B82F6' : '#1E3A8A',
                },
              ]}
              onPress={() => {
                setSelectedLocality('ALL');
                setFilterNeedsVisitOnly(false);
              }}
            >
              <Text
                style={[
                  styles.filterPillTxt,
                  selectedLocality === 'ALL' && !filterNeedsVisitOnly && { color: '#FFFFFF', fontWeight: '700' },
                ]}
              >
                All Members ({members.length})
              </Text>
            </TouchableOpacity>

            {visitMemberMeta ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    visitResponseFilter === 'ACCEPTED_ONLY' && {
                      backgroundColor: '#059669',
                      borderColor: '#059669',
                    },
                  ]}
                  onPress={() =>
                    setVisitResponseFilter((prev) => (prev === 'ACCEPTED_ONLY' ? 'ALL' : 'ACCEPTED_ONLY'))
                  }
                >
                  <CheckCircle2
                    size={12}
                    color={visitResponseFilter === 'ACCEPTED_ONLY' ? '#FFFFFF' : '#059669'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.filterPillTxt,
                      visitResponseFilter === 'ACCEPTED_ONLY' && { color: '#FFFFFF', fontWeight: '700' },
                    ]}
                  >
                    Accepted Only
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    visitResponseFilter === 'NON_DECLINED' && {
                      backgroundColor: isDark ? '#2563EB' : '#1E3A8A',
                      borderColor: isDark ? '#3B82F6' : '#1E3A8A',
                    },
                  ]}
                  onPress={() =>
                    setVisitResponseFilter((prev) => (prev === 'NON_DECLINED' ? 'ALL' : 'NON_DECLINED'))
                  }
                >
                  <Text
                    style={[
                      styles.filterPillTxt,
                      visitResponseFilter === 'NON_DECLINED' && { color: '#FFFFFF', fontWeight: '700' },
                    ]}
                  >
                    Non-Declined
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}

            {inactiveMembers.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  filterNeedsVisitOnly && styles.filterPillAlertActive,
                ]}
                onPress={() => setFilterNeedsVisitOnly(!filterNeedsVisitOnly)}
              >
                <AlertTriangle size={12} color={filterNeedsVisitOnly ? '#FFFFFF' : '#DC2626'} style={{ marginRight: 4 }} />
                <Text
                  style={[
                    styles.filterPillTxt,
                    { color: filterNeedsVisitOnly ? '#FFFFFF' : '#DC2626', fontWeight: '700' },
                  ]}
                >
                  Needs Pastoral Visit ({inactiveMembers.length})
                </Text>
              </TouchableOpacity>
            )}

            {localities.map((loc) => {
              const isSelected = selectedLocality === loc && !filterNeedsVisitOnly;
              return (
                <TouchableOpacity
                  key={loc}
                  style={[
                    styles.filterPill,
                    isSelected && {
                      backgroundColor: isDark ? '#2563EB' : '#1E3A8A',
                      borderColor: isDark ? '#3B82F6' : '#1E3A8A',
                    },
                  ]}
                  onPress={() => {
                    setFilterNeedsVisitOnly(false);
                    setSelectedLocality(loc);
                  }}
                >
                  <MapPin size={11} color={isSelected ? '#FFFFFF' : secondaryText} style={{ marginRight: 4 }} />
                  <Text style={[styles.filterPillTxt, isSelected && { color: '#FFFFFF', fontWeight: '700' }]}>{loc}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Main Content: Map or List */}
        {viewMode === 'map' ? (
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              style={StyleSheet.absoluteFillObject}
              initialRegion={initialRegion}
              showsUserLocation={true}
              showsMyLocationButton={true}
              showsCompass={true}
            >
              {/* Care Cell Meeting Marker: Amber Center Lollipop */}
              {resolvedCenter.latitude && resolvedCenter.longitude ? (
                <Marker
                  coordinate={resolvedCenter}
                  anchor={{ x: 0.5, y: 1.0 }}
                  title={formatCareCellDisplayName(cell.name, cell.cellCode)}
                  description={`Care Cell Center: ${cell.meetingLocation || cell.location || 'Local'}`}
                  pinColor="#D97706"
                >
                  <View collapsable={false} style={styles.photoPinWrapper}>
                    <View
                      collapsable={false}
                      style={[
                        styles.photoPinHead,
                        {
                          borderColor: '#D97706',
                          borderWidth: 2.5,
                          backgroundColor: '#D97706',
                        },
                      ]}
                    >
                      <Users size={18} color="#FFFFFF" />
                    </View>
                    <View
                      collapsable={false}
                      style={[
                        styles.photoPinTriangle,
                        { borderTopColor: '#D97706' },
                      ]}
                    />
                  </View>
                </Marker>
              ) : null}

              {/* Member Residence Lollipop Markers with Profile Pictures */}
              {membersToRenderOnMap.map((m) => {
                const isInactive = inactiveMemberIdSet.has(m.memberId);
                const isSelected = selectedMember?.memberId === m.memberId;
                const inRouteIndex = plannedRouteMemberIds.indexOf(m.memberId);

                // Rhema Status Accent Color: Amber for Selected, Green for Route, Red for Inactive, Deep Blue for Regular
                const accentColor = isSelected
                  ? '#F59E0B'
                  : inRouteIndex >= 0
                    ? '#059669'
                    : isInactive
                      ? '#DC2626'
                      : '#1E3A8A';

                const photoUri = typeof m.memberPhoto === 'string' ? m.memberPhoto.trim() : '';
                const hasPhoto = photoUri.length > 0;

                return (
                  <Marker
                    key={m.id || m.memberId}
                    coordinate={{
                      latitude: m.plotLat,
                      longitude: m.plotLng,
                    }}
                    anchor={{ x: 0.5, y: 1.0 }}
                    onPress={() => setSelectedMember(m)}
                    tracksViewChanges={Boolean(
                      (hasPhoto && !loadedMarkerPhotos[m.memberId]) ||
                      isSelected ||
                      refreshMarkersCount < 2
                    )}
                  >
                    <View collapsable={false} style={[styles.photoPinWrapper, isSelected && styles.photoPinWrapperSelected]}>
                      {/* Lollipop Head: Circular Avatar Container */}
                      <View
                        collapsable={false}
                        style={[
                          styles.photoPinHead,
                          {
                            borderColor: accentColor,
                            backgroundColor: hasPhoto ? '#FFFFFF' : accentColor,
                          },
                        ]}
                      >
                        {hasPhoto ? (
                          <Image
                            source={{ uri: photoUri }}
                            style={styles.photoPinImage}
                            resizeMode="cover"
                            fadeDuration={0}
                            onLoad={() => {
                              setLoadedMarkerPhotos((prev) => ({ ...prev, [m.memberId]: true }));
                            }}
                          />
                        ) : (
                          <View collapsable={false} style={[styles.photoPinFallback, { backgroundColor: accentColor }]}>
                            <Text style={styles.markerInitialsTxt}>
                              {(m.memberName || 'M').slice(0, 2).toUpperCase()}
                            </Text>
                          </View>
                        )}

                        {/* Route Order Badge or Alert Icon */}
                        {inRouteIndex >= 0 ? (
                          <View collapsable={false} style={styles.routeOrderCornerBadge}>
                            <Text style={styles.routeOrderCornerTxt}>{inRouteIndex + 1}</Text>
                          </View>
                        ) : isInactive ? (
                          <View collapsable={false} style={styles.routeOrderCornerBadgeAlert}>
                            <AlertTriangle size={8} color="#FFFFFF" strokeWidth={3} />
                          </View>
                        ) : null}
                      </View>

                      {/* Lollipop Pointer Triangle */}
                      <View
                        collapsable={false}
                        style={[
                          styles.photoPinTriangle,
                          { borderTopColor: accentColor },
                        ]}
                      />
                    </View>
                  </Marker>
                );
              })}

              {/* Planned Route Line connecting consecutive stops */}
              {plannedRouteMemberIds.length >= 2 && (
                <Polyline
                  coordinates={plannedRouteMemberIds
                    .map((id) => membersToRenderOnMap.find((mem) => mem.memberId === id))
                    .filter((m): m is any => !!m && typeof m.plotLat === 'number' && typeof m.plotLng === 'number')
                    .map((m) => ({ latitude: m.plotLat, longitude: m.plotLng }))}
                  strokeColor="#059669"
                  strokeWidth={3.5}
                  lineDashPattern={[8, 5]}
                />
              )}
            </MapView>

            {/* Loading Indicator Overlay */}
            {loadingLocations && (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.mapLoadingTxt}>Locating member residences in {cell.location || 'cell'}...</Text>
              </View>
            )}

            {/* Floating Top Route Summary Bar */}
            {plannedRouteMemberIds.length > 0 && (
              <View style={[styles.floatingRouteBar, { backgroundColor: isDark ? '#18181B' : '#1E3A8A' }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.floatingRouteTitle}>
                    {plannedRouteMemberIds.length} House Visits Planned ({totalRouteDistanceKm} km)
                  </Text>
                  <Text style={styles.floatingRouteSub} numberOfLines={1}>
                    Sequential pastoral route from {formatCareCellDisplayName(cell.name, cell.cellCode)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {onSaveVisitRoute && (
                    <TouchableOpacity
                      style={[styles.floatingNavigateRouteBtn, { backgroundColor: isDark ? '#2563EB' : '#1E3A8A', borderWidth: 1, borderColor: '#3B82F6' }]}
                      onPress={() => {
                        const stops = plannedRouteMemberIds
                          .map((id, idx) => {
                            const m = enrichedMembers.find((mem) => mem.memberId === id);
                            if (!m) return null;
                            return {
                              memberId: m.memberId,
                              memberName: m.memberName,
                              locality: m.locality,
                              address: m.address,
                              latitude: m.latitude,
                              longitude: m.longitude,
                              order: idx + 1,
                            };
                          })
                          .filter(Boolean);
                        onSaveVisitRoute(stops);
                        Alert.alert('Route Saved', 'Pastoral visit route stops saved successfully.');
                      }}
                      activeOpacity={0.85}
                    >
                      <Save size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.floatingNavigateRouteBtnTxt}>Save</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.floatingNavigateRouteBtn}
                    onPress={handleOpenMultiStopRoute}
                    activeOpacity={0.85}
                  >
                    <Navigation size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.floatingNavigateRouteBtnTxt}>Start Route</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Selected Member Detail Callout Card */}
            {selectedMember ? (
              <View style={styles.selectedMemberCard}>
                <View style={styles.selectedCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                    {selectedMember.memberPhoto ? (
                      <Image source={{ uri: selectedMember.memberPhoto }} style={styles.selectedMemberAvatar} />
                    ) : (
                      <View style={styles.selectedMemberAvatarFallback}>
                        <Text style={styles.selectedMemberAvatarInitials}>
                          {(selectedMember.memberName || 'M').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedMemberName} numberOfLines={1}>
                        {selectedMember.memberName}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
                        {selectedMember.locality ? (
                          <View style={styles.localityTag}>
                            <MapPin size={10} color="#1A2D5A" />
                            <Text style={styles.localityTagTxt}>{selectedMember.locality}</Text>
                          </View>
                        ) : null}

                        {selectedMember.distanceKm != null ? (
                          <View style={styles.distanceTag}>
                            <Compass size={10} color="#2563EB" />
                            <Text style={styles.distanceTagTxt}>{selectedMember.distanceKm} km away</Text>
                          </View>
                        ) : null}

                        {inactiveMemberIdSet.has(selectedMember.memberId) && (
                          <View style={styles.needsVisitTag}>
                            <Text style={styles.needsVisitTagTxt}>Needs Visit</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedMember(null)} style={{ padding: 4 }}>
                    <X size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {selectedMember.address ? (
                  <Text style={styles.selectedMemberAddress} numberOfLines={2}>
                    {selectedMember.address}
                  </Text>
                ) : null}

                {/* Quick Action Buttons */}
                <View style={styles.selectedActionsRow}>
                  <TouchableOpacity
                    style={[styles.actionNavigateBtn, { backgroundColor: primaryBtnBg }]}
                    onPress={() => handleNavigateToMember(selectedMember)}
                    activeOpacity={0.85}
                  >
                    <Navigation size={14} color={primaryBtnText} style={{ marginRight: 6 }} />
                    <Text style={[styles.actionNavigateBtnTxt, { color: primaryBtnText }]}>Directions</Text>
                  </TouchableOpacity>

                  {selectedMember.memberPhone ? (
                    <>
                      <TouchableOpacity
                        style={[styles.actionCircleBtn, { backgroundColor: secondaryBtnBg, borderWidth: 1, borderColor: secondaryBtnBorder }]}
                        onPress={() => handleCall(selectedMember.memberPhone)}
                      >
                        <Phone size={15} color={secondaryBtnText} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionCircleBtn, { backgroundColor: '#25D366' }]}
                        onPress={() => handleWhatsApp(selectedMember.memberPhone, selectedMember.memberName)}
                      >
                        <MessageCircle size={15} color="#FFFFFF" />
                      </TouchableOpacity>
                    </>
                  ) : null}

                  {onLogFollowup && (
                    <TouchableOpacity
                      style={[styles.actionLogVisitBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                      onPress={() => {
                        onLogFollowup(selectedMember);
                      }}
                    >
                      <Heart size={13} color={secondaryBtnText} style={{ marginRight: 4 }} />
                      <Text style={[styles.actionLogVisitBtnTxt, { color: secondaryBtnText }]}>Log Visit</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.actionRouteBtn,
                      { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder },
                      plannedRouteMemberIds.includes(selectedMember.memberId) && styles.actionRouteBtnActive,
                    ]}
                    onPress={() => handleToggleRouteMember(selectedMember.memberId)}
                  >
                    <Route
                      size={13}
                      color={plannedRouteMemberIds.includes(selectedMember.memberId) ? '#FFFFFF' : secondaryBtnText}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.actionRouteBtnTxt,
                        { color: secondaryBtnText },
                        plannedRouteMemberIds.includes(selectedMember.memberId) && styles.actionRouteBtnTxtActive,
                      ]}
                    >
                      {plannedRouteMemberIds.includes(selectedMember.memberId) ? 'In Route' : '+ Route'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          /* List View Mode */
          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => item.id || item.memberId}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isInactive = inactiveMemberIdSet.has(item.memberId);
              const inRoute = plannedRouteMemberIds.includes(item.memberId);

              return (
                <View style={styles.memberListItem}>
                  <View style={styles.listItemTopRow}>
                    {item.memberPhoto ? (
                      <Image source={{ uri: item.memberPhoto }} style={styles.listAvatarImg} />
                    ) : (
                      <View style={styles.itemAvatarFallback}>
                        <Text style={styles.itemAvatarInitials}>
                          {(item.memberName || 'M').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemMemberName}>{item.memberName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                        {item.locality ? (
                          <View style={styles.localityTag}>
                            <MapPin size={10} color="#1A2D5A" />
                            <Text style={styles.localityTagTxt}>{item.locality}</Text>
                          </View>
                        ) : null}

                        {item.distanceKm != null ? (
                          <View style={styles.distanceTag}>
                            <Compass size={10} color="#2563EB" />
                            <Text style={styles.distanceTagTxt}>{item.distanceKm} km away</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    {isInactive && (
                      <View style={styles.needsVisitTag}>
                        <Text style={styles.needsVisitTagTxt}>Needs Visit</Text>
                      </View>
                    )}
                  </View>

                  {item.address ? (
                    <Text style={styles.itemAddressTxt} numberOfLines={2}>
                      {item.address}
                    </Text>
                  ) : (
                    <Text style={styles.itemNoAddressTxt}>No residential address on file</Text>
                  )}

                  <View style={styles.listItemActionsRow}>
                    <TouchableOpacity
                      style={[styles.itemDirectionsBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                      onPress={() => handleNavigateToMember(item)}
                    >
                      <Navigation size={13} color={secondaryBtnText} style={{ marginRight: 4 }} />
                      <Text style={[styles.itemDirectionsBtnTxt, { color: secondaryBtnText }]}>Directions</Text>
                    </TouchableOpacity>

                    {item.memberPhone ? (
                      <>
                        <TouchableOpacity
                          style={[styles.itemCallBtn, { backgroundColor: secondaryBtnBg, borderWidth: 1, borderColor: secondaryBtnBorder }]}
                          onPress={() => handleCall(item.memberPhone)}
                        >
                          <Phone size={13} color={secondaryBtnText} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.itemCallBtn, { backgroundColor: '#25D366' }]}
                          onPress={() => handleWhatsApp(item.memberPhone, item.memberName)}
                        >
                          <MessageCircle size={13} color="#FFFFFF" />
                        </TouchableOpacity>
                      </>
                    ) : null}

                    {onLogFollowup && (
                      <TouchableOpacity
                        style={[styles.itemLogBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                        onPress={() => onLogFollowup(item)}
                      >
                        <Text style={[styles.itemLogBtnTxt, { color: secondaryBtnText }]}>Log Visit</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.itemRouteBtn,
                        { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder },
                        inRoute && styles.itemRouteBtnActive,
                      ]}
                      onPress={() => handleToggleRouteMember(item.memberId)}
                    >
                      <Text style={[styles.itemRouteBtnTxt, { color: secondaryBtnText }, inRoute && styles.itemRouteBtnTxtActive]}>
                        {inRoute ? 'In Route' : '+ Route'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = createAdminThemedStyles({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  viewModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  modeToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillAlertActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  filterPillTxt: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  mapContainer: {
    flex: 1,
  },
  mapLoadingOverlay: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  mapLoadingTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },

  /* ── Lollipop Marker Styles (User Request: Profile pic with lollipop symbol) ── */
  photoPinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPinWrapperSelected: {
    transform: [{ scale: 1.15 }],
  },
  photoPinHead: {
    width: PIN_HEAD_SIZE,
    height: PIN_HEAD_SIZE,
    borderRadius: PIN_HEAD_SIZE / 2,
    borderWidth: PIN_BORDER_WIDTH,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.5,
    elevation: 5,
  },
  photoPinImage: {
    width: PIN_IMAGE_SIZE,
    height: PIN_IMAGE_SIZE,
    borderRadius: PIN_IMAGE_SIZE / 2,
  },
  photoPinFallback: {
    width: PIN_IMAGE_SIZE,
    height: PIN_IMAGE_SIZE,
    borderRadius: PIN_IMAGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerInitialsTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  photoPinTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  routeOrderCornerBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#059669',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    elevation: 6,
  },
  routeOrderCornerBadgeAlert: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
  routeOrderCornerTxt: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* Floating Route Summary Bar */
  floatingRouteBar: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    backgroundColor: '#1A2D5A',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  floatingRouteTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  floatingRouteSub: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 2,
  },
  floatingNavigateRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  floatingNavigateRouteBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Selected Member Detail Callout Card */
  selectedMemberCard: {
    position: 'absolute',
    bottom: 20,
    left: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  selectedCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  selectedMemberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  selectedMemberAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  selectedMemberAvatarInitials: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  selectedMemberName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  localityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  localityTagTxt: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  distanceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  distanceTagTxt: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
  },
  needsVisitTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  needsVisitTagTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  selectedMemberAddress: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    marginTop: 6,
  },
  selectedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  actionNavigateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2D5A',
    paddingVertical: 9,
    borderRadius: 8,
  },
  actionNavigateBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLogVisitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionLogVisitBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  actionRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionRouteBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  actionRouteBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  actionRouteBtnTxtActive: {
    color: '#FFFFFF',
  },

  /* List View Mode */
  listContent: {
    padding: 14,
    paddingBottom: 30,
  },
  memberListItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  listItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  itemAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemAvatarInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  itemMemberName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemAddressTxt: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 16,
  },
  itemNoAddressTxt: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  listItemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  itemDirectionsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 7,
    borderRadius: 8,
  },
  itemDirectionsBtnTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  itemCallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemLogBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
  },
  itemLogBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  itemRouteBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
  },
  itemRouteBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  itemRouteBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  itemRouteBtnTxtActive: {
    color: '#FFFFFF',
  },
});
