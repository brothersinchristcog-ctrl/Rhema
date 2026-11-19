import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
  StatusBar,
  Linking,
  Alert,
  ScrollView,
  Image,
  FlatList,
  ActivityIndicator,
  PixelRatio,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import * as ExpoLocation from 'expo-location';
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
  Sparkles,
  Check,
  Car,
  Footprints,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Clock,
  Save,
} from 'lucide-react-native';
import {
  CareCell,
  CareCellMembership,
  formatCareCellCode,
  formatCareCellDisplayName,
  MemberVisitResponseStatus,
  VisitRoutePoint,
} from '../../../../types/CareCellTypes';
import { useAdminTheme, createAdminThemedStyles } from '../../../../utils/adminThemeHelper';
import MemberLocationService, {
  TravelMode,
  RoadRouteResult,
  haversineDistanceKm,
} from '../../../../services/MemberLocationService';
import CareCellService, { KNOWN_REGION_COORDS } from '../../../../services/CareCellService';

const { width, height } = Dimensions.get('window');

// Lollipop Marker Pin Dimensions
const PIN_HEAD_SIZE = 42;
const PIN_BORDER_WIDTH = 2.5;
const PIN_IMAGE_SIZE = PIN_HEAD_SIZE - PIN_BORDER_WIDTH * 2;
const PIN_POINTER_W = 14;
const PIN_POINTER_H = 8;
const CHURCH_MARKER_SIZE = 34;

// Default fallback coordinates if no cell & no member coordinates exist
const DEFAULT_KURNOOL_LAT = 15.8281;
const DEFAULT_KURNOOL_LNG = 78.0373;

export type EnrichedCareCellMembership = CareCellMembership & {
  distanceKm?: number;
  profilePhoto?: string;
  locationAccuracy?: string;
  isVerifiedPin?: boolean;
  resolvedAddress?: string;
};

interface CareCellMapModalProps {
  visible: boolean;
  onClose: () => void;
  churchId?: string;
  cell: CareCell;
  members: CareCellMembership[];
  inactiveMembers?: Array<{ memberId: string; missedCount: number; memberName?: string }>;
  onLogFollowup?: (member: CareCellMembership) => void;
  initialPlannedRouteIds?: string[];
  autoSelectRoute?: boolean;
  autoStartNavigation?: boolean;
  headerSubtitleOverride?: string;
  onConfirmRoute?: (stops: VisitRoutePoint[]) => void;
  onSaveVisitRoute?: (stops: any[]) => void;
  visitMemberMeta?: Record<
    string,
    { response?: MemberVisitResponseStatus; preferredTime?: string }
  >;
  visitDefaultTime?: string;
  visitTitle?: string;
}

