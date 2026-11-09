import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  StatusBar,
  TextInput,
  Platform
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { spacing, radius, typography, shadow } from '../../../theme/Theme';
import { useTheme } from '../../../context/ThemeContext';
import { PastorEvent } from '../../../types/event';
import FirestoreService from '../../../services/FirestoreService';
import EventTypeBadge from '../../../components/EventTypeBadge';
import DistanceBadge from '../../../components/DistanceBadge';
import { getStartingLocation, saveStartingLocation, formatDuration } from '../../../utils/locationStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openInMaps } from '../../../utils/maps';
import LiveJourneyTracker from '../../../components/LiveJourneyTracker';
import { AdminTabContext } from '../../../context/AdminTabContext';

export const PastorEventDashboard = ({ navigation }: { navigation: any }) => {
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const adminTab = React.useContext(AdminTabContext) as any;
  const handleBack = () => {
    if (adminTab?.setActiveTab) {
      adminTab.setActiveTab(0);
    } else if (adminTab?.goBack) {
      adminTab.goBack();
    } else if (navigation?.canGoBack?.()) {
      navigation.goBack();
    }
  };
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);
  const [events, setEvents] = useState<PastorEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'past'>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempPickerDate, setTempPickerDate] = useState(new Date());
  const [enrichedEvents, setEnrichedEvents] = useState<PastorEvent[]>([]);

  const fetchEvents = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const sfEvents = await FirestoreService.getPastorEvents();
      if (sfEvents && sfEvents.length > 0) {
        // Categorize into today, upcoming, past
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;

        const categorized = sfEvents.map(evt => {
          let section: 'today' | 'upcoming' | 'past' = 'upcoming';
          if (evt.date === todayStr) {
            section = 'today';
          } else if (evt.date < todayStr) {
            section = 'past';
          }
          return { ...evt, section };
        });
        setEvents(categorized);
      } else {
        setEvents([]);
      }
    } catch (e) {
      console.warn('Error querying Firestore events:', e);
      setEvents([]);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEvents(true);
    }, [])
  );

  useEffect(() => {
    if (route.params?.optimisticEvent) {
       const evt = route.params.optimisticEvent;
       setEvents(prev => {
          const filtered = prev.filter(e => e.id !== evt.id);
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          const todayStr = `${y}-${m}-${d}`;
          let section: 'today' | 'upcoming' | 'past' = 'upcoming';
          if (evt.date === todayStr) section = 'today';
          else if (evt.date < todayStr) section = 'past';
          return [...filtered, { ...evt, section }];
       });
       navigation.setParams({ optimisticEvent: undefined });
       fetchEvents(true);
    }
    if (route.params?.deleteEventId) {
       setEvents(prev => prev.filter(e => e.id !== route.params.deleteEventId));
       navigation.setParams({ deleteEventId: undefined });
       fetchEvents(true);
    }
    if (route.params?.refresh) {
      fetchEvents(false);
      navigation.setParams({ refresh: undefined });
    }
  }, [route.params?.refresh, route.params?.optimisticEvent, route.params?.deleteEventId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents();
  }, []);

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

  const filteredEvents = (selectedDateFilter
    ? events.filter(evt => evt.date === selectedDateFilter)
    : events.filter(evt => evt.section === activeTab)
  ).sort((a, b) => {
    if (a.date !== b.date) {
      return activeTab === 'past'
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date);
    }
    return activeTab === 'past'
      ? timeToMins(b.startTime) - timeToMins(a.startTime)
      : timeToMins(a.startTime) - timeToMins(b.startTime);
  });

  const [dynamicStats, setDynamicStats] = useState({ km: 0, mins: 0, loading: false });
  const [currentLocName, setCurrentLocName] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const initLocation = async () => {
      try {
        const saved = await getStartingLocation();
        if (saved && saved.name) {
          if (isMounted) setCurrentLocName(saved.name);
        } else {
          const ipResp = await fetch('http://ip-api.com/json/');
          const ipData = await ipResp.json();
          if (ipData && ipData.city) {
            if (isMounted) setCurrentLocName(ipData.city);
          }
        }
      } catch (e) {}
    };
    initLocation();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isActive = true;

    const calcStats = async () => {
      setDynamicStats({ km: 0, mins: 0, loading: true });
      
      let prevLat = 16.3067; // Fallback
      let prevLng = 80.4365;

      try {
        const saved = await getStartingLocation();
        if (saved && saved.lat && saved.lng && saved.name) {
          prevLat = saved.lat;
          prevLng = saved.lng;
        } else {
          const ipResp = await fetch('http://ip-api.com/json/');
          const ipData = await ipResp.json();
          if (ipData && ipData.lat && ipData.lon) {
            prevLat = ipData.lat;
            prevLng = ipData.lon;
          }
        }
      } catch (e) {
        // Fallback to Guntur if location fails
      }

      const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
      if (!GOOGLE_KEY || filteredEvents.length === 0) {
        if (isActive) {
          setDynamicStats({ km: 0, mins: 0, loading: false });
          setEnrichedEvents(filteredEvents);
        }
        return;
      }
      
      try {
        let totalKm = 0;
        let totalMins = 0;


        let currentOriginLat = prevLat;
        let currentOriginLng = prevLng;
        let currentOriginName = currentLocName || 'Home';
        
        const homeLat = prevLat;
        const homeLng = prevLng;
        const homeName = currentOriginName;
        
        let isFirstValidEvent = true;
        let currentDayStr = '';

        const newEnrichedEvents = [...filteredEvents];
        for (let i = 0; i < newEnrichedEvents.length; i++) {
          const evt = newEnrichedEvents[i];
          if (!evt.lat || !evt.lng) {
            const geocodeQuery = evt.city ? `${evt.address?.trim() || ''}, ${evt.city?.trim() || ''}` : (evt.address?.trim() || evt.venue?.trim() || '');
            let geocodeSuccess = false;
            
            const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
            if (GOOGLE_KEY) {
              try {
                const geoResp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(geocodeQuery)}&key=${GOOGLE_KEY}`);
                const geoData = await geoResp.json();
                if (geoData.status === 'OK' && geoData.results.length > 0) {
                  evt.lat = geoData.results[0].geometry.location.lat;
                  evt.lng = geoData.results[0].geometry.location.lng;
                  geocodeSuccess = true;
                }
              } catch (e: any) {
              }
            }
            
            // Fallback to free OpenStreetMap Nominatim API if Google Maps fails (e.g., due to billing issues)
            if (!geocodeSuccess) {
              try {
                const fallbackQuery = evt.city ? `${evt.venue?.trim() || ''}, ${evt.city?.trim() || ''}` : geocodeQuery;
                const osmResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}`);
                const osmData = await osmResp.json();
                if (osmData && osmData.length > 0) {
                  evt.lat = parseFloat(osmData[0].lat);
                  evt.lng = parseFloat(osmData[0].lon);
                  geocodeSuccess = true;
                }
              } catch (e: any) {
              }
            }
          }

          if (evt.lat && evt.lng) {
            if (evt.date !== currentDayStr) {
              currentDayStr = evt.date;
              isFirstValidEvent = true;
              currentOriginLat = homeLat;
              currentOriginLng = homeLng;
              currentOriginName = homeName;
            }
            
            // Calculate distance from last valid location to current event
            const originStr = `${currentOriginLat},${currentOriginLng}`;
            const destStr = `${evt.lat},${evt.lng}`;
            
            const fetchDist = async (orig: string, dest: string) => {
              const cacheKey = `dist_${orig}_${dest}`;
              try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) return JSON.parse(cached);
              } catch (e) {}
              
              try {
                const distResp = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${orig}&destinations=${dest}&key=${GOOGLE_KEY}`);
                const distData = await distResp.json();
                if (distData.status === 'OK' && distData.rows[0].elements[0].status === 'OK') {
                  const el = distData.rows[0].elements[0];
                  const res = { distance: el.distance.value, duration: el.duration.value };
                  AsyncStorage.setItem(cacheKey, JSON.stringify(res)).catch(()=>{});
                  return res;
                }
              } catch (e) {}
              
              // Fallback to OSRM (Open Source Routing Machine) if Google Maps fails
              try {
                const [origLat, origLng] = orig.split(',');
                const [destLat, destLng] = dest.split(',');
                const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origLng},${origLat};${destLng},${destLat}?overview=false`;
                const osrmResp = await fetch(osrmUrl);
                const osrmData = await osrmResp.json();
                if (osrmData.code === 'Ok' && osrmData.routes.length > 0) {
                  const r = osrmData.routes[0];
                  const res = { distance: r.distance, duration: r.duration };
                  AsyncStorage.setItem(cacheKey, JSON.stringify(res)).catch(()=>{});
                  return res;
                }
              } catch (e) {}
              
              return { distance: 0, duration: 0 };
            };
            
            const routeResult = await fetchDist(originStr, destStr);
            let distanceValue = routeResult.distance;
            let durationValue = routeResult.duration;
            
            let homeDistanceValue = 0;
            let homeDurationValue = 0;
            
            if (!isFirstValidEvent) {
              const homeOriginStr = `${homeLat},${homeLng}`;
              const homeRouteResult = await fetchDist(homeOriginStr, destStr);
              homeDistanceValue = homeRouteResult.distance;
              homeDurationValue = homeRouteResult.duration;
            }

            if (distanceValue >= 0) {
              const travelData: any = {
                ...evt.travel,
                distKm: distanceValue / 1000,
                car: Math.round(durationValue / 60),
                isHomeToEvent: isFirstValidEvent,
                originLat: currentOriginLat,
                originLng: currentOriginLng,
                originName: currentOriginName
              };
              
              if (!isFirstValidEvent && homeDistanceValue >= 0) {
                travelData.homeDistKm = homeDistanceValue / 1000;
                travelData.homeCar = Math.round(homeDurationValue / 60);
                travelData.homeLat = homeLat;
                travelData.homeLng = homeLng;
                travelData.homeName = homeName;
              }
              
              newEnrichedEvents[i] = {
                ...evt,
                travel: travelData
              };
              isFirstValidEvent = false;
              currentOriginLat = evt.lat;
              currentOriginLng = evt.lng;
              currentOriginName = evt.city || evt.venue || evt.title || 'Previous Location';
            }
            
            totalKm += distanceValue / 1000;
            totalMins += Math.round(durationValue / 60);
          }
        }
        
        if (isActive) {
          setEnrichedEvents(newEnrichedEvents);
          setDynamicStats({ km: totalKm, mins: totalMins, loading: false });
        }
      } catch(e) {
        console.warn('Dashboard stats calc failed', e);
        if (isActive) {
          setDynamicStats(prev => ({ ...prev, loading: false }));
        }
      }
    };

    calcStats();
    
    return () => { isActive = false; };
  }, [activeTab, selectedDateFilter, events]);

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
        await saveStartingLocation({ name: newAddress, lat, lng });
        
        // Force refresh by triggering calcStats via a dummy state change if needed, 
        // or just let currentLocName trigger it if we added it to deps. But wait, we didn't. 
        // Let's just fetchEvents() or we can just update the events state implicitly.
        fetchEvents();
      }
    } catch (e) {
      console.log('Geocoding failed');
    } finally {
      setIsGeocoding(false);
    }
  };

  // Statistics summaries
  const totalEvents = filteredEvents.length;
  const totalDistance = dynamicStats.km;
  const totalTravelTimeCar = dynamicStats.mins;

  const formatEventDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts;
        const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `${days[dateObj.getDay()]} ${d}-${m}-${y}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const renderEventCard = ({ item, index }: { item: PastorEvent, index: number }) => {
    return (
      <TouchableOpacity 
        style={styles.card} 
        key={item.id}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('EventDetail', { event: item, allEvents: events })}
      >
        <Text style={[styles.titleText, { marginBottom: 12, color: isDark ? '#C6A66B' : '#98713D' }]}>{item.title}</Text>
        
        <View style={{ gap: 6, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={14} color={isDark ? '#FFFFFF' : '#000000'} />
            <Text style={[styles.timeText, { marginLeft: 6 }]}>{formatEventDate(item.date)}</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="time-outline" size={14} color={isDark ? '#FFFFFF' : '#000000'} />
            <Text style={[styles.timeText, { marginLeft: 6 }]}>
              Start: {item.startTime}{item.endTime ? ` | End: ${item.endTime}` : ''}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="hourglass-outline" size={14} color={isDark ? '#FFFFFF' : '#000000'} />
            <Text style={[styles.timeText, { marginLeft: 6, color: isDark ? '#94A3B8' : '#64748B' }]}>
              Meeting length: {item.durationMins >= 60 ? `${Math.round(item.durationMins / 60 * 10) / 10} hours` : `${item.durationMins} mins`}
            </Text>
          </View>
        </View>

        {/* Venue & Location Section */}
        <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1.5, borderTopColor: isDark ? '#3F3F46' : '#CBD5E1' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#B9C8BD' : '#315C50', textTransform: 'uppercase', marginBottom: 4 }}>Venue & Location</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#FFFFFF' : '#111827', marginBottom: 2 }}>{item.venue || 'No venue provided'}</Text>
          {item.city && (
            <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#B9C8BD' : '#315C50', marginBottom: 2 }}>{item.city}</Text>
          )}
          {item.address && item.address !== item.venue && (
            <Text style={{ fontSize: 12, color: isDark ? '#A1A1AA' : '#64748B', marginBottom: 8 }}>{item.address}</Text>
          )}
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#27272A' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#CBD5E1', paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, alignSelf: 'flex-start', marginTop: 4, marginBottom: 12 }}
            onPress={() => openInMaps(item.lat || 0, item.lng || 0, item.title, [item.venue, item.address, item.city].filter(Boolean).join(', '))}
          >
            <Ionicons name="navigate-outline" size={16} color={isDark ? '#FFFFFF' : '#0F172A'} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#FFFFFF' : '#0F172A', marginLeft: 6 }}>Get Directions</Text>
          </TouchableOpacity>
          
          {/* Travel Distance Info - Live Tracker */}
          {!!item.lat && !!item.lng && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#A78BFA' : '#6D28D9', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Live Journey Tracker</Text>
              <LiveJourneyTracker
                eventId={item.id || Math.random().toString()}
                home={{ 
                  lat: item.travel?.originLat || 15.8281, 
                  lng: item.travel?.originLng || 78.0373, 
                  name: item.travel?.originName || (item.travel?.isHomeToEvent ? 'Home' : 'Previous Location') 
                }}
                destination={{ lat: item.lat, lng: item.lng }}
                destinationName={item.city || (item.address || item.venue || 'Event').split(',')[0].trim()}
                initialDistanceKm={item.travel?.distKm || 0}
                initialDurationMins={item.travel?.car || 0}
                isDisabled={item.section !== 'today'}
                altHome={(!item.travel?.isHomeToEvent && item.travel?.homeLat && item.travel?.homeLng) ? {
                  lat: item.travel.homeLat,
                  lng: item.travel.homeLng,
                  name: item.travel.homeName || 'Home'
                } : undefined}
                altInitialDistanceKm={item.travel?.homeDistKm || 0}
                altInitialDurationMins={item.travel?.homeCar || 0}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#000000" : "#FFFFFF"} />
      
      {/* ── Top Header (Centered Title, Border Line, No Blue) ── */}
      <View style={[
        styles.headerContainer,
        {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? '#27272A' : '#CBD5E1',
        }
      ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          
          <TouchableOpacity 
            onPress={handleBack} 
            style={{ padding: 6 }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color={isDark ? '#FFFFFF' : '#0F172A'} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Pastor's Itinerary</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity 
              onPress={() => setShowDatePicker(true)} 
              style={{ padding: 6 }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="calendar-outline" size={22} color={isDark ? '#FFFFFF' : '#0F172A'} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => navigation.navigate('CreateEvent', { allEvents: events })} 
              style={{ padding: 6 }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={26} color={isDark ? '#FFFFFF' : '#0F172A'} />
            </TouchableOpacity>
          </View>

        </View>
      </View>

      <ScrollView 
        contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? 140 : 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >

      {showDatePicker && (
        <DateTimePicker
          value={tempPickerDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setTempPickerDate(selectedDate);
              const y = selectedDate.getFullYear();
              const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
              const d = String(selectedDate.getDate()).padStart(2, '0');
              setSelectedDateFilter(`${y}-${m}-${d}`);
            }
          }}
        />
      )}

      {/* Tabs */}
      <View style={[
        styles.tabsContainer,
        {
          backgroundColor: isDark ? '#27272A' : '#F8FAFC',
          borderWidth: 1.5,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1',
        }
      ]}>
        {(['today', 'upcoming', 'past'] as const).map((tab) => {
          const isActive = activeTab === tab && !selectedDateFilter;

          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab, 
                isActive && {
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.25 : 0.15,
                  shadowRadius: 3,
                  elevation: 2,
                },
                selectedDateFilter && styles.disabledTab
              ]}
              onPress={() => {
                setSelectedDateFilter(null);
                setActiveTab(tab);
              }}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.tabText,
                { color: isDark ? '#A1A1AA' : '#64748B' },
                isActive && {
                  color: isDark ? '#000000' : '#FFFFFF',
                  fontWeight: '800'
                }
              ]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Date Filter Indicator Banner */}
      {selectedDateFilter && (
        <View style={styles.filterBanner}>
          <View style={styles.filterBannerLeft}>
            <Ionicons name="funnel-outline" size={14} color={colors.primary} />
            <Text style={styles.filterBannerText}>
              Filtered: {new Date(selectedDateFilter).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.clearFilterButton} 
            onPress={() => setSelectedDateFilter(null)}
          >
            <Text style={styles.clearFilterText}>Show All</Text>
            <Ionicons name="close-circle" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Starting Location Bar */}
      <View style={{
        backgroundColor: isDark ? '#18181B' : '#FFFFFF',
        padding: spacing.md,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: isDark ? '#27272A' : '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.25 : 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#A1A1AA' : '#64748B', marginBottom: 6 }}>
          STARTING FROM
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: isDark ? '#27272A' : '#F8FAFC',
              padding: 10,
              borderRadius: radius.sm,
              fontSize: 14,
              color: isDark ? '#FFFFFF' : '#0F172A',
              borderWidth: 1.5,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1',
            }}
            value={currentLocName}
            onChangeText={setCurrentLocName}
            onSubmitEditing={(e) => handleAddressSubmit(e.nativeEvent.text)}
            placeholder="Type starting address..."
            placeholderTextColor={isDark ? '#94A3B8' : '#94A3B8'}
          />
          <TouchableOpacity 
            style={{
              marginLeft: spacing.sm,
              backgroundColor: isDark ? '#FFFFFF' : '#000000',
              paddingHorizontal: spacing.md,
              paddingVertical: 10,
              borderRadius: radius.sm
            }}
            onPress={() => handleAddressSubmit(currentLocName)}
            disabled={isGeocoding}
          >
            {isGeocoding ? (
              <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
            ) : (
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Update</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 11, color: isDark ? '#A1A1AA' : '#64748B', marginTop: 6 }}>
          {isGeocoding ? 'Calculating new distances...' : 'Type address and press Update'}
        </Text>
      </View>

      {/* Stats Strip */}
      <View style={styles.statsStrip}>
        <View style={[styles.statBox, { flex: 0.8 }]}>
          <Text style={styles.statVal}>{totalEvents}</Text>
          <Text style={styles.statLbl}>Events</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={[styles.statBox, { flex: 1.1 }]}>
          <Text style={styles.statVal} numberOfLines={1}>{Math.round(totalDistance)} km</Text>
          <Text style={styles.statLbl}>Travel Dist</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={[styles.statBox, { flex: 1.4 }]}>
          <Text style={styles.statVal} numberOfLines={1}>{formatDuration(totalTravelTimeCar)}</Text>
          <Text style={styles.statLbl}>Travel Time</Text>
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : enrichedEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No events found for {activeTab}</Text>
        </View>
      ) : (
        <View style={{ padding: spacing.lg, paddingBottom: 40 }}>
          {enrichedEvents.map((item, index) => renderEventCard({ item, index }))}
        </View>
      )}
      </ScrollView>

      {/* Floating Buttons */}
      <View style={[
        styles.floatingButtonsContainer,
        {
          bottom: Platform.OS === 'android' ? Math.max(insets.bottom, 24) + 24 : Math.max(insets.bottom, 16) + 16,
        }
      ]}>
        <TouchableOpacity
          style={[
            styles.floatingButton,
            {
              backgroundColor: isDark ? '#FFFFFF' : '#000000',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.35 : 0.2,
              shadowRadius: 8,
              elevation: 6,
            }
          ]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('RoutePlanner', { events: filteredEvents })}
        >
          <Ionicons name="trail-sign" size={20} color={isDark ? '#000000' : '#FFFFFF'} />
          <Text style={[styles.floatingButtonText, { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }]}>
            Route Plan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.floatingButton,
            {
              backgroundColor: isDark ? '#27272A' : '#1E293B',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#334155',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.35 : 0.2,
              shadowRadius: 8,
              elevation: 6,
            }
          ]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('EventMap', { events: filteredEvents })}
        >
          <Ionicons name="map" size={20} color="#FFFFFF" />
          <Text style={[styles.floatingButtonText, { color: '#FFFFFF', fontWeight: '800' }]}>
            Map View
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

function getStyles(colors: any, isDark: boolean) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : '#F8FAFC',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 12,
    paddingBottom: 14,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: isDark ? '#FFFFFF' : '#0F172A',
  },
  welcomeText: {
    ...typography.h1,
    color: colors.text
  },
  subtitleText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  refreshButton: {
    padding: spacing.sm,
    backgroundColor: colors.border,
    borderRadius: radius.full
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    marginVertical: spacing.sm,
    borderWidth: 1,
    padding: 4,
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  activeTab: {
    // handled dynamically in JSX now
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600'
  },
  activeTabText: {
    // handled dynamically in JSX now
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#CBD5E1',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statBox: {
    alignItems: 'center',
    flex: 1
  },
  statVal: {
    fontSize: 16,
    fontWeight: '700',
    color: isDark ? '#FFFFFF' : '#0F172A',
  },
  statLbl: {
    fontSize: 10,
    color: isDark ? '#A1A1AA' : '#64748B',
    textTransform: 'uppercase',
    marginTop: 2
  },
  statDivider: {
    width: 2,
    height: 28,
    backgroundColor: isDark ? '#3F3F46' : '#94A3B8',
    borderRadius: 1,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 100
  },
  card: {
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#F1F5F9' : '#0F172A',
  },
  titleText: {
    ...typography.h3,
    color: isDark ? '#C6A66B' : '#98713D',
    marginBottom: spacing.sm,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4
  },
  venueText: {
    fontSize: 12,
    color: colors.textSecondary
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm
  },
  addressText: {
    fontSize: 12,
    color: colors.textSecondary
  },
  travelContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  travelLabel: {
    fontSize: 11,
    color: colors.textSecondary
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl
  },
  emptyText: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.md
  },
  emptySubtext: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  floatingButtonsContainer: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    gap: 12
  },
  floatingButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    gap: 8,
    ...shadow.card
  },
  floatingButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700'
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionIconButton: {
    padding: spacing.sm,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38
  },
  disabledTab: {
    opacity: 0.6
  },
  filterBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    marginHorizontal: spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#E2E8F0',
    marginVertical: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  filterBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  filterBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary
  },
  clearFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary
  }
});
}

export default PastorEventDashboard;