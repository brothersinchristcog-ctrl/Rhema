import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { spacing, radius, typography, shadow } from '../../../theme/Theme';
import { useTheme } from '../../../context/ThemeContext';
import FirestoreService from '../../../services/FirestoreService';
import { useAuth } from '../../../context/AuthContext';
import { CustomAlert, AlertButton } from '../../../components/CustomAlert';
import { checkScheduleConflicts, checkTravelConflicts } from '../../../utils/schedule';

export const CreatePastorEvent = ({ route, navigation }: { route: any; navigation: any }) => {
  const { member } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, isDark);
  const [loading, setLoading] = useState(false);
  // fallbackContactId removed for Firebase

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    buttons?: AlertButton[];
  }>({ visible: false, title: '', message: '', type: 'info' });

  const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Form State
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('');
  const [date, setDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return d;
  });
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  // UI state for Pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Wizard state
  const [step, setStep] = useState(1);

  // Derived state
  const durationMinsNum = Math.max(0, (endTime.getTime() - startTime.getTime()) / 60000);
  const durationHoursDerived = durationMinsNum > 0 ? (durationMinsNum / 60).toFixed(1).replace(/\.0$/, '') : '0';

  const editEvent = route?.params?.editEvent;
  const allEvents = route?.params?.allEvents || [];

  useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title || '');
      setEventType(editEvent.type === 'worship' ? '' : editEvent.type);
      
      if (editEvent.date) setDate(new Date(editEvent.date));
      
      if (editEvent.startTime) {
        const timeDate = new Date();
        const [time, modifier] = editEvent.startTime.split(' ');
        if (time && modifier) {
          let [hours, minutes] = time.split(':');
          let h = parseInt(hours, 10);
          if (h === 12) h = 0;
          if (modifier.toUpperCase() === 'PM') h += 12;
          timeDate.setHours(h, parseInt(minutes || '0', 10), 0, 0);
          setStartTime(timeDate);
          
          if (editEvent.durationMins) {
            setEndTime(new Date(timeDate.getTime() + editEvent.durationMins * 60000));
          } else {
            setEndTime(new Date(timeDate.getTime() + 60 * 60000));
          }
        }
      }
      
      setVenue(editEvent.venue || '');
      setCity(editEvent.city || '');
      
      let addr = editEvent.address || '';
      if (editEvent.venue && addr.startsWith(`${editEvent.venue} — `)) {
        addr = addr.substring(editEvent.venue.length + 3);
      }
      setAddress(addr);
      setDescription(editEvent.description || '');
    }
  }, [editEvent]);

  // Firebase does not require Salesforce Admin Contact record resolution

  const handleNext = () => {
    setErrors({});
    let newErrors: { [key: string]: string } = {};

    if (step === 1) {
      if (!title.trim()) newErrors.title = 'Please enter an event title.';
      if (endTime <= startTime) newErrors.time = 'End Time must be greater than Start Time.';
      
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!venue.trim()) newErrors.venue = 'Please enter a venue name.';
      if (!city.trim()) newErrors.city = 'Please enter a Town / Village.';
      if (!address.trim()) newErrors.address = 'Please enter a full address for maps integration.';
      
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
      setStep(3);
    }
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSave = async () => {
    setErrors({});
    let newErrors: { [key: string]: string } = {};

    if (!title.trim()) newErrors.title = 'Please enter an event title.';
    if (!venue.trim()) newErrors.venue = 'Please enter a venue name.';
    if (!city.trim()) newErrors.city = 'Please enter a Town / Village.';
    if (!address.trim()) newErrors.address = 'Please enter a full address for maps integration.';
    if (endTime <= startTime) newErrors.time = 'End Time must be greater than Start Time.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Determine which step has errors to navigate back to it
      if (newErrors.title || newErrors.time) setStep(1);
      else if (newErrors.venue || newErrors.city || newErrors.address) setStep(2);
      return;
    }

    // Firebase migration: targetContactId requirement removed

    setLoading(true);

    try {
      // Calculate start and end date times
      const startDateTime = new Date(date);
      startDateTime.setHours(startTime.getHours());
      startDateTime.setMinutes(startTime.getMinutes());
      startDateTime.setSeconds(0);
      startDateTime.setMilliseconds(0);

      const endDateTime = new Date(startDateTime.getTime() + durationMinsNum * 60 * 1000);

      // Build full address with PIN code for geocoding
      const fullLocation = [venue.trim(), city.trim(), address.trim()]
        .filter(Boolean)
        .join(' — ');

      const dateFormatted = date.toISOString().split('T')[0];
      const startFormatted = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/^0/, '');
      const endFormatted = endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/^0/, '');

      const executeSave = async () => {
        try {
          let lat = 0;
          let lng = 0;
          try {
            const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
            if (GOOGLE_KEY) {
              const geocodeQuery = city ? `${address.trim()}, ${city.trim()}` : address.trim();
              const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(geocodeQuery)}&key=${GOOGLE_KEY}`);
              const data = await resp.json();
              if (data.status === 'OK' && data.results?.length > 0) {
                lat = data.results[0].geometry.location.lat;
                lng = data.results[0].geometry.location.lng;
              }
            }
          } catch(e) {}

          const firebasePayload: any = {
            title: title.trim(),
            type: eventType || 'meeting',
            date: dateFormatted,
            startTime: startFormatted,
            endTime: endFormatted,
            durationMins: durationMinsNum,
            venue: venue.trim(),
            city: city.trim(),
            address: address.trim(),
            lat: lat,
            lng: lng,
            description: description.trim(),
            notes: notes.trim(),
          };

          const optimisticEvent: any = {
            id: editEvent ? editEvent.id : 'temp_' + Date.now(),
            ...firebasePayload,
            travel: { distKm: 0, car: 0, bike: 0, bus: 0 }
          };

          if (editEvent) {
            await FirestoreService.updatePastorEvent(editEvent.id, firebasePayload).catch(e => console.warn('Update failed:', e));
          } else {
            await FirestoreService.createPastorEvent(firebasePayload).catch(e => console.warn('Create failed:', e));
          }
          
          setLoading(false);
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('AdminRoot');
          }
        } catch (e: any) {
          const msg = e?.message || 'An unexpected error occurred.';
          console.error('❌ [CreatePastorEvent] Save failed:', msg);
          setAlertConfig({ visible: true, title: 'Save Failed', message: msg, type: 'error' });
        } finally {
          setLoading(false);
        }
      };

      let existingEvents: any[] = allEvents;
      if (!existingEvents || existingEvents.length === 0) {
        try {
          existingEvents = await FirestoreService.getPastorEvents();
        } catch (e) {
          existingEvents = [];
        }
      }

      // --- Schedule Overlap Conflict Detection ---
      try {
        const conflicts = await checkScheduleConflicts(
          startDateTime.toISOString(),
          startDateTime.getTime(),
          durationMinsNum,
          editEvent?.id,
          existingEvents
        );
        
        if (conflicts && conflicts.length > 0) {
          setAlertConfig({
            visible: true,
            title: 'Schedule Conflict',
            message: `You already have another event scheduled at this exact same time:\n\n${conflicts.join('\n')}\n\nAre you sure you want to double-book?`,
            type: 'warning',
            buttons: [
              { text: 'Cancel', style: 'cancel', onPress: () => { setLoading(false); closeAlert(); } },
              { text: 'Proceed Anyway', onPress: () => { closeAlert(); executeSave(); } }
            ]
          });
          return; // Pause here!
        }
      } catch (err) {
        console.warn('Overlap check failed', err);
      }

      // --- Travel Distance Conflict Detection ---
      try {
        const travelConflicts = await checkTravelConflicts(
          startDateTime.toISOString(),
          startDateTime.getTime(),
          durationMinsNum,
          fullLocation,
          editEvent?.id,
          existingEvents
        );
        
        if (travelConflicts && travelConflicts.length > 0) {
          setAlertConfig({
            visible: true,
            title: 'Travel Time Conflict',
            message: `You might not have enough time to travel between your scheduled events:\n\n${travelConflicts.join('\n\n')}\n\nAre you sure you want to proceed?`,
            type: 'warning',
            buttons: [
              { text: 'Cancel', style: 'cancel', onPress: () => { setLoading(false); closeAlert(); } },
              { text: 'Proceed Anyway', onPress: () => { closeAlert(); executeSave(); } }
            ]
          });
          return; // Pause here!
        }
      } catch (err) {
        console.warn('Travel overlap check failed', err);
      }

      await executeSave();

    } catch (e: any) {
      const msg = e?.message || 'An unexpected error occurred.';
      console.error('❌ [CreatePastorEvent] Pre-save failed:', msg);
      setAlertConfig({ visible: true, title: 'Save Failed', message: msg, type: 'error' });
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#000000" : "#FFFFFF"} />
      
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
        onClose={closeAlert}
      />
      
      {/* ── Top Header Card (Moved Down Below Notifications, Theme Aware) ── */}
      <View style={[
        styles.header,
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
        <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 18, fontWeight: '800' }]}>
          {editEvent ? 'Edit Pastor Event' : 'Create Pastor Event'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Step Indicator (Track Circles 1, 2, 3) */}
      <View style={[styles.stepContainer, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
        {[1, 2, 3].map((s) => {
          const isCircleActive = step >= s;
          const isLineActive = step > s;
          return (
            <React.Fragment key={s}>
              <View style={[
                styles.stepCircle,
                {
                  backgroundColor: isCircleActive 
                    ? (isDark ? '#FFFFFF' : '#000000') 
                    : (isDark ? '#27272A' : '#F1F5F9'),
                  borderColor: isCircleActive 
                    ? (isDark ? '#FFFFFF' : '#000000') 
                    : (isDark ? 'rgba(255, 255, 255, 0.2)' : '#CBD5E1'),
                }
              ]}>
                <Text style={[
                  styles.stepText,
                  {
                    color: isCircleActive 
                      ? (isDark ? '#000000' : '#FFFFFF') 
                      : (isDark ? '#A1A1AA' : '#64748B'),
                    fontWeight: '800'
                  }
                ]}>
                  {s}
                </Text>
              </View>
              {s < 3 && (
                <View style={[
                  styles.stepLine,
                  {
                    backgroundColor: isLineActive 
                      ? (isDark ? '#FFFFFF' : '#000000') 
                      : (isDark ? '#3F3F46' : '#E2E8F0'),
                  }
                ]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <View style={[styles.stepLabels, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
        <Text style={[
          styles.stepLabelText,
          { color: step >= 1 ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? '#A1A1AA' : '#64748B') },
          step >= 1 && { fontWeight: '700' }
        ]}>Event Info</Text>
        <Text style={[
          styles.stepLabelText,
          { textAlign: 'center', color: step >= 2 ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? '#A1A1AA' : '#64748B') },
          step >= 2 && { fontWeight: '700' }
        ]}>Destination</Text>
        <Text style={[
          styles.stepLabelText,
          { textAlign: 'right', color: step >= 3 ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? '#A1A1AA' : '#64748B') },
          step >= 3 && { fontWeight: '700' }
        ]}>Notes</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Event Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Event Title *</Text>
              <TextInput
                style={[styles.input, errors.title && { borderColor: '#ef4444', borderWidth: 1 }]}
                placeholderTextColor={colors.textSecondary}
                placeholder="e.g. Sunday Service & Prayer"
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  if (errors.title) setErrors({ ...errors, title: '' });
                }}
              />
              {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Event Type</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={colors.textSecondary}
                placeholder="e.g. Worship Service, Prayer Meeting"
                value={eventType}
                onChangeText={setEventType}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date *</Text>
              <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dropdownText}>
                  {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) setDate(selectedDate);
                  }}
                />
              )}
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Start Time *</Text>
                <TouchableOpacity style={styles.dropdown} onPress={() => setShowTimePicker(true)}>
                  <Text style={styles.dropdownText}>
                    {startTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </Text>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                {showTimePicker && (
                  <DateTimePicker
                    value={startTime}
                    mode="time"
                    display="default"
                    is24Hour={false}
                    onChange={(event, selectedTime) => {
                      setShowTimePicker(false);
                      if (selectedTime) setStartTime(selectedTime);
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: spacing.md }]}>
                <Text style={styles.label}>End Time *</Text>
                <TouchableOpacity 
                  style={[styles.dropdown, errors.time && { borderColor: '#ef4444', borderWidth: 1 }]} 
                  onPress={() => setShowEndTimePicker(true)}
                >
                  <Text style={styles.dropdownText}>
                    {endTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </Text>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                {showEndTimePicker && (
                  <DateTimePicker
                    value={endTime}
                    mode="time"
                    display="default"
                    is24Hour={false}
                    onChange={(event, selectedTime) => {
                      setShowEndTimePicker(false);
                      if (selectedTime) {
                        setEndTime(selectedTime);
                        if (errors.time) setErrors({ ...errors, time: '' });
                      }
                    }}
                  />
                )}
              </View>
            </View>
            {errors.time && <Text style={[styles.errorText, { marginTop: -8, marginBottom: 12 }]}>{errors.time}</Text>}

            <View style={[styles.inputGroup, { marginTop: spacing.md }]}>
              <Text style={styles.label}>Meeting Length (Calculated)</Text>
              <View style={[styles.input, { backgroundColor: isDark ? '#27272A' : '#F8FAFC', justifyContent: 'center' }]}>
                <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontWeight: '600' }}>
                  {durationHoursDerived} Hour{parseFloat(durationHoursDerived) !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Destination</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Venue Name *</Text>
              <TextInput
                style={[styles.input, errors.venue && { borderColor: '#ef4444', borderWidth: 1 }]}
                placeholderTextColor={colors.textSecondary}
                placeholder="e.g. Calvary Temple"
                value={venue}
                onChangeText={(text) => {
                  setVenue(text);
                  if (errors.venue) setErrors({ ...errors, venue: '' });
                }}
              />
              {errors.venue && <Text style={styles.errorText}>{errors.venue}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Town / Village * (For Live Tracker Landmark)</Text>
              <TextInput
                style={[styles.input, errors.city && { borderColor: '#ef4444', borderWidth: 1 }]}
                placeholderTextColor={colors.textSecondary}
                placeholder="e.g. Guntur"
                value={city}
                onChangeText={(text) => {
                  setCity(text);
                  if (errors.city) setErrors({ ...errors, city: '' });
                }}
              />
              {errors.city && <Text style={styles.errorText}>{errors.city}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Address * (Used for Maps Routing)</Text>
              <TextInput
                style={[styles.input, styles.textArea, errors.address && { borderColor: '#ef4444', borderWidth: 1 }]}
                placeholderTextColor={colors.textSecondary}
                placeholder="e.g. Ring Road, Arundelpet, Guntur, AP, 522002"
                multiline
                numberOfLines={3}
                value={address}
                onChangeText={(text) => {
                  setAddress(text);
                  if (errors.address) setErrors({ ...errors, address: '' });
                }}
              />
              {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Additional Context</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                placeholderTextColor={colors.textSecondary}
                placeholder="What is this itinerary appointment for?"
                multiline
                numberOfLines={6}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Special Notes</Text>
              <TextInput
                style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                placeholderTextColor={colors.textSecondary}
                placeholder="Any items to bring, contacts to meet, or preparations to make?"
                multiline
                numberOfLines={6}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>
        )}

        {/* Navigation Buttons */}
        <View style={styles.navigationRow}>
          {step > 1 && (
            <TouchableOpacity 
              style={[
                styles.prevButton,
                {
                  backgroundColor: isDark ? '#27272A' : '#F8FAFC',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#CBD5E1',
                }
              ]} 
              onPress={handlePrev} 
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={[styles.prevButtonText, { color: isDark ? '#FFFFFF' : '#0F172A', fontWeight: '700' }]}>Back</Text>
            </TouchableOpacity>
          )}
          
          {step < 3 ? (
            <TouchableOpacity 
              style={[
                styles.nextButton,
                {
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.3 : 0.15,
                  shadowRadius: 4,
                  elevation: 3,
                }
              ]} 
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={[styles.saveButtonText, { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }]}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  flex: 1,
                  marginTop: 0,
                  marginBottom: 0,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.3 : 0.15,
                  shadowRadius: 4,
                  elevation: 3,
                },
                loading && styles.saveButtonDisabled
              ]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color={isDark ? '#000000' : '#FFFFFF'} />
                  <Text style={[styles.saveButtonText, { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }]}>
                    {editEvent ? 'Update Event' : 'Create Event'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

function getStyles(colors: any, isDark: boolean) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  backButton: {
    padding: spacing.xs
  },
  headerTitle: {
    ...typography.h2,
    color: isDark ? '#FFFFFF' : '#0F172A',
    flex: 1,
    textAlign: 'center'
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md
  },
  card: {
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: isDark ? '#27272A' : '#CBD5E1',
    ...shadow.card
  },
  cardTitle: {
    ...typography.h3,
    color: isDark ? '#FFFFFF' : '#0F172A',
    marginBottom: spacing.md,
    borderBottomWidth: 1.5,
    borderBottomColor: isDark ? '#27272A' : '#CBD5E1',
    paddingBottom: spacing.xs
  },
  inputGroup: {
    marginBottom: spacing.md
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#94A3B8' : '#64748B',
    marginBottom: spacing.xs
  },
  input: {
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: 14,
    color: isDark ? '#FFFFFF' : '#0F172A',
    backgroundColor: isDark ? '#27272A' : '#F8FAFC'
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top'
  },
  row: {
    flexDirection: 'row'
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    backgroundColor: isDark ? '#27272A' : '#F8FAFC'
  },
  dropdownText: {
    fontSize: 14,
    color: isDark ? '#FFFFFF' : '#0F172A'
  },
  dropdownMenu: {
    borderWidth: 1.5,
    borderColor: isDark ? '#3F3F46' : '#CBD5E1',
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    ...shadow.card
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#27272A' : '#CBD5E1'
  },
  dropdownItemActive: {
    backgroundColor: isDark ? '#27272A' : '#F1F5F9'
  },
  dropdownItemText: {
    fontSize: 14,
    color: isDark ? '#FFFFFF' : '#0F172A'
  },
  dropdownItemTextActive: {
    color: isDark ? '#FFFFFF' : '#000000',
    fontWeight: '700'
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    paddingVertical: 14,
    gap: 8,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    ...shadow.card
  },
  saveButtonDisabled: {
    opacity: 0.6
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700'
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  stepCircleActive: {
    // handled dynamically in JSX
  },
  stepText: {
    fontWeight: 'bold',
    fontSize: 14
  },
  stepTextActive: {
    // handled dynamically in JSX
  },
  stepLine: {
    width: 50,
    height: 3,
    marginHorizontal: 8,
    borderRadius: 1.5,
  },
  stepLineActive: {
    // handled dynamically in JSX
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  stepLabelText: {
    fontSize: 12,
    width: 80,
    textAlign: 'left'
  },
  stepLabelTextActive: {
    fontWeight: 'bold'
  },
  navigationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.md
  },
  prevButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  prevButtonText: {
    fontSize: 15,
    fontWeight: '600'
  },
  nextButton: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadow.card
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4
  }
});
}

export default CreatePastorEvent;