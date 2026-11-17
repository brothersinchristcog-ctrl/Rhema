import firestore from '@react-native-firebase/firestore';
import { Linking, Platform } from 'react-native';
import { KNOWN_REGION_COORDS, calculateDistanceKm } from './CareCellService';
import { CareCell, CareCellMembership } from '../types/CareCellTypes';

export type LocationAccuracyType =
  | 'verified_home' // Exact pin confirmed by member with consent
  | 'village_approximate' // Resolved to village / locality
  | 'city_approximate' // Resolved to city / district center
  | 'unverified'; // Could not be resolved confidently

export type VisitStatusBadge =
  | 'no_pending' // Green: No pending visits
  | 'scheduled' // Blue: Scheduled visit
  | 'awaiting_confirm' // Orange: Awaiting member confirmation
  | 'followup_required'; // Red: Missed/needs immediate pastoral follow-up

export interface MemberLocationData {
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string;
  resolvedVillage?: string;
  resolvedCity?: string;
  resolvedDistrict?: string;
  resolvedState?: string;
  locationAccuracy: LocationAccuracyType;
  locationSource: 'profile_geocoding' | 'member_confirmed_pin';
  geocodingStatus: 'completed' | 'pending' | 'failed' | 'needs_review';
  addressHash: string;
  locationSharingConsent?: boolean;
  landmark?: string;
  geocodedAt?: string;
  updatedAt?: any;
}

export interface MemberLocationRecord {
  memberId: string;
  memberName: string;
  memberCode: string; // e.g. "Rhema-001"
  phone: string;
  profilePhoto?: string;
  village: string;
  city: string;
  district: string;
  state: string;
  residentialAddress?: string;
  careCellId?: string;
  careCellCode?: string;
  careCellName?: string;
  careCellLeaderName?: string;
  careCellLeaderPhone?: string;
  latitude: number | null;
  longitude: number | null;
  formattedAddress?: string;
  locationAccuracy: LocationAccuracyType;
  locationSource: 'profile_geocoding' | 'member_confirmed_pin';
  geocodingStatus: 'completed' | 'pending' | 'failed' | 'needs_review';
  locationSharingConsent?: boolean;
  landmark?: string;
  lastVisitDate?: string;
  upcomingVisitDate?: string;
  visitStatus: VisitStatusBadge;
  hasVerifiedHome: boolean;
}

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  'AIzaSyBHqVKR6H6ro85c6VQ8vvTZGSgxjEJJeJ4';

const DEFAULT_KURNOOL_LAT = 15.8281;
const DEFAULT_KURNOOL_LNG = 78.0373;

class MemberLocationService {
  getGoogleMapsApiKey(): string {
    return GOOGLE_MAPS_API_KEY;
  }

  private getChurchDocRef(churchId?: string) {
    const cid = churchId || 'rhema';
    return firestore().collection('Rhema Church').doc(cid);
  }

  private getLocationCacheCol(churchId?: string) {
    return this.getChurchDocRef(churchId).collection('location_cache');
  }

  private getMembersCol(churchId?: string) {
    return this.getChurchDocRef(churchId).collection('members');
  }

  /**
   * Normalize an address string into a standard hash key for caching.
   * e.g. "koilakuntla_nandyal_andhra_pradesh"
   */
  createAddressHash(
    village?: string,
    mandal?: string,
    city?: string,
    district?: string,
    state?: string
  ): string {
    const parts = [village, mandal, city, district, state]
      .map((p) => (p || '').toLowerCase().trim().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);
    return parts.length > 0 ? parts.join('_') : 'unknown_location';
  }

  /**
   * Build a hierarchical address query prioritizing specific location fields.
   */
  buildAddressQuery(
    street?: string,
    village?: string,
    mandal?: string,
    city?: string,
    district?: string,
    state?: string
  ): string {
    const queryParts = [street, village, mandal, city, district, state, 'India']
      .map((s) => (s || '').trim())
      .filter(Boolean);
    return queryParts.join(', ');
  }

