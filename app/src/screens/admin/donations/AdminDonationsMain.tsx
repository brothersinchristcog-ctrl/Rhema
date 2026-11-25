import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { db } from '../../../services/firebaseConfig';
import FirestoreService from '../../../services/FirestoreService';
import { useAdminTheme } from '../../../utils/adminThemeHelper';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../../../constants/ChurchConfig';
import {
  makeScopedCacheKey,
  getInstantMemory,
  readInstantCache,
  writeInstantCache,
} from '../../../utils/instantCache';

export default function AdminDonationsMain({ navigation }: any) {
  const { isDark } = useAdminTheme();
  const { activeChurch, churchId } = useChurch();
  const effectiveChurchId = churchId || activeChurch?.id || RHEMA_CHURCH_ID;
  const donationsCacheKey = useMemo(
    () => makeScopedCacheKey('admin_donations_main_v1', effectiveChurchId, 'admin'),
    [effectiveChurchId]
  );
  const initialDonationsCache = useMemo(
    () =>
      getInstantMemory<{
        donations: any[];
        onlineDonations: any[];
        pledges: any[];
      }>(donationsCacheKey),
    [donationsCacheKey]
  );

  const [activeTab, setActiveTab] = useState('dashboard');
  const [donations, setDonations] = useState<any[]>(initialDonationsCache?.donations || []);
  const [onlineDonations, setOnlineDonations] = useState<any[]>(initialDonationsCache?.onlineDonations || []);
  const [pledges, setPledges] = useState<any[]>(initialDonationsCache?.pledges || []);
  const [loading, setLoading] = useState(!initialDonationsCache);

  // States for passing data between screens
  const [selectedDonation, setSelectedDonation] = useState<any>(null);
  const [editDonation, setEditDonation] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubLedger: any = null;
    let unsubOnline: any = null;
    let latestDonations = donations;
    let latestOnline = onlineDonations;
    let latestPledges = pledges;

    const persistSnapshot = () => {
      writeInstantCache(donationsCacheKey, {
        donations: latestDonations.slice(0, 200),
        onlineDonations: latestOnline.slice(0, 200),
        pledges: latestPledges.slice(0, 150),
      }).catch(() => { });
    };

    const mem = getInstantMemory<{
      donations: any[];
      onlineDonations: any[];
      pledges: any[];
    }>(donationsCacheKey);
    if (mem) {
      setDonations(mem.donations || []);
      setOnlineDonations(mem.onlineDonations || []);
      setPledges(mem.pledges || []);
      setLoading(false);
    } else {
      readInstantCache<{
        donations: any[];
        onlineDonations: any[];
        pledges: any[];
      }>(donationsCacheKey).then((cached) => {
        if (!isMounted || !cached?.data) return;
        setDonations(cached.data.donations || []);
        setOnlineDonations(cached.data.onlineDonations || []);
        setPledges(cached.data.pledges || []);
        setLoading(false);
      });
    }

    // Listen to real-time updates from Firestore for offline ledger donations (bounded)
    try {
      unsubLedger = db.collection('ledger_donations')
        .limit(300)
        .onSnapshot((snapshot) => {
          if (!isMounted) return;
          const fetched = snapshot ? snapshot.docs.map(doc => {
            if (doc.id.includes('${')) {
              return null;
            }
            return {
              id: doc.id,
              ...doc.data()
            };
          }).filter(Boolean) : [];

          fetched.sort((a: any, b: any) => new Date(b.date || b.createdDate || 0).getTime() - new Date(a.date || a.createdDate || 0).getTime());
          latestDonations = fetched;
          setDonations(fetched);
          persistSnapshot();
          setLoading(false);
        }, async (error) => {
          if (!isMounted) return;
          console.warn("⚠️ Firestore ledger_donations onSnapshot bypassed:", error?.message);
          // Fallback to church-scoped donations in FirestoreService
          try {
            const fallbackDonations = await FirestoreService.getDonations();
            if (isMounted && fallbackDonations && fallbackDonations.length > 0) {
              const mapped = fallbackDonations.map((d: any) => ({
                id: d.id,
                name: d.name || d.donorName || 'Unknown Donor',
                type: d.type || d.category || 'Tithe',
                amount: Number(d.amount) || 0,
                date: d.date || d.createdDate || new Date().toISOString(),
                method: d.method || d.paymentMethod || 'Cash',
                ref: d.ref || '—',
                purpose: d.purpose || d.notes || '',
                notes: d.notes || '',
                attachmentUrl: d.attachmentUrl || null,
                attachmentType: d.attachmentType || null,
                ...d,
              }));
              setDonations(mapped);
            }
          } catch (fErr) {
            console.warn("⚠️ Fallback donations fetch error:", fErr);
          }
          setLoading(false);
        });
    } catch (e: any) {
      console.warn("⚠️ Error initializing ledger_donations listener:", e?.message);
      setLoading(false);
    }

    // Listen to real-time updates from church_donations for online member payments (bounded)
    try {
      unsubOnline = db.collection('church_donations')
        .limit(300)
        .onSnapshot((snapshot) => {
          if (!isMounted) return;
          if (snapshot) {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            fetched.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            latestOnline = fetched;
            setOnlineDonations(fetched);
            persistSnapshot();
          }
        }, (error) => {
          if (!isMounted) return;
          console.warn("⚠️ Firestore church_donations onSnapshot bypassed:", error?.message);
        });
    } catch (e: any) {
      console.warn("⚠️ Error initializing church_donations listener:", e?.message);
    }

    let unsubPledges: any = null;
    try {
      unsubPledges = db
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(effectiveChurchId)
        .collection('pledges')
        .limit(200)
        .onSnapshot(
          (snapshot) => {
            if (!isMounted || !snapshot) return;
            const fetched = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            fetched.sort((a: any, b: any) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
            latestPledges = fetched;
            setPledges(fetched);
            persistSnapshot();
          },
          (error) => {
            console.warn('⚠️ Firestore pledges onSnapshot bypassed:', error?.message);
          }
        );
    } catch (e: any) {
      console.warn('⚠️ Error initializing pledges listener:', e?.message);
    }

    return () => {
      isMounted = false;
      if (unsubLedger) unsubLedger();
      if (unsubOnline) unsubOnline();
      if (unsubPledges) unsubPledges();
    };
  }, [effectiveChurchId, donationsCacheKey]);

  const allDonations = useMemo(
    () => [...donations, ...onlineDonations.filter(d => d.status === 'completed')],
    [donations, onlineDonations]
  );

  const navigateTo = (tab: string, data?: any) => {
    if (tab === 'details') {
      setSelectedDonation(data);
    }
    if (tab === 'create') {
      setEditDonation(data || null);
    }
    setActiveTab(tab);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F8FAFC', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#000000'} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F8FAFC' }]}>
      {activeTab === 'dashboard' && (() => {
        const AdminDonationsDashboard = require('./AdminDonationsDashboard').default;
        return (
          <AdminDonationsDashboard
            donations={allDonations}
            pledgesCount={pledges.length}
            onNavigate={navigateTo}
            navigation={navigation}
          />
        );
      })()}
      {activeTab === 'list' && (() => {
        const AdminDonationsList = require('./AdminDonationsList').default;
        return (
          <AdminDonationsList
            donations={donations}
            onNavigate={navigateTo}
          />
        );
      })()}
      {activeTab === 'details' && selectedDonation && (() => {
        const AdminDonationsDetails = require('./AdminDonationsDetails').default;
        return (
          <AdminDonationsDetails
            donation={selectedDonation}
            onNavigate={navigateTo}
          />
        );
      })()}
      {activeTab === 'create' && (() => {
        const AdminDonationsForm = require('./AdminDonationsForm').default;
        return (
          <AdminDonationsForm
            editData={editDonation}
            onNavigate={navigateTo}
          />
        );
      })()}
      {activeTab === 'give' && (() => {
        const AdminDonationsGive = require('./AdminDonationsGive').default;
        return (
          <AdminDonationsGive
            initialDonations={onlineDonations}
            onNavigate={navigateTo}
          />
        );
      })()}
      {activeTab === 'reports' && (() => {
        const AdminDonationsReports = require('./AdminDonationsReports').default;
        return (
          <AdminDonationsReports
            donations={allDonations}
            pledges={pledges}
            onNavigate={navigateTo}
          />
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  }
});
