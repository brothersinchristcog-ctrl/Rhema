import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { db } from '../../../services/firebaseConfig';
import FirestoreService from '../../../services/FirestoreService';
import AdminDonationsDashboard from './AdminDonationsDashboard';
import AdminDonationsList from './AdminDonationsList';
import AdminDonationsDetails from './AdminDonationsDetails';
import AdminDonationsForm from './AdminDonationsForm';
import AdminDonationsGive from './AdminDonationsGive';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

export default function AdminDonationsMain({ navigation }: any) {
  const { isDark } = useAdminTheme();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [donations, setDonations] = useState<any[]>([]);
  const [onlineDonations, setOnlineDonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States for passing data between screens
  const [selectedDonation, setSelectedDonation] = useState<any>(null);
  const [editDonation, setEditDonation] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubLedger: any = null;
    let unsubOnline: any = null;

    // Listen to real-time updates from Firestore for offline ledger donations
    try {
      unsubLedger = db.collection('ledger_donations')
        .onSnapshot((snapshot) => {
          if (!isMounted) return;
          const fetched = snapshot ? snapshot.docs.map(doc => {
            if (doc.id.includes('${')) {
              db.collection('ledger_donations').doc(doc.id).delete().catch(() => {});
              return null;
            }
            return {
              id: doc.id,
              ...doc.data()
            };
          }).filter(Boolean) : [];

          fetched.sort((a: any, b: any) => new Date(b.date || b.createdDate || 0).getTime() - new Date(a.date || a.createdDate || 0).getTime());
          setDonations(fetched);
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

    // Listen to real-time updates from church_donations for online member payments
    try {
      unsubOnline = db.collection('church_donations')
        .onSnapshot((snapshot) => {
          if (!isMounted) return;
          if (snapshot) {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            fetched.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            setOnlineDonations(fetched);
          }
        }, (error) => {
          if (!isMounted) return;
          console.warn("⚠️ Firestore church_donations onSnapshot bypassed:", error?.message);
        });
    } catch (e: any) {
      console.warn("⚠️ Error initializing church_donations listener:", e?.message);
    }

    return () => {
      isMounted = false;
      if (unsubLedger) unsubLedger();
      if (unsubOnline) unsubOnline();
    };
  }, []);

  const allDonations = [...donations, ...onlineDonations.filter(d => d.status === 'completed')];

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
      {activeTab === 'dashboard' && (
        <AdminDonationsDashboard 
          donations={allDonations} 
          onNavigate={navigateTo} 
          navigation={navigation}
        />
      )}
      {activeTab === 'list' && (
        <AdminDonationsList 
          donations={donations} 
          onNavigate={navigateTo} 
        />
      )}
      {activeTab === 'details' && selectedDonation && (
        <AdminDonationsDetails 
          donation={selectedDonation} 
          onNavigate={navigateTo} 
        />
      )}
      {activeTab === 'create' && (
        <AdminDonationsForm 
          editData={editDonation}
          onNavigate={navigateTo} 
        />
      )}
      {activeTab === 'give' && (
        <AdminDonationsGive 
          onNavigate={navigateTo} 
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  }
});