  /**
   * Geocode an address using the Google Maps Geocoding API with Firestore caching.
   */
  async geocodeAddress(
    churchId: string | undefined,
    params: {
      street?: string;
      village?: string;
      mandal?: string;
      city?: string;
      district?: string;
      state?: string;
    }
  ): Promise<MemberLocationData> {
    const hash = this.createAddressHash(
      params.village,
      params.mandal,
      params.city,
      params.district,
      params.state
    );

    // 1. Check Firestore Location Cache to save Google Maps API costs
    try {
      const cacheRef = this.getLocationCacheCol(churchId).doc(hash);
      const cachedSnap = await cacheRef.get();
      if (cachedSnap.exists()) {
        const cached = cachedSnap.data() as MemberLocationData;
        if (cached && cached.latitude && cached.longitude) {
          return {
            ...cached,
            addressHash: hash,
            locationSource: 'profile_geocoding',
          };
        }
      }
    } catch (cacheErr) {
      console.warn('Cache lookup warning (non-fatal):', cacheErr);
    }

    const query = this.buildAddressQuery(
      params.street,
      params.village,
      params.mandal,
      params.city,
      params.district,
      params.state
    );

    if (!query || query === 'India') {
      return {
        latitude: null,
        longitude: null,
        formattedAddress: 'No address provided in profile',
        locationAccuracy: 'unverified',
        locationSource: 'profile_geocoding',
        geocodingStatus: 'needs_review',
        addressHash: hash,
      };
    }

    // 2. Query Google Maps Geocoding API
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        query
      )}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && Array.isArray(json.results) && json.results.length > 0) {
        const first = json.results[0];
        const lat = first.geometry?.location?.lat;
        const lng = first.geometry?.location?.lng;
        const types: string[] = first.types || [];
        const formatted = first.formatted_address || query;

        // Determine accuracy classification
        let accuracy: LocationAccuracyType = 'village_approximate';
        if (
          types.includes('administrative_area_level_2') ||
          types.includes('administrative_area_level_1') ||
          types.includes('country')
        ) {
          accuracy = 'city_approximate';
        } else if (
          types.includes('locality') ||
          types.includes('sublocality') ||
          types.includes('sublocality_level_1') ||
          types.includes('neighborhood') ||
          types.includes('postal_code')
        ) {
          accuracy = 'village_approximate';
        }

        const locationResult: MemberLocationData = {
          latitude: lat,
          longitude: lng,
          formattedAddress: formatted,
          resolvedVillage: params.village || params.city || '',
          resolvedCity: params.city || '',
          resolvedDistrict: params.district || '',
          resolvedState: params.state || 'Andhra Pradesh',
          locationAccuracy: accuracy,
          locationSource: 'profile_geocoding',
          geocodingStatus: 'completed',
          addressHash: hash,
          geocodedAt: new Date().toISOString(),
        };

        // Cache result in Firestore for all other church members in this area
        this.getLocationCacheCol(churchId)
          .doc(hash)
          .set({
            ...locationResult,
            updatedAt: firestore.FieldValue.serverTimestamp(),
          })
          .catch((e) => console.warn('Could not save location to cache:', e));

        return locationResult;
      }

      console.warn(`Geocoding status not OK: ${json.status} for query "${query}"`);
      return {
        latitude: null,
        longitude: null,
        formattedAddress: query,
        locationAccuracy: 'unverified',
        locationSource: 'profile_geocoding',
        geocodingStatus: 'failed',
        addressHash: hash,
        geocodedAt: new Date().toISOString(),
      };
    } catch (networkErr) {
      console.error('Google Maps Geocoding request failed:', networkErr);
      return {
        latitude: null,
        longitude: null,
        formattedAddress: query,
        locationAccuracy: 'unverified',
        locationSource: 'profile_geocoding',
        geocodingStatus: 'failed',
        addressHash: hash,
        geocodedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Save a member-confirmed exact home location with explicit location-sharing consent.
   */
  async saveConfirmedHomeLocation(
    churchId: string | undefined,
    memberId: string,
    location: {
      latitude: number;
      longitude: number;
      completeAddress?: string;
      landmark?: string;
      locationSharingConsent: boolean;
    }
  ): Promise<void> {
    if (!memberId) throw new Error('memberId is required');

    const memberRef = this.getMembersCol(churchId).doc(memberId);
    const locationData: Partial<MemberLocationData> = {
      latitude: location.latitude,
      longitude: location.longitude,
      formattedAddress: location.completeAddress || '',
      landmark: location.landmark || '',
      locationAccuracy: 'verified_home',
      locationSource: 'member_confirmed_pin',
      locationSharingConsent: location.locationSharingConsent,
      geocodingStatus: 'completed',
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    await memberRef.set(
      {
        locationData,
        // Also sync root fields for backwards compatibility
        latitude: location.latitude,
        longitude: location.longitude,
        hasVerifiedHome: true,
      },
      { merge: true }
    );
  }

  /**
   * Revoke member home location consent.
   */
  async revokeHomeLocationConsent(churchId: string | undefined, memberId: string): Promise<void> {
    const memberRef = this.getMembersCol(churchId).doc(memberId);
    await memberRef.set(
      {
        'locationData.locationSharingConsent': false,
        'locationData.locationAccuracy': 'village_approximate',
        hasVerifiedHome: false,
      },
      { merge: true }
    );
  }

  /**
   * Load and resolve all member locations for the interactive map.
   * Pulls existing profile data, applies cache, and attaches Care Cell metadata.
   */
  async getMemberLocationsForMap(churchId?: string): Promise<MemberLocationRecord[]> {
    const activeChurchId = churchId || 'rhema';
    const db = firestore();
    const churchDoc = db.collection('Rhema Church').doc(activeChurchId);

    // Parallel fetch: members, care cells, and memberships
    const [membersSnap, cellsSnap, membershipsSnap, visitsSnap] = await Promise.all([
      churchDoc.collection('members').get(),
      churchDoc.collection('care_cells').get(),
      churchDoc.collection('care_cell_memberships').where('membershipStatus', '==', 'Active').get(),
      churchDoc.collection('care_cell_visits').where('status', '==', 'Scheduled').get(),
    ]);

    // Build Care Cell lookup map: cellId => CareCell
    const careCellMap = new Map<string, any>();
    cellsSnap.docs.forEach((doc) => {
      careCellMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    // Build Member to Care Cell lookup: memberId => membership
    const memberCellMap = new Map<string, any>();
    membershipsSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data?.memberId) {
        memberCellMap.set(data.memberId, data);
      }
    });

    // Build Scheduled Visits lookup: memberId => visit info
    const scheduledVisitsMap = new Map<string, any>();
    visitsSnap.docs.forEach((doc) => {
      const v = doc.data();
      const responses = v.responses || {};
      Object.keys(responses).forEach((memId) => {
        if (!scheduledVisitsMap.has(memId)) {
          scheduledVisitsMap.set(memId, {
            visitId: doc.id,
            visitDate: v.visitDate,
            visitTime: v.visitTime,
            status: responses[memId]?.response || 'Pending',
          });
        }
      });
    });

    const records: MemberLocationRecord[] = [];
    const geocodingPromises: Array<Promise<void>> = [];

    for (const doc of membersSnap.docs) {
      const m = doc.data() || {};
      const memberId = doc.id;
      const memberName =
        (m.name || m.fullName || `${m.firstName || ''} ${m.lastName || ''}`).trim() ||
        'Church Member';
      const memberCode = m.memberCode || `Rhema-${doc.id.slice(-3)}`;
      const phone = m.phone || m.mobile || '';
      const photo = m.profilePhoto || m.photoURL || m.photoUrl || undefined;

      const village = (m.village || m.city || m.mailingCity || '').trim();
      const city = (m.city || m.mailingCity || '').trim();
      const district = (m.district || '').trim();
      const state = (m.state || m.mailingState || 'Andhra Pradesh').trim();
      const street = (m.street || m.mailingStreet || '').trim();

      // Attached Care Cell info
      const membership = memberCellMap.get(memberId);
      const cellId = membership?.cellId || m.careCellId || '';
      const cell = cellId ? careCellMap.get(cellId) : null;
      const careCellName = cell?.name || membership?.cellName || 'Unassigned';
      const careCellCode = cell?.cellCode || membership?.cellCode || '';
      const careCellLeaderName = cell?.leaderName || 'Pastoral Team';
      const careCellLeaderPhone = cell?.leaderPhone || '';

      // Visit Status
      const activeVisit = scheduledVisitsMap.get(memberId);
      let visitStatus: VisitStatusBadge = 'no_pending';
      let upcomingVisitDate: string | undefined = undefined;

      if (activeVisit) {
        upcomingVisitDate = `${activeVisit.visitDate} ${activeVisit.visitTime || ''}`.trim();
        if (activeVisit.status === 'Accepted') {
          visitStatus = 'scheduled';
        } else if (activeVisit.status === 'Pending') {
          visitStatus = 'awaiting_confirm';
        } else if (activeVisit.status === 'Declined') {
          visitStatus = 'followup_required';
        }
      }

      // Check existing coordinates on member document
      const locData = m.locationData as MemberLocationData | undefined;
      const hasVerifiedHome =
        locData?.locationAccuracy === 'verified_home' && locData?.locationSharingConsent === true;

      if (locData?.latitude && locData?.longitude) {
        records.push({
          memberId,
          memberName,
          memberCode,
          phone,
          profilePhoto: photo,
          village: village || 'Local Area',
          city,
          district,
          state,
          residentialAddress: locData.formattedAddress || street,
          careCellId: cellId || undefined,
          careCellCode,
          careCellName,
          careCellLeaderName,
          careCellLeaderPhone,
          latitude: locData.latitude,
          longitude: locData.longitude,
          formattedAddress: locData.formattedAddress,
          locationAccuracy: locData.locationAccuracy || 'village_approximate',
          locationSource: locData.locationSource || 'profile_geocoding',
          geocodingStatus: locData.geocodingStatus || 'completed',
          locationSharingConsent: locData.locationSharingConsent,
          landmark: locData.landmark,
          upcomingVisitDate,
          visitStatus,
          hasVerifiedHome,
        });
      } else if (village || city || district) {
        // Asynchronously resolve coordinates from profile address
        const geocodeTask = this.geocodeAddress(activeChurchId, {
          street,
          village,
          mandal: m.mandal,
          city,
          district,
          state,
        }).then(async (resolved) => {
          if (resolved.latitude && resolved.longitude) {
            // Save resolved coordinates back to member profile to avoid repeating geocode
            await this.getMembersCol(activeChurchId).doc(memberId).set(
              {
                locationData: resolved,
                latitude: resolved.latitude,
                longitude: resolved.longitude,
              },
              { merge: true }
            );
          }

          records.push({
            memberId,
            memberName,
            memberCode,
            phone,
            profilePhoto: photo,
            village: village || 'Local Area',
            city,
            district,
            state,
            residentialAddress: resolved.formattedAddress || street,
            careCellId: cellId || undefined,
            careCellCode,
            careCellName,
            careCellLeaderName,
            careCellLeaderPhone,
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            formattedAddress: resolved.formattedAddress,
            locationAccuracy: resolved.locationAccuracy,
            locationSource: resolved.locationSource,
            geocodingStatus: resolved.geocodingStatus,
            upcomingVisitDate,
            visitStatus,
            hasVerifiedHome: false,
          });
        });

        geocodingPromises.push(geocodeTask);
      }
    }

    if (geocodingPromises.length > 0) {
      await Promise.all(geocodingPromises);
    }

    return records;
  }

  /**
   * Calculate distance in kilometers between two geographic coordinates using the Haversine formula.
   */
  calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of Earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
  }

  /**
   * Find nearby members within a given radius (1km, 2km, 5km, 10km) around a target member.
   */
  findNearbyMembers(
    targetMember: MemberLocationRecord,
    allMembers: MemberLocationRecord[],
    radiusKm: number
  ): Array<{ member: MemberLocationRecord; distanceKm: number }> {
    if (!targetMember.latitude || !targetMember.longitude) return [];

    const results: Array<{ member: MemberLocationRecord; distanceKm: number }> = [];

    for (const mem of allMembers) {
      if (mem.memberId === targetMember.memberId) continue;
      if (!mem.latitude || !mem.longitude) continue;

      const dist = this.calculateDistanceKm(
        targetMember.latitude,
        targetMember.longitude,
        mem.latitude,
        mem.longitude
      );

      if (dist <= radiusKm) {
        results.push({ member: mem, distanceKm: dist });
      }
    }

    return results.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  /**
   * Decode Google polyline string to array of coordinates.
   */
  decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
    const points: Array<{ latitude: number; longitude: number }> = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;
    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;
      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;
      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  }

  /**
   * Compute in-app route polyline, distance, and duration between origin and destination(s).
   * Tries Google Routes API with live fallback to geodesic route points so in-app navigation NEVER fails.
   */
  async computeInAppRoute(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    stops?: Array<{ latitude: number; longitude: number }>
  ): Promise<{
    coordinates: Array<{ latitude: number; longitude: number }>;
    distanceKm: number;
    durationMins: number;
    steps: string[];
  }> {
    // 1. Try Google Routes API if available
    try {
      const apiKey = this.getGoogleMapsApiKey();
      if (apiKey) {
        const body: any = {
          origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
          destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
        };

        if (stops && stops.length > 0) {
          body.intermediates = stops.map((s) => ({
            location: { latLng: { latitude: s.latitude, longitude: s.longitude } },
          }));
        }

        const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.routes && data.routes[0]) {
            const r = data.routes[0];
            const encoded = r.polyline?.encodedPolyline;
            if (encoded) {
              const coords = this.decodePolyline(encoded);
              const distanceKm = Math.round(((r.distanceMeters || 0) / 1000) * 10) / 10;
              const durationSecs = parseInt(String(r.duration || '0').replace('s', ''), 10);
              const durationMins = Math.max(1, Math.round(durationSecs / 60));
              return {
                coordinates: coords,
                distanceKm,
                durationMins,
                steps: [
                  `Start from Current Location`,
                  `Follow main road route towards destination`,
                  `Arrive at destination (${distanceKm} km, ~${durationMins} mins IST)`,
                ],
              };
            }
          }
        }
      }
    } catch (_) {
      // Fallback to geometric road curve interpolation
    }

    // 2. High-quality smooth waypoint interpolation fallback
    const allStops = [origin, ...(stops || []), destination];
    let totalDist = 0;
    const smoothPoints: Array<{ latitude: number; longitude: number }> = [];

    for (let i = 0; i < allStops.length - 1; i++) {
      const p1 = allStops[i];
      const p2 = allStops[i + 1];
      const segmentDist = this.calculateDistanceKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      totalDist += segmentDist;

      // Generate 12 curved interpolation points per leg for a realistic map road polyline
      const stepsCount = Math.max(8, Math.min(24, Math.round(segmentDist * 2)));
      for (let s = 0; s <= stepsCount; s++) {
        const t = s / stepsCount;
        const curveOffset = Math.sin(t * Math.PI) * (segmentDist * 0.0006);
        smoothPoints.push({
          latitude: p1.latitude + (p2.latitude - p1.latitude) * t + curveOffset,
          longitude: p2.longitude + (p2.longitude - p1.longitude) * t,
        });
      }
    }

    const distRounded = Math.round(totalDist * 10) / 10;
    const durMins = Math.max(3, Math.round((totalDist / 35) * 60));

    return {
      coordinates: smoothPoints,
      distanceKm: distRounded,
      durationMins: durMins,
      steps: [
        `Depart from Starting Location`,
        `Follow main road connecting to locality`,
        `Arrive at destination (${distRounded} km, ~${durMins} mins IST)`,
      ],
    };
  }

  /**
   * Launch external Google Maps app with turn-by-turn driving or walking directions.
   */
  openDirections(lat: number, lng: number, label?: string): void {
    const scheme = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(label || 'Member Location')}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${encodeURIComponent(label || 'Member Location')})`,
    });
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

    if (scheme) {
      Linking.canOpenURL(scheme)
        .then((supported) => {
          if (supported) {
            Linking.openURL(scheme);
          } else {
            Linking.openURL(webUrl);
          }
        })
        .catch(() => Linking.openURL(webUrl));
    } else {
      Linking.openURL(webUrl);
    }
  }

  /**
   * Open multi-stop route in Google Maps app for combined pastoral visiting.
   */
  openMultiStopRoute(
    origin: { lat: number; lng: number },
    stops: Array<{ lat: number; lng: number; label?: string }>
  ): void {
    if (stops.length === 0) return;

    if (stops.length === 1) {
      this.openDirections(stops[0].lat, stops[0].lng, stops[0].label);
      return;
    }

    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(0, stops.length - 1).map((s) => `${s.lat},${s.lng}`);

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${
      destination.lat
    },${destination.lng}&waypoints=${encodeURIComponent(waypoints.join('|'))}&travelmode=driving`;

    Linking.openURL(url).catch((err) =>
      console.error('Could not open multi-stop Google Maps route:', err)
    );
  }

  /**
   * Resolves coordinates, distance, and profile details for all members of a specific Care Cell.
   * Pulls existing profile data, applies Google Maps geocoding and caching,
   * and computes distances from the cell's center location.
   */
  async resolveCareCellMemberLocations(
    churchId: string | undefined,
    cell: { id?: string; name?: string; location?: string; meetingLatitude?: number; meetingLongitude?: number },
    members: Array<CareCellMembership>
  ): Promise<{
    cellCenter: { latitude: number; longitude: number };
    resolvedMembers: Array<
      CareCellMembership & {
        distanceKm?: number;
        profilePhoto?: string;
        locationAccuracy?: string;
      }
    >;
  }> {
    const activeChurchId = churchId || 'rhema';
    const db = firestore();
    const churchDoc = db.collection('Rhema Church').doc(activeChurchId);

    // 1. Resolve Cell Center
    let cellLat = cell.meetingLatitude;
    let cellLng = cell.meetingLongitude;

    if (!cellLat || !cellLng) {
      const locKey = (cell.location || '').toLowerCase().trim();
      if (locKey && KNOWN_REGION_COORDS[locKey]) {
        cellLat = KNOWN_REGION_COORDS[locKey].lat;
        cellLng = KNOWN_REGION_COORDS[locKey].lng;
      } else if (locKey) {
        // Try geocoding cell location
        try {
          const res = await this.geocodeAddress(activeChurchId, {
            village: cell.location,
            city: 'Kurnool',
            district: 'Kurnool',
            state: 'Andhra Pradesh',
          });
          if (res.latitude && res.longitude) {
            cellLat = res.latitude;
            cellLng = res.longitude;
          }
        } catch (_) {}
      }
    }

    // Fallback: Koilakuntla if location includes Koilakuntla, else default Kurnool
    if (!cellLat || !cellLng) {
      if ((cell.location || '').toLowerCase().includes('koila')) {
        cellLat = KNOWN_REGION_COORDS['koilakuntla'].lat;
        cellLng = KNOWN_REGION_COORDS['koilakuntla'].lng;
      } else {
        cellLat = DEFAULT_KURNOOL_LAT;
        cellLng = DEFAULT_KURNOOL_LNG;
      }
    }

    const cellCenter = { latitude: cellLat, longitude: cellLng };

    // 2. Resolve Each Member
    const resolvedMembers = await Promise.all(
      members.map(async (m) => {
        let lat = m.latitude;
        let lng = m.longitude;
        let photo = m.memberPhoto;
        let locality = m.locality;
        let address = m.address;
        let accuracy = 'village_approximate';

        // Check if member already has valid coordinates and photo
        const needsFetch = !lat || !lng || !photo || isNaN(lat) || isNaN(lng);

        if (needsFetch && m.memberId) {
          try {
            const memberDoc = await churchDoc.collection('members').doc(m.memberId).get();
            if (memberDoc.exists) {
              const data = memberDoc.data() || {};
              if (!photo) {
                photo = data.profilePhoto || data.photoURL || data.photoUrl || '';
              }
              if (!locality) {
                locality = data.village || data.city || data.mailingCity || cell.location || '';
              }
              if (!address) {
                address = data.street || data.address || data.mailingStreet || '';
              }

              // Check existing coords on profile
              if (data.locationData?.latitude && data.locationData?.longitude) {
                lat = data.locationData.latitude;
                lng = data.locationData.longitude;
                accuracy = data.locationData.locationAccuracy || 'village_approximate';
              } else if (data.latitude && data.longitude) {
                lat = data.latitude;
                lng = data.longitude;
                accuracy = data.hasVerifiedHome ? 'verified_home' : 'village_approximate';
              } else {
                // Geocode using profile address
                const village = data.village || data.city || locality || cell.location;
                const street = data.street || address;
                const city = data.city || 'Kurnool';
                const district = data.district || 'Kurnool';
                const state = data.state || 'Andhra Pradesh';

                const geoRes = await this.geocodeAddress(activeChurchId, {
                  street,
                  village,
                  city,
                  district,
                  state,
                });

                if (geoRes.latitude && geoRes.longitude) {
                  lat = geoRes.latitude;
                  lng = geoRes.longitude;
                  accuracy = geoRes.locationAccuracy || 'village_approximate';
                }
              }
            }
          } catch (e) {
            console.warn(`Error enriching member ${m.memberId}:`, e);
          }
        }

        // Region coordinates fallback if geocoding didn't find coordinates
        if ((!lat || !lng || isNaN(lat) || isNaN(lng)) && locality) {
          const normLoc = locality.toLowerCase().trim();
          if (KNOWN_REGION_COORDS[normLoc]) {
            lat = KNOWN_REGION_COORDS[normLoc].lat;
            lng = KNOWN_REGION_COORDS[normLoc].lng;
          } else if (normLoc.includes('koila')) {
            lat = KNOWN_REGION_COORDS['koilakuntla'].lat;
            lng = KNOWN_REGION_COORDS['koilakuntla'].lng;
          }
        }

        // If still without coordinates, use cellCenter as approximate location
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
          lat = cellCenter.latitude;
          lng = cellCenter.longitude;
        }

        // Compute distance from cell center
        const dist = calculateDistanceKm(cellCenter.latitude, cellCenter.longitude, lat, lng);
        const distanceKm = Math.round(dist * 10) / 10;

        return {
          ...m,
          latitude: lat,
          longitude: lng,
          memberPhoto: photo || m.memberPhoto || '',
          locality: locality || m.locality || cell.location || '',
          address: address || m.address || '',
          distanceKm,
          locationAccuracy: accuracy,
        };
      })
    );

    return { cellCenter, resolvedMembers };
  }
}

export default new MemberLocationService();
