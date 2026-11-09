import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Geolocation from '@react-native-community/geolocation';
import { colors, spacing, radius, typography, shadow } from '../theme/Theme';
import { useTheme } from '../context/ThemeContext';

interface LatLng {
  lat: number;
  lng: number;
  name?: string;
}

interface LiveJourneyTrackerProps {
  eventId?: string;
  home: LatLng;
  destination: LatLng;
  destinationName: string;
  initialDistanceKm?: number;
  initialDurationMins?: number;
  altHome?: LatLng;
  altInitialDistanceKm?: number;
  altInitialDurationMins?: number;
  isDisabled?: boolean;
}

type TravelStatus = 'Traveling' | 'Stopped' | 'Arrived' | 'Paused';

const LiveJourneyTracker: React.FC<LiveJourneyTrackerProps> = ({
  home,
  destination,
  destinationName,
  initialDistanceKm,
  initialDurationMins,
  altHome,
  altInitialDistanceKm,
  altInitialDurationMins,
  isDisabled = false,
}) => {
  const { isDark } = useTheme();
  const [selectedMode, setSelectedMode] = useState<'primary' | 'alt'>('primary');
  const activeHome = selectedMode === 'primary' ? home : (altHome || home);
  const [isTracking, setIsTracking] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [currentLocationName, setCurrentLocationName] = useState<string>('Unknown');
  const [remainingKm, setRemainingKm] = useState<number>(0);
  const [remainingMins, setRemainingMins] = useState<number>(0);
  const [totalKm, setTotalKm] = useState<number>(1); // To avoid division by zero
  const [status, setStatus] = useState<TravelStatus>('Traveling');
  const [lastMovedAt, setLastMovedAt] = useState<number>(Date.now());
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // Animation for the car
  const carProgress = useRef(new Animated.Value(0)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isTracking && !isPaused && status === 'Traveling') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 600, useNativeDriver: true })
        ])
      ).start();
    } else {
      blinkAnim.stopAnimation();
      blinkAnim.setValue(1);
    }
  }, [isTracking, isPaused, status]);

  // Initial fetch for Total Distance (Home to Destination)
  useEffect(() => {
    if (selectedMode === 'alt' && altInitialDistanceKm !== undefined && altInitialDurationMins !== undefined) {
      setTotalKm(altInitialDistanceKm);
      setRemainingKm(altInitialDistanceKm);
      setRemainingMins(altInitialDurationMins);
      return;
    }
    
    if (selectedMode === 'primary' && initialDistanceKm !== undefined && initialDurationMins !== undefined) {
      setTotalKm(initialDistanceKm);
      setRemainingKm(initialDistanceKm);
      setRemainingMins(initialDurationMins);
      return;
    }

    const fetchInitialDistance = async () => {
      try {
        const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
        if (!GOOGLE_KEY) return;
        const loc = activeHome;
        const res = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?origin=${loc.lat},${loc.lng}&destination=${destination.lat},${destination.lng}&key=${GOOGLE_KEY}`
          );
          const data = await res.json();
          if (data.status === 'OK' && data.routes.length > 0) {
            const distKm = data.routes[0].legs[0].distance.value / 1000;
            const durationMins = Math.round(data.routes[0].legs[0].duration.value / 60);

            // Fetch nearest road to snap the location for map viewing
            try {
              const snapRes = await fetch(`https://roads.googleapis.com/v1/nearestRoads?points=${loc.lat},${loc.lng}&key=${GOOGLE_KEY}`);
              const snapData = await snapRes.json();
              if (snapData.snappedPoints && snapData.snappedPoints.length > 0) {
                // If snapped successfully, optionally use snap coordinates for UI
              }
            } catch (err) {}

            setTotalKm(distKm);
            setRemainingKm(distKm);
            setRemainingMins(durationMins);
            setCurrentLocationName(loc.name || 'Current Location');
            setStatus('Traveling');
          } else {
            // Reached or routing failed
            if (data.status === 'ZERO_RESULTS') {
              setStatus('Stopped');
            }
          }
        } catch (e) {
          console.warn('Distance Matrix failed:', e);
        } finally {
          setIsUpdating(false);
        }
    };
    if (activeHome.lat && destination.lat) {
      fetchInitialDistance();
    }
  }, [activeHome.lat, activeHome.lng, destination.lat, destination.lng, initialDistanceKm, initialDurationMins, altInitialDistanceKm, altInitialDurationMins, selectedMode]);

  const [isSimulating, setIsSimulating] = useState(false);

  const handleStartTracking = async () => {
    let grantedLocation = false;
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'App needs access to your location for the Live Journey Tracker.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          grantedLocation = true;
        }
      } catch (err) {
        console.warn(err);
      }
    } else {
      Geolocation.requestAuthorization();
      grantedLocation = true;
    }

    if (grantedLocation) {
      setHasPermission(true);
      setIsTracking(true);
      setIsPaused(false);
      setStatus('Traveling');
      setLastMovedAt(Date.now());
    } else {
      // Permission denied - Enter Simulation Mode
      console.warn('Location permission denied. Entering Simulation Mode.');
      setHasPermission(false);
      setIsSimulating(true);
      setIsTracking(true);
      setIsPaused(false);
      setStatus('Traveling');
      setLastMovedAt(Date.now());
      
      // Start simulation from home coordinates
      setCurrentLocation({ lat: activeHome.lat, lng: activeHome.lng });
    }
  };

  const handlePauseTracking = () => {
    setIsPaused(true);
    setStatus('Paused');
  };

  const handleResumeTracking = () => {
    setIsPaused(false);
    setStatus('Traveling');
    setLastMovedAt(Date.now());
  };

  const handleStopTracking = () => {
    setIsTracking(false);
    setIsSimulating(false);
    setIsPaused(false);
  };

  // The actual location watching OR simulation
  useEffect(() => {
    let watchId: number | null = null;
    let locationInterval: ReturnType<typeof setInterval> | null = null;
    let simInterval: ReturnType<typeof setInterval> | null = null;

    if (isSimulating && isTracking && !isPaused) {
      // SIMULATION MODE
      let currentLat = currentLocation?.lat || activeHome.lat;
      let currentLng = currentLocation?.lng || activeHome.lng;
      const latStep = (destination.lat - activeHome.lat) / 20; // 20 steps to destination
      const lngStep = (destination.lng - activeHome.lng) / 20;

      simInterval = setInterval(() => {
        currentLat += latStep;
        currentLng += lngStep;
        updateJourney(currentLat, currentLng);
      }, 5000); // Move every 5 seconds
    } else if (isTracking && hasPermission && !isPaused) {
      // Fetch instant location on start
      Geolocation.getCurrentPosition(
        (info) => {
          updateJourney(info.coords.latitude, info.coords.longitude);
        },
        (error) => console.warn('Instant location error:', error),
        { enableHighAccuracy: false, timeout: 30000, maximumAge: 10000 }
      );

      // REAL GPS TRACKING (updates on movement)
      watchId = Geolocation.watchPosition(
        (info) => {
          updateJourney(info.coords.latitude, info.coords.longitude);
        },
        (error) => console.warn('Location watch error:', error),
        {
          enableHighAccuracy: true,
          distanceFilter: 10, // update every 10 meters instead of 50 for more responsiveness
          timeout: 30000,
          maximumAge: 10000
        }
      );

      locationInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastMovedAt > 5 * 60 * 1000 && status !== 'Arrived' && !isPaused) { // 5 minutes without significant move
          setStatus('Stopped');
        }
      }, 60000);
    }

    return () => {
      if (watchId !== null) Geolocation.clearWatch(watchId);
      if (locationInterval) clearInterval(locationInterval);
      if (simInterval) clearInterval(simInterval);
    };
  }, [isTracking, hasPermission, isSimulating, isPaused, lastMovedAt, status, activeHome.lat, activeHome.lng, destination.lat, destination.lng]);

  const updateJourney = async (lat: number, lng: number) => {
    setCurrentLocation({ lat, lng });
    setIsUpdating(true);
    try {
      const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
      if (!GOOGLE_KEY) return;

      // 1. Reverse Geocode to get current town/village
      const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`);
      const geoData = await geoRes.json();
      
      let currentPlaceName = 'Unknown Location';
      if (geoData.status === 'OK' && geoData.results.length > 0) {
        currentPlaceName = geoData.results[0].formatted_address;
      }
      setCurrentLocationName(currentPlaceName);

      // 2. Distance Matrix to get ETA and Remaining Distance
      const distRes = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat},${lng}&destinations=${destination.lat},${destination.lng}&key=${GOOGLE_KEY}`
      );
      const distData = await distRes.json();
      
      if (distData.status === 'OK' && distData.rows[0].elements[0].status === 'OK') {
        const element = distData.rows[0].elements[0];
        const remKm = element.distance.value / 1000;
        const remMins = Math.round(element.duration.value / 60);
        
        setRemainingKm(remKm);
        setRemainingMins(remMins);

        // Update Car Animation Progress (0 to 1)
        let progress = 1 - (remKm / totalKm);
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;
        
        Animated.timing(carProgress, {
          toValue: progress,
          duration: 1000,
          useNativeDriver: false,
        }).start();

        // Check if Arrived (e.g., less than 0.5 km)
        if (remKm < 0.5) {
          setStatus('Arrived');
          setIsTracking(false);
        } else {
          // Check if moved significantly to update status to Traveling
          // We assume any update from watchPositionAsync means we moved if the remaining distance changed
          setStatus('Traveling');
          setLastMovedAt(Date.now());
        }
      }
    } catch (e) {
      console.warn('Error updating journey', e);
    } finally {
      setIsUpdating(false);
    }
  };

  const renderStatusBadge = () => {
    let bgColor = colors.primaryLight;
    let textColor = colors.primaryDark;
    let icon = 'ellipse';

    if (status === 'Traveling') {
      bgColor = isDark ? 'rgba(34, 197, 94, 0.2)' : '#E6F4EA';
      textColor = isDark ? '#86EFAC' : '#137333';
      icon = 'radio-button-on';
    } else if (status === 'Stopped') {
      bgColor = isDark ? 'rgba(234, 179, 8, 0.2)' : '#FEF7E0';
      textColor = isDark ? '#FDE047' : '#B06000';
      icon = 'alert-circle';
    } else if (status === 'Paused') {
      bgColor = isDark ? 'rgba(249, 115, 22, 0.2)' : '#FFF3E0';
      textColor = isDark ? '#FDBA74' : '#E65100';
      icon = 'pause-circle';
    } else if (status === 'Arrived') {
      bgColor = isDark ? 'rgba(99, 102, 241, 0.2)' : '#E8EAF6';
      textColor = isDark ? '#A5B4FC' : '#283593';
      icon = 'checkmark-circle';
    }

    return (
      <Animated.View style={[styles.statusBadge, { backgroundColor: bgColor }, status === 'Traveling' ? { opacity: blinkAnim } : {}]}>
        <Ionicons name={icon as any} size={14} color={textColor} />
        <Text style={[styles.statusText, { color: textColor }]}>{status}</Text>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Text style={[styles.cardLabel, { marginBottom: 0, color: isDark ? '#FFFFFF' : '#0F172A' }]}>
            {isSimulating ? 'Live Tracker (Simulation)' : 'Live Journey Tracker'}
          </Text>
          <View style={{ backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderWidth: 1, borderColor: isDark ? '#3F3F46' : '#CBD5E1', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#FFFFFF' : '#0F172A' }}>
              {remainingKm.toFixed(1)} km • {remainingMins >= 60 ? `${Math.floor(remainingMins / 60)}h ${remainingMins % 60}m` : `${remainingMins}m`}
            </Text>
          </View>
        </View>
        {isTracking && renderStatusBadge()}
      </View>

      {/* Progress Bar Area */}
      <View style={styles.progressContainer}>
          {/* Toggle for multiple origins */}
          {altHome && (
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 }}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
                <Text style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 4 }}>
                  Multiple events today. Select your starting point:
                </Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: colors.bgSecondary, borderRadius: radius.full, padding: 4 }}>
                <TouchableOpacity 
                  style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', backgroundColor: selectedMode === 'primary' ? (isDark ? '#FFFFFF' : '#000000') : 'transparent', borderRadius: radius.full, ...((selectedMode === 'primary') ? shadow.card : {}) }}
                  onPress={() => { setSelectedMode('primary'); setIsTracking(false); setStatus('Traveling'); carProgress.setValue(0); }}
                >
                  <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 11, fontWeight: '700', color: selectedMode === 'primary' ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary }}>{home.name || 'Origin'}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', backgroundColor: selectedMode === 'alt' ? (isDark ? '#FFFFFF' : '#000000') : 'transparent', borderRadius: radius.full, ...((selectedMode === 'alt') ? shadow.card : {}) }}
                  onPress={() => { setSelectedMode('alt'); setIsTracking(false); setStatus('Traveling'); carProgress.setValue(0); }}
                >
                  <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 11, fontWeight: '700', color: selectedMode === 'alt' ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary }}>{altHome.name || 'Alt Origin'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.endpointsRow}>
            <View style={styles.endpoint}>
              <Ionicons name="location" size={16} color={isDark ? '#B9C8BD' : '#315C50'} />
              <Text style={[styles.endpointText, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>{activeHome.name || 'Origin'}</Text>
            </View>
            <View style={[styles.endpoint, { alignItems: 'flex-end' }]}>
              <Ionicons name="flag" size={16} color={isDark ? '#B9C8BD' : '#315C50'} />
              <Text style={[styles.endpointText, { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: 'right' }]} numberOfLines={1}>{destinationName}</Text>
            </View>
          </View>

        <View style={styles.trackContainer}>
          <View style={[styles.trackLine, { backgroundColor: isDark ? '#3F3F46' : '#E2E8F0' }]} />
          {isTracking || currentLocation ? (
            <Animated.View
              style={[
                styles.carIconContainer,
                {
                  left: carProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '90%'], // 90% so it doesn't overflow
                  }),
                },
              ]}
            >
              <Animated.View style={{ opacity: blinkAnim }}>
                <MaterialCommunityIcons name="car-side" size={26} color={isDark ? '#B9C8BD' : '#315C50'} />
              </Animated.View>
            </Animated.View>
          ) : (
            <View style={[styles.carIconContainer, { left: '0%' }]}>
              <MaterialCommunityIcons name="car-side" size={26} color={isDark ? '#A1A1AA' : colors.textSecondary} />
            </View>
          )}
        </View>
      </View>

      {/* Stats Area */}
      {isTracking || currentLocation ? (
        <View style={[styles.statsContainer, { backgroundColor: isDark ? '#27272A' : '#F8FAFC', borderColor: isDark ? '#3F3F46' : '#E2E8F0', borderWidth: 1 }]}>
          <View style={styles.statBox}>
            <Text style={[styles.statLabel, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Current Location</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="location" size={16} color={colors.error} />
              <Text style={[styles.statValue, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={2}>
                {currentLocationName}
              </Text>
            </View>
          </View>

          <View style={[styles.statDivider, { backgroundColor: isDark ? '#3F3F46' : '#E2E8F0' }]} />

          <View style={styles.statBox}>
            <Text style={[styles.statLabel, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Remaining</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="map-outline" size={16} color={isDark ? '#B9C8BD' : '#315C50'} />
                <Text style={[styles.statValueSmall, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{remainingKm.toFixed(1)} km</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="time-outline" size={16} color={isDark ? '#B9C8BD' : '#315C50'} />
                <Text style={[styles.statValueSmall, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                  {remainingMins >= 60 ? `${Math.floor(remainingMins / 60)}h ${remainingMins % 60}m` : `${remainingMins}m`}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actionRow}>
        {!isTracking && status !== 'Arrived' ? (
          isDisabled ? (
            <View style={[styles.startButton, { backgroundColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.startButtonText, { color: colors.textSecondary }]}>Available on event day</Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={[
                styles.startButton,
                {
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.3 : 0.15,
                  shadowRadius: 4,
                  elevation: 3,
                }
              ]} 
              onPress={isPaused ? handleResumeTracking : handleStartTracking}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={18} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={[styles.startButtonText, { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }]}>
                {isPaused ? 'Resume Journey' : 'Start Journey'}
              </Text>
            </TouchableOpacity>
          )
        ) : isTracking && !isPaused ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={styles.pauseButton} onPress={handlePauseTracking}>
              <Ionicons name="pause" size={18} color="#D97706" />
              <Text style={styles.pauseButtonText}>Pause</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopButton} onPress={handleStopTracking}>
              <Ionicons name="stop" size={18} color={colors.error} />
              <Text style={styles.stopButtonText}>Stop</Text>
            </TouchableOpacity>
          </View>
        ) : isTracking && isPaused ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={styles.resumeButton} onPress={handleResumeTracking}>
              <Ionicons name="play" size={18} color="#FFF" />
              <Text style={styles.resumeButtonText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopButton} onPress={handleStopTracking}>
              <Ionicons name="stop" size={18} color={colors.error} />
              <Text style={styles.stopButtonText}>Stop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.arrivedBox}>
            <Ionicons name="checkmark-circle" size={20} color="#137333" />
            <Text style={styles.arrivedText}>You have arrived at the destination</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgPrimary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  endpointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  endpoint: {
    flex: 1,
  },
  endpointText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 4,
  },
  trackContainer: {
    height: 30,
    justifyContent: 'center',
  },
  trackLine: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    width: '100%',
    position: 'absolute',
  },
  carIconContainer: {
    position: 'absolute',
    top: -8, // Slight negative offset puts it right on the line without clipping
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
  },
  statsContainer: {
    flexDirection: 'column',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 12,
  },
  statBox: {
    width: '100%',
  },
  statDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginLeft: 4,
    flex: 1,
  },
  statValueSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.full,
    gap: 8,
  },
  startButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.error}1A`,
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.full,
    gap: 8,
  },
  stopButtonText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '700',
  },
  arrivedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    gap: 8,
  },
  arrivedText: {
    color: '#137333',
    fontSize: 14,
    fontWeight: '700',
  },
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    gap: 8,
  },
  pauseButtonText: {
    color: '#D97706',
    fontSize: 14,
    fontWeight: '700',
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    gap: 8,
  },
  resumeButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default LiveJourneyTracker;