export default function CareCellMapModal({
  visible,
  onClose,
  churchId,
  cell,
  members,
  inactiveMembers = [],
  onLogFollowup,
  initialPlannedRouteIds,
  autoSelectRoute = false,
  autoStartNavigation = false,
  headerSubtitleOverride,
  onConfirmRoute,
  onSaveVisitRoute,
  visitMemberMeta,
  visitDefaultTime,
  visitTitle,
}: CareCellMapModalProps) {
  const insets = useSafeAreaInsets();
  const { isDark, primaryText, secondaryText, cardSurface, secondarySurface, borderColor } = useAdminTheme();
  const primaryBtnBg = isDark ? '#FFFFFF' : '#0F172A';
  const primaryBtnText = isDark ? '#000000' : '#FFFFFF';
  const secondaryBtnBg = isDark ? '#27272A' : '#F8FAFC';
  const secondaryBtnBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1';
  const secondaryBtnText = isDark ? '#E4E4E7' : '#334155';

  const mapRef = useRef<MapView | null>(null);

  // Top Inset to guarantee zero overlap with status bar / notch
  const topHeaderInset =
    Platform.OS === 'android'
      ? (StatusBar.currentHeight || 28) + 12
      : insets.top + 10;

  // View mode: 'map' or 'list'
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedLocality, setSelectedLocality] = useState<string>('ALL');
  const [filterNeedsVisitOnly, setFilterNeedsVisitOnly] = useState<boolean>(false);
  const [visitResponseFilter, setVisitResponseFilter] = useState<'ACCEPTED_ONLY' | 'NON_DECLINED' | 'ALL'>('NON_DECLINED');

  // Selected member card on map
  const [selectedMember, setSelectedMember] = useState<EnrichedCareCellMembership | null>(null);

  // Route Planning: list of member IDs in visit order + travel mode
  const [plannedRouteMemberIds, setPlannedRouteMemberIds] = useState<string[]>([]);
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');
  const [routeOptimizedFlag, setRouteOptimizedFlag] = useState<boolean>(false);

  // Marker view refresh state so custom views snapshot crisply on Android Fabric
  const [markersRefreshActive, setMarkersRefreshActive] = useState<boolean>(true);
  const [loadedMarkerPhotos, setLoadedMarkerPhotos] = useState<Record<string, boolean>>({});

  // Active In-App Turn-by-Turn Route Navigation state
  const [navActive, setNavActive] = useState<boolean>(false);
  const [navStops, setNavStops] = useState<VisitRoutePoint[]>([]);
  const [navStopIndex, setNavStopIndex] = useState<number>(0);
  const [navLoading, setNavLoading] = useState<boolean>(false);
  const [roadRoute, setRoadRoute] = useState<RoadRouteResult | null>(null);
  const [userNavCoords, setUserNavCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const navLocationSubRef = useRef<ExpoLocation.LocationSubscription | null>(null);

  // Loading & Enriched data state
  const [loadingLocations, setLoadingLocations] = useState<boolean>(true);
  const [rawEnrichedMembers, setRawEnrichedMembers] = useState<EnrichedCareCellMembership[]>([]);
  const [geocodedCellCoords, setGeocodedCellCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Visit response counts when opened from a Care Cell Visit
  const visitResponseStats = useMemo(() => {
    if (!visitMemberMeta) return null;
    let accepted = 0;
    let pending = 0;
    let declined = 0;
    members.forEach((m) => {
      const st = visitMemberMeta[m.memberId]?.response || 'Pending';
      if (st === 'Accepted') accepted += 1;
      else if (st === 'Declined') declined += 1;
      else pending += 1;
    });
    return {
      accepted,
      pending,
      declined,
      nonDeclined: accepted + pending,
      total: members.length,
    };
  }, [visitMemberMeta, members]);

  // Sync planned route IDs & reset navigation cleanly whenever modal opens/closes
  useEffect(() => {
    if (!visible) {
      setNavActive(false);
      setNavStops([]);
      setNavStopIndex(0);
      setRoadRoute(null);
      if (navLocationSubRef.current) {
        navLocationSubRef.current.remove();
        navLocationSubRef.current = null;
      }
      return;
    }
    setSelectedMember(null);
    setSelectedLocality('ALL');
    setFilterNeedsVisitOnly(false);
    setRouteOptimizedFlag(false);
    setNavActive(false);

    const hasAccepted = Boolean(
      visitMemberMeta &&
        members.some((m) => visitMemberMeta[m.memberId]?.response === 'Accepted')
    );
    const defaultRespFilter: 'ACCEPTED_ONLY' | 'NON_DECLINED' | 'ALL' = hasAccepted
      ? 'ACCEPTED_ONLY'
      : 'NON_DECLINED';
    setVisitResponseFilter(defaultRespFilter);

    const eligibleIds = visitMemberMeta
      ? new Set(
          members
            .filter((m) => {
              const st = visitMemberMeta[m.memberId]?.response || 'Pending';
              if (defaultRespFilter === 'ACCEPTED_ONLY') return st === 'Accepted';
              return st !== 'Declined';
            })
            .map((m) => m.memberId)
        )
      : null;

    if (initialPlannedRouteIds && initialPlannedRouteIds.length > 0) {
      const filteredInit = eligibleIds
        ? initialPlannedRouteIds.filter((id) => eligibleIds.has(id))
        : initialPlannedRouteIds;
      setPlannedRouteMemberIds(
        filteredInit.length > 0 ? filteredInit : [...initialPlannedRouteIds]
      );
    } else if (autoSelectRoute && members.length > 0) {
      const autoIds = eligibleIds
        ? members.filter((m) => eligibleIds.has(m.memberId)).map((m) => m.memberId)
        : members.map((m) => m.memberId);
      setPlannedRouteMemberIds(autoIds);
    } else {
      setPlannedRouteMemberIds([]);
    }
  }, [visible, initialPlannedRouteIds, autoSelectRoute, members, visitMemberMeta]);

  // Keep Android custom Marker snapshots crisp
  useEffect(() => {
    if (!visible) return;
    setMarkersRefreshActive(true);
    const t = setTimeout(() => setMarkersRefreshActive(false), 2000);
    return () => clearTimeout(t);
  }, [visible, viewMode, plannedRouteMemberIds, selectedMember, navActive, navStopIndex]);

  // Load live member locations and cell coordinates
  useEffect(() => {
    let isMounted = true;
    async function loadLocations() {
      if (!visible) return;
      setLoadingLocations(true);
      try {
        const activeChurchId = churchId || (await CareCellService.getChurchId());
        const res = await MemberLocationService.resolveCareCellMemberLocations(
          activeChurchId,
          cell,
          members
        );
        if (isMounted) {
          if (res.cellCenter && res.cellCenter.latitude && res.cellCenter.longitude) {
            setGeocodedCellCoords(res.cellCenter);
          }
          setRawEnrichedMembers(res.resolvedMembers as EnrichedCareCellMembership[]);
        }
      } catch (err) {
        console.error('Failed to resolve member locations for map:', err);
        if (isMounted) {
          setRawEnrichedMembers(members as EnrichedCareCellMembership[]);
        }
      } finally {
        if (isMounted) setLoadingLocations(false);
      }
    }

    loadLocations();
    return () => {
      isMounted = false;
    };
  }, [visible, churchId, cell, members]);

  // Enriched members with micro-spread for members sharing identical village coordinates
  const enrichedMembers = useMemo<EnrichedCareCellMembership[]>(() => {
    const rawList = rawEnrichedMembers.map((m) => ({
      ...m,
      isVerifiedPin: m.locationAccuracy === 'verified_home',
      resolvedAddress: m.address || m.locality || '',
    }));

    // Group items sharing identical rounded lat/lng so markers don't overlap
    const coordGroups = new Map<string, number[]>();
    rawList.forEach((item, idx) => {
      if (typeof item.latitude === 'number' && typeof item.longitude === 'number') {
        const key = `${item.latitude.toFixed(4)}_${item.longitude.toFixed(4)}`;
        const arr = coordGroups.get(key) || [];
        arr.push(idx);
        coordGroups.set(key, arr);
      }
    });

    coordGroups.forEach((indices) => {
      if (indices.length <= 1) return;
      indices.forEach((idx, pos) => {
        const item = rawList[idx];
        if (item.isVerifiedPin) return; // Never shift verified home pins
        const angle = (2 * Math.PI * pos) / indices.length;
        const radiusDeg = 0.00065; // ~70m visual offset
        rawList[idx] = {
          ...item,
          latitude: item.latitude! + radiusDeg * Math.cos(angle),
          longitude: item.longitude! + radiusDeg * Math.sin(angle),
        };
      });
    });

    return rawList;
  }, [rawEnrichedMembers]);

  // Inactive Member IDs set for fast lookup
  const inactiveMemberIdSet = useMemo(() => {
    return new Set(inactiveMembers.map((im) => im.memberId));
  }, [inactiveMembers]);

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
    if (visitMemberMeta) {
      if (visitResponseFilter === 'ACCEPTED_ONLY') {
        list = list.filter((m) => visitMemberMeta[m.memberId]?.response === 'Accepted');
      } else if (visitResponseFilter === 'NON_DECLINED') {
        list = list.filter((m) => visitMemberMeta[m.memberId]?.response !== 'Declined');
      }
    }
    if (filterNeedsVisitOnly) {
      list = list.filter((m) => inactiveMemberIdSet.has(m.memberId));
    }
    if (selectedLocality !== 'ALL') {
      list = list.filter((m) => (m.locality || '').trim().toLowerCase() === selectedLocality.toLowerCase());
    }
    return list;
  }, [enrichedMembers, visitMemberMeta, visitResponseFilter, filterNeedsVisitOnly, selectedLocality, inactiveMemberIdSet]);

  // Members with valid GPS coordinates for map plotting
  const membersWithCoords = useMemo(() => {
    return filteredMembers.filter(
      (m) => typeof m.latitude === 'number' && typeof m.longitude === 'number' && !isNaN(m.latitude) && !isNaN(m.longitude)
    );
  }, [filteredMembers]);

  // Center coordinate: Cell Meeting coordinate, resolved cell location, first member pin, or Kurnool fallback
  const centerCoord = useMemo(() => {
    const firstWithCoords = enrichedMembers.find(
      (m) => typeof m.latitude === 'number' && typeof m.longitude === 'number'
    );
    const lat =
      cell.meetingLatitude ||
      geocodedCellCoords?.latitude ||
      firstWithCoords?.latitude ||
      DEFAULT_KURNOOL_LAT;
    const lng =
      cell.meetingLongitude ||
      geocodedCellCoords?.longitude ||
      firstWithCoords?.longitude ||
      DEFAULT_KURNOOL_LNG;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    };
  }, [cell.meetingLatitude, cell.meetingLongitude, geocodedCellCoords, enrichedMembers]);

  // Auto-focus map camera onto cell members (NEVER injecting fallback Kurnool into points!)
  useEffect(() => {
    if (!visible || viewMode !== 'map' || !mapRef.current) return;
    const points: Array<{ latitude: number; longitude: number }> = [];
    const cellLat = cell.meetingLatitude || geocodedCellCoords?.latitude;
    const cellLng = cell.meetingLongitude || geocodedCellCoords?.longitude;
    if (typeof cellLat === 'number' && typeof cellLng === 'number') {
      points.push({ latitude: cellLat, longitude: cellLng });
    }
    membersWithCoords.forEach((m) => {
      if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
        points.push({ latitude: m.latitude, longitude: m.longitude });
      }
    });

    if (points.length === 0) return;
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      if (points.length === 1) {
        mapRef.current.animateToRegion(
          {
            latitude: points[0].latitude,
            longitude: points[0].longitude,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          },
          450
        );
      } else {
        mapRef.current.fitToCoordinates(points, {
          edgePadding: { top: 90, right: 50, bottom: 90, left: 50 },
          animated: true,
        });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [visible, viewMode, cell.meetingLatitude, cell.meetingLongitude, geocodedCellCoords, membersWithCoords]);

  // Helper: Resolve real GPS or cell-center fallback origin for in-app navigation
  const resolveOriginCoords = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      let { status } = await ExpoLocation.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const req = await ExpoLocation.requestForegroundPermissionsAsync();
        status = req.status;
      }
      if (status === 'granted') {
        const current = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });
        if (current?.coords) {
          const c = { latitude: current.coords.latitude, longitude: current.coords.longitude };
          setUserNavCoords(c);
          return c;
        }
      }
    } catch (_) {}
    const cellLat = cell.meetingLatitude || geocodedCellCoords?.latitude;
    const cellLng = cell.meetingLongitude || geocodedCellCoords?.longitude;
    if (typeof cellLat === 'number' && typeof cellLng === 'number') {
      return { latitude: cellLat, longitude: cellLng };
    }
    return null;
  };

  // Turn-by-Turn road directions loader for active in-app trip leg
  const loadRoadLegForNavigation = async (
    stopsList: VisitRoutePoint[],
    fromIdx: number,
    originOverride?: { latitude: number; longitude: number } | null
  ) => {
    if (!stopsList || stopsList.length === 0 || fromIdx >= stopsList.length) return;
    setNavLoading(true);
    try {
      const origin = originOverride || userNavCoords || (await resolveOriginCoords());
      const activeStop = stopsList[fromIdx];
      const waypoints: Array<{ latitude: number; longitude: number; label?: string }> = [];
      if (origin) {
        waypoints.push({ latitude: origin.latitude, longitude: origin.longitude, label: 'Your Location' });
      }
      stopsList.slice(fromIdx).forEach((s) => {
        waypoints.push({ latitude: s.latitude, longitude: s.longitude, label: s.memberName });
      });

      const res = await MemberLocationService.fetchRoadRouteDirections({
        waypoints,
        travelMode,
      });
      setRoadRoute(res);

      if (mapRef.current) {
        const legPts = origin
          ? [origin, { latitude: activeStop.latitude, longitude: activeStop.longitude }]
          : [{ latitude: activeStop.latitude, longitude: activeStop.longitude }];
        setTimeout(() => {
          if (!mapRef.current) return;
          if (legPts.length >= 2) {
            mapRef.current.fitToCoordinates(legPts, {
              edgePadding: { top: 155, right: 55, bottom: 230, left: 55 },
              animated: true,
            });
          } else {
            mapRef.current.animateToRegion(
              {
                latitude: activeStop.latitude,
                longitude: activeStop.longitude,
                latitudeDelta: 0.012,
                longitudeDelta: 0.012,
              },
              450
            );
          }
        }, 120);
      }
    } finally {
      setNavLoading(false);
    }
  };

  // Launch In-App Turn-by-Turn Navigation (User stays inside Rhema!)
  const startInAppNavigation = async (stopsToNavigate: VisitRoutePoint[]) => {
    if (!stopsToNavigate || stopsToNavigate.length === 0) return;
    setViewMode('map');
    setSelectedMember(null);
    setNavStops(stopsToNavigate);
    setNavStopIndex(0);
    setNavActive(true);

    const origin = await resolveOriginCoords();
    await loadRoadLegForNavigation(stopsToNavigate, 0, origin);

    // Live GPS watcher
    try {
      if (navLocationSubRef.current) {
        navLocationSubRef.current.remove();
      }
      const perm = await ExpoLocation.getForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        navLocationSubRef.current = await ExpoLocation.watchPositionAsync(
          {
            accuracy: ExpoLocation.Accuracy.High,
            timeInterval: 3500,
            distanceInterval: 10,
          },
          (loc) => {
            if (loc?.coords) {
              setUserNavCoords({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              });
            }
          }
        );
      }
    } catch (_) {}
  };

  const stopInAppNavigation = () => {
    setNavActive(false);
    setNavStops([]);
    setNavStopIndex(0);
    setRoadRoute(null);
    if (navLocationSubRef.current) {
      navLocationSubRef.current.remove();
      navLocationSubRef.current = null;
    }
  };

  const handleAdvanceNavStop = async (delta: -1 | 1) => {
    const nextIdx = navStopIndex + delta;
    if (nextIdx >= navStops.length) {
      stopInAppNavigation();
      Alert.alert(
        'Visit Route Completed',
        `Completed all ${navStops.length} pastoral home visits in this route.`
      );
      return;
    }
    if (nextIdx < 0) return;
    setNavStopIndex(nextIdx);
    await loadRoadLegForNavigation(navStops, nextIdx);
  };

  const handleRecenterNavCamera = () => {
    if (!mapRef.current) return;
    const activeStop = navStops[navStopIndex];
    if (!activeStop) return;
    if (userNavCoords) {
      mapRef.current.fitToCoordinates(
        [userNavCoords, { latitude: activeStop.latitude, longitude: activeStop.longitude }],
        {
          edgePadding: { top: 155, right: 55, bottom: 230, left: 55 },
          animated: true,
        }
      );
    } else {
      mapRef.current.animateToRegion(
        {
          latitude: activeStop.latitude,
          longitude: activeStop.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        400
      );
    }
  };

  // In-App Navigation to a single member
  const handleNavigateToMember = (m: CareCellMembership) => {
    if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
      const singleStop: VisitRoutePoint = {
        memberId: m.memberId,
        memberName: m.memberName,
        memberPhone: m.memberPhone,
        address: (m as EnrichedCareCellMembership).resolvedAddress || m.address || m.locality || '',
        locality: m.locality || m.city || cell?.location || '',
        latitude: m.latitude,
        longitude: m.longitude,
        order: 1,
        accuracy: (m as EnrichedCareCellMembership).isVerifiedPin ? 'verified_home' : 'village_approximate',
        distanceFromPreviousKm: 0,
        isApproximateDistance: !(m as EnrichedCareCellMembership).isVerifiedPin,
        consent: Boolean((m as EnrichedCareCellMembership).isVerifiedPin),
      };
      startInAppNavigation([singleStop]);
    } else {
      Alert.alert(
        'Location Pending',
        'This member does not have resolved GPS coordinates yet. Please make sure their village, city, or address is saved in their profile.'
      );
    }
  };

  // Phone Call
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

  // WhatsApp
  const handleWhatsApp = (phone?: string, name?: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No phone number available for WhatsApp.');
      return;
    }
    const clean = phone.replace(/[^0-9]/g, '');
    const text = encodeURIComponent(`Praise the Lord ${name || 'Brother/Sister'}! Grace and peace to you from our Rhema Care Cell.`);
    Linking.openURL(`whatsapp://send?phone=${clean}&text=${text}`).catch(() => {
      Alert.alert('WhatsApp Required', 'WhatsApp is not installed on this device.');
    });
  };

  // Toggle member into planned route
  const handleToggleRouteMember = (memberId: string) => {
    setRouteOptimizedFlag(false);
    setPlannedRouteMemberIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      } else {
        return [...prev, memberId];
      }
    });
  };

  // Ordered stops derived from plannedRouteMemberIds + enriched coordinates
  const plannedStops = useMemo<VisitRoutePoint[]>(() => {
    if (plannedRouteMemberIds.length === 0) return [];
    const stops: VisitRoutePoint[] = [];
    let prevLat: number | undefined;
    let prevLng: number | undefined;

    plannedRouteMemberIds.forEach((id) => {
      const m = enrichedMembers.find((em) => em.memberId === id);
      if (!m || typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return;

      let dist = 0;
      if (typeof prevLat === 'number' && typeof prevLng === 'number') {
        dist = haversineDistanceKm(
          { latitude: prevLat, longitude: prevLng },
          { latitude: m.latitude, longitude: m.longitude }
        );
      }

      const meta = visitMemberMeta?.[m.memberId];
      stops.push({
        memberId: m.memberId,
        memberName: m.memberName,
        memberPhone: m.memberPhone,
        address: m.resolvedAddress || m.address || m.locality || '',
        locality: m.locality || cell?.location || '',
        latitude: m.latitude,
        longitude: m.longitude,
        order: stops.length + 1,
        accuracy: m.isVerifiedPin ? 'verified_home' : 'village_approximate',
        distanceFromPreviousKm: dist,
        isApproximateDistance: !m.isVerifiedPin,
        consent: Boolean(m.isVerifiedPin),
        preferredTime: meta?.preferredTime,
        responseStatus: meta?.response,
      });
      prevLat = m.latitude;
      prevLng = m.longitude;
    });

    return stops;
  }, [plannedRouteMemberIds, enrichedMembers, cell?.location, visitMemberMeta]);

  const plannedTotalKm = useMemo(
    () => MemberLocationService.computeRouteDistanceKm(plannedStops),
    [plannedStops]
  );

  // Auto-launch in-app navigation if requested by caller (e.g. In-App Directions from Visits Tab)
  useEffect(() => {
    if (!visible || !autoStartNavigation || navActive) return;
    if (plannedStops.length > 0) {
      startInAppNavigation(plannedStops);
    }
  }, [visible, autoStartNavigation, plannedStops.length, navActive]);

  // Route optimization helper: Nearest Neighbor TSP
  const handleOptimizeRoute = () => {
    const candidateIds =
      plannedRouteMemberIds.length > 0
        ? [...plannedRouteMemberIds]
        : filteredMembers
            .filter((m) => typeof m.latitude === 'number' && typeof m.longitude === 'number')
            .map((m) => m.memberId);

    if (candidateIds.length < 2) {
      Alert.alert('Route Planning', 'Select at least 2 members with coordinates to optimize visit route.');
      return;
    }

    const cellLat = cell.meetingLatitude || geocodedCellCoords?.latitude || DEFAULT_KURNOOL_LAT;
    const cellLng = cell.meetingLongitude || geocodedCellCoords?.longitude || DEFAULT_KURNOOL_LNG;

    const remaining = [...candidateIds];
    const optimized: string[] = [];
    let currentPos = { latitude: cellLat, longitude: cellLng };

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const mem = enrichedMembers.find((m) => m.memberId === remaining[i]);
        if (mem && typeof mem.latitude === 'number' && typeof mem.longitude === 'number') {
          const d = haversineDistanceKm(currentPos, { latitude: mem.latitude, longitude: mem.longitude });
          if (d < nearestDist) {
            nearestDist = d;
            nearestIdx = i;
          }
        }
      }
      const chosenId = remaining.splice(nearestIdx, 1)[0];
      optimized.push(chosenId);
      const chosenMem = enrichedMembers.find((m) => m.memberId === chosenId);
      if (chosenMem && typeof chosenMem.latitude === 'number' && typeof chosenMem.longitude === 'number') {
        currentPos = { latitude: chosenMem.latitude, longitude: chosenMem.longitude };
      }
    }

    setPlannedRouteMemberIds(optimized);
    setRouteOptimizedFlag(true);
  };

  // Launch In-App Multi-Stop Navigation
  const handleOpenMultiStopRoute = async () => {
    if (plannedRouteMemberIds.length === 0) return;
    if (plannedStops.length > 0) {
      await startInAppNavigation(plannedStops);
      return;
    }
    const firstFallback = plannedRouteMemberIds
      .map((id) => enrichedMembers.find((m) => m.memberId === id))
      .find(Boolean);
    if (firstFallback) {
      handleNavigateToMember(firstFallback);
      return;
    }
    Alert.alert('Missing Coordinates', 'The selected members for the visit route do not have GPS coordinates.');
  };

  const handleConfirmAndSaveRoute = () => {
    const handler = onConfirmRoute || onSaveVisitRoute;
    if (!handler) return;
    if (plannedStops.length === 0) {
      Alert.alert(
        'No Route Stops',
        'Select at least one member with a location or tap Optimize to generate a route.'
      );
      return;
    }
    handler(plannedStops);
    Alert.alert('Route Saved', 'Pastoral visit route stops saved successfully.');
    if (onConfirmRoute) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FAF7F2' }]}>
        {/* Top Header Bar */}
        <View style={[styles.header, { paddingTop: topHeaderInset, backgroundColor: isDark ? '#121212' : '#FFFFFF', borderBottomColor: borderColor }]}>
          <TouchableOpacity style={styles.circularBackBtn} onPress={onClose} activeOpacity={0.8}>
            <ArrowLeft size={20} color={primaryText} strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
              {formatCareCellDisplayName(cell.name, cell.cellCode)}
            </Text>
            <Text style={[styles.headerSub, { color: secondaryText }]} numberOfLines={1}>
              {headerSubtitleOverride ||
                `${formatCareCellCode(cell.cellCode)} · ${cell.location || 'Care Cell'} · ${members.length} Members`}
            </Text>
          </View>
          <View style={styles.viewModeToggleRow}>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                viewMode === 'map'
                  ? { backgroundColor: primaryBtnBg }
                  : { backgroundColor: secondaryBtnBg },
              ]}
              onPress={() => setViewMode('map')}
            >
              <MapIcon size={14} color={viewMode === 'map' ? primaryBtnText : secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                viewMode === 'list'
                  ? { backgroundColor: primaryBtnBg }
                  : { backgroundColor: secondaryBtnBg },
              ]}
              onPress={() => setViewMode('list')}
            >
              <List size={14} color={viewMode === 'list' ? primaryBtnText : secondaryText} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Pills Bar */}
        <View style={[styles.filterBar, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderBottomColor: borderColor }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                selectedLocality === 'ALL' && !filterNeedsVisitOnly
                  ? {
                      backgroundColor: primaryBtnBg,
                      borderColor: primaryBtnBg,
                    }
                  : {
                      backgroundColor: secondaryBtnBg,
                      borderColor: secondaryBtnBorder,
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
                  {
                    color: selectedLocality === 'ALL' && !filterNeedsVisitOnly ? primaryBtnText : secondaryBtnText,
                    fontWeight: '700',
                  },
                ]}
              >
                All Members ({members.length})
              </Text>
            </TouchableOpacity>

            {inactiveMembers.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  filterNeedsVisitOnly && styles.filterPillAlertActive,
                ]}
                onPress={() => setFilterNeedsVisitOnly(!filterNeedsVisitOnly)}
              >
                <AlertTriangle
                  size={12}
                  color={filterNeedsVisitOnly ? '#FFFFFF' : '#DC2626'}
                  style={{ marginRight: 4 }}
                />
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
                    isSelected
                      ? {
                          backgroundColor: primaryBtnBg,
                          borderColor: primaryBtnBg,
                        }
                      : {
                          backgroundColor: secondaryBtnBg,
                          borderColor: secondaryBtnBorder,
                        },
                  ]}
                  onPress={() => {
                    setFilterNeedsVisitOnly(false);
                    setSelectedLocality(isSelected ? 'ALL' : loc);
                  }}
                >
                  <MapPin size={11} color={isSelected ? primaryBtnText : secondaryText} style={{ marginRight: 4 }} />
                  <Text style={[styles.filterPillTxt, { color: isSelected ? primaryBtnText : secondaryBtnText, fontWeight: '700' }]}>
                    {loc}
                  </Text>
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
              initialRegion={centerCoord}
              showsUserLocation={true}
              showsMyLocationButton={true}
              showsCompass={true}
            >
              {/* Care Cell Meeting Marker: Amber Church Bubble */}
              {(cell.meetingLatitude && cell.meetingLongitude) || geocodedCellCoords ? (
                <Marker
                  coordinate={{
                    latitude: cell.meetingLatitude || geocodedCellCoords!.latitude,
                    longitude: cell.meetingLongitude || geocodedCellCoords!.longitude,
                  }}
                  title={formatCareCellDisplayName(cell.name, cell.cellCode)}
                  description={`Care Cell Center: ${cell.meetingLocation || cell.location || 'Local'}`}
                  pinColor="#D97706"
                >
                  <View collapsable={false} style={styles.churchMarkerBubble}>
                    <Users size={16} color="#FFFFFF" />
                  </View>
                </Marker>
              ) : null}

              {/* Member Residence Lollipop Profile Photo Markers */}
              {membersWithCoords.map((m) => {
                const isInactive = inactiveMemberIdSet.has(m.memberId);
                const isSelected = selectedMember?.memberId === m.memberId;
                const inRouteIndex = plannedRouteMemberIds.indexOf(m.memberId);
                const markerKey = m.id || m.memberId;
                const photoUri = typeof m.memberPhoto === 'string' ? m.memberPhoto.trim() : '';
                const hasPhoto = photoUri.length > 0;
                const accentColor = isSelected
                  ? '#D97706'
                  : inRouteIndex >= 0
                    ? '#059669'
                    : isInactive
                      ? '#DC2626'
                      : (isDark ? '#E4E4E7' : '#0F172A');

                return (
                  <Marker
                    key={markerKey}
                    coordinate={{
                      latitude: m.latitude!,
                      longitude: m.longitude!,
                    }}
                    anchor={{ x: 0.5, y: 1.0 }}
                    tracksViewChanges={Boolean(
                      (hasPhoto && !loadedMarkerPhotos[markerKey]) ||
                        isSelected ||
                        markersRefreshActive
                    )}
                    onPress={() => setSelectedMember(m)}
                  >
                    <View
                      collapsable={false}
                      style={[styles.photoPinWrapper, isSelected && styles.photoPinWrapperSelected]}
                    >
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
                              setTimeout(() => {
                                setLoadedMarkerPhotos((prev) =>
                                  prev[markerKey] ? prev : { ...prev, [markerKey]: true }
                                );
                              }, 300);
                            }}
                            onError={() => {
                              setLoadedMarkerPhotos((prev) =>
                                prev[markerKey] ? prev : { ...prev, [markerKey]: true }
                              );
                            }}
                          />
                        ) : (
                          <Text style={styles.markerInitialsTxt}>
                            {(m.memberName || 'M').slice(0, 2).toUpperCase()}
                          </Text>
                        )}
                      </View>

                      {/* Route Order Badge */}
                      {inRouteIndex >= 0 ? (
                        <View style={styles.routeOrderCornerBadge}>
                          <Text style={styles.routeOrderCornerTxt}>{inRouteIndex + 1}</Text>
                        </View>
                      ) : null}

                      {/* Lollipop Needle Pointer SVG */}
                      <Svg
                        width={PIN_POINTER_W}
                        height={PIN_POINTER_H}
                        viewBox={`0 0 ${PIN_POINTER_W} ${PIN_POINTER_H}`}
                        style={styles.photoPinPointerSvg}
                      >
                        <Path
                          d={`M0 0 L${PIN_POINTER_W / 2} ${PIN_POINTER_H} L${PIN_POINTER_W} 0 Z`}
                          fill={accentColor}
                        />
                      </Svg>
                    </View>
                  </Marker>
                );
              })}

              {/* Planned Route Line connecting consecutive stops */}
              {!navActive && plannedStops.length >= 2 && (
                <Polyline
                  coordinates={plannedStops.map((s) => ({
                    latitude: s.latitude,
                    longitude: s.longitude,
                  }))}
                  strokeColor="#059669"
                  strokeWidth={3.5}
                  lineDashPattern={[8, 5]}
                />
              )}

              {/* Active In-App Road Navigation Route Polyline */}
              {navActive && roadRoute && roadRoute.coordinates.length >= 2 && (
                <>
                  <Polyline
                    coordinates={roadRoute.coordinates}
                    strokeColor="#FFFFFF"
                    strokeWidth={8}
                  />
                  <Polyline
                    coordinates={roadRoute.coordinates}
                    strokeColor="#2563EB"
                    strokeWidth={5}
                  />
                </>
              )}
            </MapView>

            {/* Active In-App Turn-by-Turn Navigation HUD (Top Banner + Bottom Trip Card) */}
            {navActive && navStops[navStopIndex] ? (
              <>
                {(() => {
                  const currentStop = navStops[navStopIndex];
                  const activeLeg = roadRoute?.legs?.[0];
                  const firstStep = activeLeg?.steps?.[0];
                  const liveDistKm = userNavCoords
                    ? haversineDistanceKm(userNavCoords, {
                        latitude: currentStop.latitude,
                        longitude: currentStop.longitude,
                      })
                    : undefined;
                  const distMeters = activeLeg?.distanceMeters ?? Math.round((liveDistKm ?? 0) * 1000);
                  const distLabel =
                    distMeters >= 1000
                      ? `${(distMeters / 1000).toFixed(1)} km`
                      : `${Math.max(10, distMeters)} m`;
                  const etaMins = activeLeg?.durationSeconds
                    ? Math.max(1, Math.round(activeLeg.durationSeconds / 60))
                    : Math.max(1, Math.round(((liveDistKm ?? 0.5) / (travelMode === 'walking' ? 4.8 : 28)) * 60));

                  return (
                    <>
                      {/* Top Turn-by-Turn Maneuver HUD */}
                      <View style={[styles.navTopHud, { top: 12 }]}>
                        <View style={styles.navTopHudMain}>
                          <View style={styles.navManeuverIconBox}>
                            {navLoading ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Navigation size={18} color="#FFFFFF" />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.navInstructionTxt} numberOfLines={2}>
                              {firstStep?.instruction || `Navigate toward ${currentStop.memberName}`}
                            </Text>
                            <Text style={styles.navMetricsSub} numberOfLines={1}>
                              {distLabel} · ~{etaMins} min ({travelMode === 'walking' ? 'Walking' : 'Driving'})
                              {roadRoute?.isRoadRoute === false ? ' · Direct Route' : ''}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.navHudCloseBtn}
                            onPress={stopInAppNavigation}
                            activeOpacity={0.8}
                          >
                            <X size={16} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Bottom In-App Trip Stop Card */}
                      <View style={[styles.navBottomCard, { backgroundColor: cardSurface, borderColor }]}>
                        <View style={styles.navBottomHeader}>
                          <View style={styles.navStopNumberPill}>
                            <Text style={styles.navStopNumberTxt}>
                              Stop {navStopIndex + 1} of {navStops.length}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.navExternalGmapsBtn,
                              {
                                backgroundColor: secondaryBtnBg,
                                borderColor: secondaryBtnBorder,
                                borderWidth: 1,
                              },
                            ]}
                            onPress={handleRecenterNavCamera}
                            activeOpacity={0.8}
                          >
                            <Navigation size={12} color={secondaryBtnText} style={{ marginRight: 4 }} />
                            <Text style={[styles.navExternalGmapsTxt, { color: secondaryBtnText }]}>Recenter View</Text>
                          </TouchableOpacity>
                        </View>

                        <Text style={[styles.navStopMemberName, { color: primaryText }]} numberOfLines={1}>
                          {currentStop.memberName}
                        </Text>
                        <Text style={[styles.navStopAddress, { color: secondaryText }]} numberOfLines={2}>
                          {currentStop.address || currentStop.locality || 'Care Cell Member Residence'}
                        </Text>

                        <View style={styles.navControlsRow}>
                          <TouchableOpacity
                            style={[styles.navIconCircleBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                            onPress={handleRecenterNavCamera}
                            activeOpacity={0.8}
                          >
                            <Crosshair size={16} color={primaryText} />
                          </TouchableOpacity>

                          {currentStop.memberPhone ? (
                            <>
                              <TouchableOpacity
                                style={[styles.navIconCircleBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                                onPress={() => handleCall(currentStop.memberPhone)}
                                activeOpacity={0.8}
                              >
                                <Phone size={15} color={primaryText} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.navIconCircleBtn, { backgroundColor: '#25D366', borderColor: '#25D366' }]}
                                onPress={() => handleWhatsApp(currentStop.memberPhone, currentStop.memberName)}
                                activeOpacity={0.8}
                              >
                                <MessageCircle size={15} color="#FFFFFF" />
                              </TouchableOpacity>
                            </>
                          ) : null}

                          {navStopIndex > 0 && (
                            <TouchableOpacity
                              style={[styles.navPrevBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                              onPress={() => handleAdvanceNavStop(-1)}
                              activeOpacity={0.8}
                            >
                              <ChevronLeft size={15} color={secondaryBtnText} />
                              <Text style={[styles.navPrevBtnTxt, { color: secondaryBtnText }]}>Prev</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={[styles.navNextPrimaryBtn, { backgroundColor: primaryBtnBg }]}
                            onPress={() => handleAdvanceNavStop(1)}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.navNextPrimaryTxt, { color: primaryBtnText }]}>
                              {navStopIndex + 1 < navStops.length ? 'Arrived · Next Stop' : 'Complete Route'}
                            </Text>
                            {navStopIndex + 1 < navStops.length ? (
                              <ChevronRight size={15} color={primaryBtnText} style={{ marginLeft: 3 }} />
                            ) : (
                              <Check size={15} color={primaryBtnText} strokeWidth={2.5} style={{ marginLeft: 4 }} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  );
                })()}
              </>
            ) : plannedRouteMemberIds.length > 0 ? (
              /* Floating Top Route Summary Bar */
              <View style={[styles.floatingRouteBar, { backgroundColor: isDark ? '#18181B' : '#0F172A' }]}>
                <View style={styles.floatingRouteHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.floatingRouteTitle}>
                      {plannedRouteMemberIds.length} House Visit{plannedRouteMemberIds.length === 1 ? '' : 's'} Planned
                    </Text>
                    <Text style={styles.floatingRouteSub} numberOfLines={1}>
                      {plannedStops.length > 0
                        ? `${plannedStops.length} mapped · ~${plannedTotalKm} km${routeOptimizedFlag ? ' · Optimized' : ''}`
                        : 'Resolving coordinates...'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.travelModeChip}
                    onPress={() => setTravelMode((m) => (m === 'driving' ? 'walking' : 'driving'))}
                    activeOpacity={0.8}
                  >
                    {travelMode === 'driving' ? (
                      <Car size={12} color="#E2E8F0" />
                    ) : (
                      <Footprints size={12} color="#E2E8F0" />
                    )}
                    <Text style={styles.travelModeChipTxt}>
                      {travelMode === 'driving' ? 'Drive' : 'Walk'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.floatingRouteActionsRow}>
                  {plannedStops.length >= 2 && (
                    <TouchableOpacity
                      style={styles.floatingOptimizeBtn}
                      onPress={handleOptimizeRoute}
                      activeOpacity={0.85}
                    >
                      <Sparkles size={13} color={isDark ? '#FFFFFF' : '#0F172A'} style={{ marginRight: 5 }} />
                      <Text style={styles.floatingOptimizeBtnTxt}>Optimize</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.floatingNavigateRouteBtn}
                    onPress={handleOpenMultiStopRoute}
                    activeOpacity={0.85}
                  >
                    <Navigation size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                    <Text style={styles.floatingNavigateRouteBtnTxt}>Start Route</Text>
                  </TouchableOpacity>

                  {(onConfirmRoute || onSaveVisitRoute) && (
                    <TouchableOpacity
                      style={styles.floatingApplyRouteBtn}
                      onPress={handleConfirmAndSaveRoute}
                      activeOpacity={0.85}
                    >
                      <Check size={13} color="#065F46" strokeWidth={2.5} style={{ marginRight: 4 }} />
                      <Text style={styles.floatingApplyRouteBtnTxt}>Save Route</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : filteredMembers.length > 0 ? (
              <View style={styles.floatingQuickOptimizeWrap}>
                <TouchableOpacity
                  style={[styles.floatingQuickOptimizePill, { backgroundColor: isDark ? '#2563EB' : '#1E3A8A' }]}
                  onPress={handleOptimizeRoute}
                  activeOpacity={0.85}
                >
                  <Sparkles size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.floatingQuickOptimizeTxt}>
                    Plan & Optimize Visit Route ({filteredMembers.length})
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Selected Member Detail Callout Card */}
            {!navActive && selectedMember ? (
              <View style={[styles.selectedMemberCard, { backgroundColor: cardSurface, borderColor }]}>
                <View style={styles.selectedCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                    {selectedMember.memberPhoto ? (
                      <Image source={{ uri: selectedMember.memberPhoto }} style={styles.selectedMemberAvatar} />
                    ) : (
                      <View style={[styles.selectedMemberAvatarFallback, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' }]}>
                        <Text style={[styles.selectedMemberAvatarInitials, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                          {(selectedMember.memberName || 'M').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.selectedMemberName, { color: primaryText }]} numberOfLines={1}>
                        {selectedMember.memberName}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                        {selectedMember.locality ? (
                          <View style={styles.localityTag}>
                            <MapPin size={10} color="#1E3A8A" />
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
                    <X size={18} color={secondaryText} />
                  </TouchableOpacity>
                </View>

                {selectedMember.address ? (
                  <Text style={[styles.selectedMemberAddress, { color: secondaryText }]} numberOfLines={2}>
                    {selectedMember.isVerifiedPin ? '📍 Exact Home: ' : ''}
                    {selectedMember.address}
                  </Text>
                ) : (
                  <Text style={[styles.selectedMemberNoAddress, { color: secondaryText }]}>
                    No residential address on file
                  </Text>
                )}

                {/* Card Action Buttons: Directions, Call, WhatsApp, + Route */}
                <View style={styles.selectedCardActionsRow}>
                  <TouchableOpacity
                    style={[styles.actionDirectionsBtn, { backgroundColor: isDark ? '#2563EB' : '#1E3A8A' }]}
                    onPress={() => handleNavigateToMember(selectedMember)}
                  >
                    <Navigation size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.actionDirectionsBtnTxt}>Directions</Text>
                  </TouchableOpacity>

                  {selectedMember.memberPhone ? (
                    <>
                      <TouchableOpacity
                        style={[styles.actionCallBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                        onPress={() => handleCall(selectedMember.memberPhone)}
                      >
                        <Phone size={13} color={primaryText} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionCallBtn, { backgroundColor: '#25D366', borderColor: '#25D366' }]}
                        onPress={() => handleWhatsApp(selectedMember.memberPhone, selectedMember.memberName)}
                      >
                        <MessageCircle size={13} color="#FFFFFF" />
                      </TouchableOpacity>
                    </>
                  ) : null}

                  {onLogFollowup && (
                    <TouchableOpacity
                      style={[styles.actionLogVisitBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                      onPress={() => onLogFollowup(selectedMember)}
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
          /* List View Mode with Complete Planning Toolbar */
          <View style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#FAF7F2' }}>
            <View style={[styles.listRouteToolbar, { backgroundColor: cardSurface, borderColor }]}>
              <TouchableOpacity
                style={[styles.listOptimizeBtn, { backgroundColor: isDark ? '#2563EB' : '#1E3A8A' }]}
                onPress={handleOptimizeRoute}
                activeOpacity={0.85}
              >
                <Sparkles size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.listOptimizeBtnTxt}>
                  {plannedRouteMemberIds.length > 0
                    ? `Optimize (${plannedStops.length} stops · ~${plannedTotalKm} km)`
                    : `Plan & Optimize Route (${filteredMembers.length})`}
                </Text>
              </TouchableOpacity>

              {plannedRouteMemberIds.length > 0 && (
                <TouchableOpacity
                  style={[styles.listStartRouteBtn, { backgroundColor: '#059669' }]}
                  onPress={handleOpenMultiStopRoute}
                  activeOpacity={0.85}
                >
                  <Navigation size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.listStartRouteBtnTxt}>Start</Text>
                </TouchableOpacity>
              )}

              {(onConfirmRoute || onSaveVisitRoute) && plannedStops.length > 0 && (
                <TouchableOpacity
                  style={[styles.listSaveRouteBtn, { backgroundColor: '#D97706' }]}
                  onPress={handleConfirmAndSaveRoute}
                  activeOpacity={0.85}
                >
                  <Check size={13} color="#FFFFFF" strokeWidth={2.5} style={{ marginRight: 4 }} />
                  <Text style={styles.listSaveRouteBtnTxt}>Save</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filteredMembers}
              keyExtractor={(item) => item.id || item.memberId}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isInactive = inactiveMemberIdSet.has(item.memberId);
                const inRoute = plannedRouteMemberIds.includes(item.memberId);
                const inRouteIndex = plannedRouteMemberIds.indexOf(item.memberId);

                return (
                  <View style={[styles.memberListItem, { backgroundColor: cardSurface, borderColor }]}>
                    <View style={styles.listItemTopRow}>
                      {item.memberPhoto ? (
                        <Image source={{ uri: item.memberPhoto }} style={styles.itemAvatarImg} />
                      ) : (
                        <View style={[styles.itemAvatarFallback, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' }]}>
                          <Text style={[styles.itemAvatarInitials, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                            {item.memberName.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemMemberName, { color: primaryText }]}>{item.memberName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                          {item.locality ? (
                            <View style={[styles.localityTag, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
                              <MapPin size={10} color={isDark ? '#E4E4E7' : '#475569'} />
                              <Text style={[styles.localityTagTxt, { color: isDark ? '#E4E4E7' : '#334155' }]}>{item.locality}</Text>
                            </View>
                          ) : null}
                          {item.distanceKm != null ? (
                            <View style={[styles.distanceTag, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5', borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#A7F3D0', borderWidth: 1 }]}>
                              <Compass size={10} color={isDark ? '#34D399' : '#059669'} />
                              <Text style={[styles.distanceTagTxt, { color: isDark ? '#34D399' : '#059669' }]}>{item.distanceKm} km away</Text>
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
                      <Text style={[styles.itemAddressTxt, { color: secondaryText }]} numberOfLines={2}>
                        {item.isVerifiedPin ? '📍 Exact Home: ' : ''}
                        {item.address}
                      </Text>
                    ) : (
                      <Text style={[styles.itemNoAddressTxt, { color: secondaryText }]}>
                        No residential address on file
                      </Text>
                    )}

                    <View style={styles.listItemActionsRow}>
                      <TouchableOpacity
                        style={[styles.itemDirectionsBtn, { backgroundColor: primaryBtnBg }]}
                        onPress={() => handleNavigateToMember(item)}
                      >
                        <Navigation size={13} color={primaryBtnText} style={{ marginRight: 4 }} />
                        <Text style={[styles.itemDirectionsBtnTxt, { color: primaryBtnText }]}>Directions</Text>
                      </TouchableOpacity>

                      {item.memberPhone ? (
                        <>
                          <TouchableOpacity
                            style={[styles.itemCallBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                            onPress={() => handleCall(item.memberPhone)}
                          >
                            <Phone size={13} color={primaryText} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.itemCallBtn, { backgroundColor: '#25D366', borderColor: '#25D366' }]}
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
                        <Text
                          style={[
                            styles.itemRouteBtnTxt,
                            { color: secondaryBtnText },
                            inRoute && styles.itemRouteBtnTxtActive,
                          ]}
                        >
                          {inRoute ? `#${inRouteIndex + 1} In Route` : '+ Route'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.listEmptyWrap}>
                  <Users size={36} color="#94A3B8" />
                  <Text style={[styles.listEmptyTxt, { color: secondaryText }]}>No members match current filter.</Text>
                </View>
              }
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = createAdminThemedStyles({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  circularBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  viewModeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  modeToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },

  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 6,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: 'transparent',
  },
  filterPillAlertActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  filterPillTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },

  mapContainer: {
    flex: 1,
    position: 'relative',
  },

  /* Church Center Marker */
  churchMarkerBubble: {
    width: CHURCH_MARKER_SIZE,
    height: CHURCH_MARKER_SIZE,
    borderRadius: CHURCH_MARKER_SIZE / 2,
    backgroundColor: '#D97706',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  /* Lollipop Marker Styles */
  photoPinWrapper: {
    width: PIN_HEAD_SIZE + 10,
    height: PIN_HEAD_SIZE + PIN_POINTER_H + 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
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
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.5,
    elevation: 5,
  },
  photoPinImage: {
    width: '100%',
    height: '100%',
    borderRadius: PIN_HEAD_SIZE / 2,
    resizeMode: 'cover',
  },
  markerInitialsTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  routeOrderCornerBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#059669',
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  routeOrderCornerTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  photoPinPointerSvg: {
    marginTop: -1,
  },

  /* Top Route Planning Floating Bar */
  floatingRouteBar: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 20,
  },
  floatingRouteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  floatingRouteTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  floatingRouteSub: {
    fontSize: 11,
    color: '#93C5FD',
    marginTop: 1,
  },
  travelModeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  travelModeChipTxt: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  floatingRouteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  floatingOptimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  floatingOptimizeBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  floatingNavigateRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  floatingNavigateRouteBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  floatingApplyRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  floatingApplyRouteBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },

  floatingQuickOptimizeWrap: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    alignItems: 'center',
    zIndex: 15,
  },
  floatingQuickOptimizePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingQuickOptimizeTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* Selected Member Detail Callout Card */
  selectedMemberCard: {
    position: 'absolute',
    bottom: 20,
    left: 14,
    right: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 25,
  },
  selectedCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  selectedMemberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  selectedMemberAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedMemberAvatarInitials: {
    fontSize: 13,
    fontWeight: '800',
  },
  selectedMemberName: {
    fontSize: 14,
    fontWeight: '800',
  },
  localityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 3,
  },
  localityTagTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  distanceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 3,
  },
  distanceTagTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  needsVisitTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  needsVisitTagTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  selectedMemberAddress: {
    fontSize: 11.5,
    marginTop: 6,
    lineHeight: 16,
  },
  selectedMemberNoAddress: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
  },
  selectedCardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  actionDirectionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionDirectionsBtnTxt: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionCallBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLogVisitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionLogVisitBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  actionRouteBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  actionRouteBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionRouteBtnTxtActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* In-App Turn-by-Turn Navigation Styles */
  navTopHud: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 30,
  },
  navTopHudMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navManeuverIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navInstructionTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  navMetricsSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  navHudCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  navBottomCard: {
    position: 'absolute',
    bottom: 20,
    left: 14,
    right: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 30,
  },
  navBottomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  navStopNumberPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  navStopNumberTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  navExternalGmapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navExternalGmapsTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  navStopMemberName: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  navStopAddress: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  navControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  navIconCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPrevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  navPrevBtnTxt: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  navNextPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  navNextPrimaryTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* List View Styles */
  listRouteToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  listOptimizeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  listOptimizeBtnTxt: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  listStartRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
  },
  listStartRouteBtnTxt: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  listSaveRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  listSaveRouteBtnTxt: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  listContent: {
    padding: 14,
    gap: 10,
  },
  memberListItem: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  listItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  itemAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemAvatarInitials: {
    fontSize: 13,
    fontWeight: '800',
  },
  itemMemberName: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  itemAddressTxt: {
    fontSize: 11.5,
    marginTop: 6,
    lineHeight: 16,
  },
  itemNoAddressTxt: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
  },
  listItemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  itemDirectionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  itemDirectionsBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  itemCallBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLogBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemLogBtnTxt: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  itemRouteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  itemRouteBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  itemRouteBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemRouteBtnTxtActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  listEmptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 8,
  },
  listEmptyTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
});
