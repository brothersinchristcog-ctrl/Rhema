import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Platform
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../context/ThemeContext';
import { colors, spacing, radius, typography, shadow } from '../../../theme/Theme';
import { PastorEvent, TransportMode } from '../../../types/event';
import { openRoute } from '../../../utils/maps';
import { detectConflicts } from '../../../utils/conflicts';
import { saveStartingLocation, getStartingLocation, formatDuration } from '../../../utils/locationStore';
import TransportToggle from '../../../components/TransportToggle';
import RouteChain, { RouteStop, RouteLeg } from '../../../components/RouteChain';

export const PastorEventRoutePlanner = ({ route, navigation }: { route: any; navigation: any }) => {
  const { events = [] } = route.params as { events: PastorEvent[] };
  const { isDark } = useTheme();
  const styles = getStyles(isDark);
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<TransportMode>('car');
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [legs, setLegs] = useState<RouteLeg[]>([]);
  const [conflicts, setConflicts] = useState<{ message: string }[]>([]);
  const [currentLocName, setCurrentLocName] = useState('');
  const [currentLoc, setCurrentLoc] = useState<{lat: number, lng: number} | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocLoading, setIsLocLoading] = useState(true);

  // Helper to convert "9:00 AM" or "1:00 PM" into a sortable minutes-since-midnight integer
  const timeToMins = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(' ');
    if (parts.length < 2) return 0;
    const [time, modifier] = parts;
    let [hours, minutes] = time.split(':');
    let h = parseInt(hours, 10);
    let m = parseInt(minutes || '0', 10);
    if (h === 12) h = 0;
    if (modifier.toUpperCase() === 'PM') h += 12;
    return h * 60 + m;
  };

  // Sort events by time to plan the route sequentially
  const sortedEvents = [...events].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  // Initialize with saved location, then IP-based fallback if none saved
  useEffect(() => {
    const fetchInitialLoc = async () => {
      try {
        setIsLocLoading(true);
        const saved = await getStartingLocation();
        if (saved && saved.lat && saved.lng && saved.name) {
          setCurrentLoc({ lat: saved.lat, lng: saved.lng });
          setCurrentLocName(saved.name);
          return;
        }

        const ipResp = await fetch('http://ip-api.com/json/');
        const ipData = await ipResp.json();
        if (ipData && ipData.lat && ipData.lon) {
          setCurrentLoc({ lat: ipData.lat, lng: ipData.lon });
          setCurrentLocName(ipData.city || 'Guntur, AP');
        }
      } catch (e) {
        console.log('IP Location failed');
      } finally {
        setIsLocLoading(false);
      }
    };
    fetchInitialLoc();
  }, []);

  // Handle manual starting address change
  const handleAddressSubmit = async (newAddress: string) => {
    if (!newAddress.trim()) return;
    const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
    if (!GOOGLE_KEY) return;
    
    setIsGeocoding(true);
    try {
      const geoResp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(newAddress)}&key=${GOOGLE_KEY}`);
      const geoData = await geoResp.json();
      if (geoData.status === 'OK' && geoData.results.length > 0) {
        const { lat, lng } = geoData.results[0].geometry.location;
        setCurrentLoc({ lat, lng });
        
        // Save back for persistence across app
        await saveStartingLocation({ name: newAddress, lat, lng });
      }
    } catch (e) {
      console.log('Geocoding failed');
    } finally {
      setIsGeocoding(false);
    }
  };

  useEffect(() => {
    // Don't calculate until we have the starting location loaded
    if (isLocLoading) return;

    const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
    
    // Generate stops list
    const generatedStops: RouteStop[] = [
      { label: currentLocName, sublabel: 'Starting Point', isHome: true }
    ];
    
    sortedEvents.forEach(evt => {
      generatedStops.push({
        label: evt.title,
        sublabel: `${evt.startTime} · ${evt.venue}`
      });
    });
    setStops(generatedStops);

    const calculateDistances = async () => {
      const generatedLegs: RouteLeg[] = [];
      
      // Calculate distances between each consecutive stop
      for (let i = 0; i < sortedEvents.length; i++) {
        const destination = sortedEvents[i];
        let originLat, originLng;
        
        if (i === 0) {
          // Travel from Current Location to 1st Event
          if (currentLoc) {
            originLat = currentLoc.lat;
            originLng = currentLoc.lng;
          } else {
            originLat = destination.lat + 0.01;
            originLng = destination.lng - 0.01;
          }
        } else {
          // Travel from Event(i-1) to Event(i)
          originLat = sortedEvents[i - 1].lat;
          originLng = sortedEvents[i - 1].lng;
        }

        let distKm = 0;
        let carMins = 0;

        if (GOOGLE_KEY && originLat !== 0 && destination.lat !== 0) {
          try {
            const destStr = `${destination.lat},${destination.lng}`;
            const originStr = `${originLat},${originLng}`;
            const distResp = await fetch(
              `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originStr}&destinations=${destStr}&key=${GOOGLE_KEY}`
            );
            const distData = await distResp.json();
            
            if (distData.status === 'OK' && distData.rows[0].elements[0].status === 'OK') {
              const element = distData.rows[0].elements[0];
              distKm = element.distance.value / 1000; // meters to km
              carMins = Math.round(element.duration.value / 60); // seconds to mins
            }
          } catch (err) {
            console.warn('Distance API failed', err);
          }
        }

        // Apply defaults or estimates for other modes if car is 0
        if (distKm === 0) distKm = 5.0; // fallback
        if (carMins === 0) carMins = Math.round(distKm * 2); // rough estimate: 2 mins per km

        let duration = carMins; // car uses Google Maps time directly
        if (mode === 'bike') duration = Math.round(carMins * 1.35); // ~70-80 km/h vs car 90-100
        else if (mode === 'bus') duration = Math.round(carMins * 1.7); // ~50-60 km/h + stops

        generatedLegs.push({
          distKm: distKm,
          minutes: duration,
          mode: mode
        });
      }

      setLegs(generatedLegs);
      setConflicts(detectConflicts(sortedEvents, generatedLegs));
    };

    calculateDistances();

  }, [mode, events, currentLoc, currentLocName, isLocLoading]);

  const handleLaunchGoogleMaps = () => {
    // Collect coordinates for the route
    // Starts at home / church location (we can use the first event's location or church)
    // and then visits all events.
    if (sortedEvents.length === 0) return;

    // Use Guntur central coordinates for home / first waypoint if empty,
    // otherwise use first event's coordinates minus a tiny offset for home, or first event directly
    const coordinates = sortedEvents.map(e => ({ lat: e.lat, lng: e.lng }));
    
    if (currentLoc && currentLoc.lat && currentLoc.lng) {
      coordinates.unshift(currentLoc);
    } else if (coordinates.length > 0) {
      // fallback if currentLoc somehow fails
      const first = coordinates[0];
      coordinates.unshift({ lat: first.lat + 0.01, lng: first.lng - 0.01 });
    }

    openRoute(coordinates);
  };

  const totalDistance = legs.reduce((acc, curr) => acc + curr.distKm, 0);
  const totalDuration = legs.reduce((acc, curr) => acc + curr.minutes, 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#000000" : "#FFFFFF"} />
      
      {/* Header */}
      <View style={[
        styles.navBar,
        {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? '#27272A' : '#CBD5E1',
          paddingTop: Platform.OS === 'android' ? Math.max(insets.top, StatusBar.currentHeight || 24) + 10 : Math.max(insets.top, 12),
          paddingBottom: 14,
          paddingHorizontal: 16,
          height: 'auto',
        }
      ]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={isDark ? '#FFFFFF' : '#0F172A'} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 18, fontWeight: '800' }]}>
          Route Planner
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Route Summaries card */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardLabel}>Itinerary Summary</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{sortedEvents.length} Stops</Text>
              <Text style={styles.statLbl}>Appointments</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={[styles.statBox, { flex: 1.1 }]}>
              <Text style={styles.statVal} numberOfLines={1}>{Math.round(totalDistance)} km</Text>
              <Text style={styles.statLbl}>Total Distance</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={[styles.statBox, { flex: 1.4 }]}>
              <Text style={styles.statVal} numberOfLines={1}>{formatDuration(totalDuration)}</Text>
              <Text style={styles.statLbl}>Travel Time</Text>
            </View>
          </View>
        </View>

        {/* Transport Mode Toggle */}
        <Text style={styles.sectionTitle}>Select Travel Mode</Text>
        <TransportToggle value={mode} onChange={setMode} />

        {/* Conflict Warning Banner */}
        {conflicts.length > 0 ? (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={24} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Schedule Conflicts Detected</Text>
              {conflicts.map((c, i) => (
                <Text key={i} style={styles.warningText}>• {c.message}</Text>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
            <Text style={styles.successText}>All travel timings align. No conflicts.</Text>
          </View>
        )}

        <View style={{ backgroundColor: isDark ? '#18181B' : '#FFFFFF', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md, borderWidth: 1, borderColor: isDark ? '#27272A' : '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.25 : 0.06, shadowRadius: 6, elevation: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#B9C8BD' : '#315C50', marginBottom: 8, textTransform: 'uppercase' }}>
            STARTING FROM
          </Text>
          {isLocLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: isDark ? '#27272A' : colors.bgSecondary, borderRadius: radius.sm }}>
              <ActivityIndicator size="small" color={isDark ? '#B9C8BD' : '#315C50'} />
              <Text style={{ marginLeft: 8, color: isDark ? '#A1A1AA' : colors.textSecondary, fontSize: 14 }}>Loading saved location...</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                style={{ flex: 1, backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderWidth: 1, borderColor: isDark ? '#3F3F46' : '#E2E8F0', padding: 12, borderRadius: radius.sm, fontSize: 15, color: isDark ? '#FFFFFF' : '#0F172A' }}
                value={currentLocName}
                onChangeText={setCurrentLocName}
                onSubmitEditing={(e) => handleAddressSubmit(e.nativeEvent.text)}
                placeholder="Type starting address..."
                placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
              />
              <TouchableOpacity
                style={{ marginLeft: spacing.sm, backgroundColor: isDark ? '#FFFFFF' : '#000000', paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.sm }}
                onPress={() => handleAddressSubmit(currentLocName)}
                disabled={isGeocoding}
              >
                {isGeocoding ? (
                  <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          <Text style={{ fontSize: 11, color: isDark ? '#A1A1AA' : colors.textTertiary, marginTop: 6 }}>
            {isLocLoading ? 'Fetching your saved location...' : isGeocoding ? 'Calculating new route...' : 'Type address and press Update'}
          </Text>
        </View>

        {/* Route Chain Visualizer */}
        <Text style={styles.sectionTitle}>Route Chain</Text>
        <View style={styles.chainCard}>
          <RouteChain stops={stops} legs={legs} />
        </View>

        {/* Launch Google Maps button */}
        <TouchableOpacity
          style={styles.actionButton}
          activeOpacity={0.8}
          onPress={handleLaunchGoogleMaps}
        >
          <Ionicons name="logo-google" size={18} color={isDark ? '#000000' : '#FFFFFF'} />
          <Text style={styles.actionButtonText}>Open Route in Google Maps</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : '#FFFFFF'
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    height: 56,
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: isDark ? '#27272A' : '#CBD5E1'
  },
  backButton: {
    padding: spacing.xs
  },
  navTitle: {
    ...typography.h2,
    color: isDark ? '#FFFFFF' : '#0F172A',
    flex: 1,
    textAlign: 'center'
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md
  },
  summaryCard: {
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? '#B9C8BD' : '#315C50',
    textTransform: 'uppercase',
    marginBottom: spacing.sm
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.xs
  },
  statBox: {
    alignItems: 'center',
    flex: 1
  },
  statVal: {
    fontSize: 15,
    fontWeight: '700',
    color: isDark ? '#FFFFFF' : '#0F172A'
  },
  statLbl: {
    fontSize: 10,
    color: isDark ? '#A1A1AA' : '#64748B',
    marginTop: 2
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: isDark ? '#27272A' : '#E2E8F0'
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#B9C8BD' : '#315C50',
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs
  },
  warningCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: isDark ? 'rgba(234, 179, 8, 0.12)' : colors.warningLight,
    borderColor: isDark ? 'rgba(234, 179, 8, 0.25)' : '#F3D299',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? '#FACC15' : colors.warning,
    marginBottom: spacing.xs
  },
  warningText: {
    fontSize: 12,
    color: isDark ? '#FEF08A' : colors.warning,
    lineHeight: 16,
    marginTop: 2
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.12)' : colors.successLight,
    borderColor: isDark ? 'rgba(34, 197, 94, 0.25)' : '#AEE4D4',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md
  },
  successText: {
    fontSize: 13,
    fontWeight: '600',
    color: isDark ? '#86EFAC' : colors.success
  },
  chainCard: {
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#FFFFFF' : '#000000',
    borderRadius: radius.full,
    paddingVertical: 14,
    gap: 8,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontSize: 15,
    fontWeight: '700'
  }
});

export default PastorEventRoutePlanner;