import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestore } from '../services/firebaseConfig';
import ChurchService, { ChurchDetails } from '../services/ChurchService';
import { RHEMA_CHURCH_ID, RHEMA_CHURCH_NAME, RHEMA_DEFAULT_THEME } from '../constants/ChurchConfig';
import { resetAllClientCaches } from '../utils/cacheReset';

interface ChurchContextType {
  activeChurch: ChurchDetails | null;
  churchId: string;
  setChurchId: (id: string) => Promise<void>;
  setActiveChurch: (church: ChurchDetails | null) => void;
  loading: boolean;
  // Multi-branch impersonation (maintained for compatibility)
  originalChurchId: string | null;
  isImpersonating: boolean;
  impersonatedBranchName: string | null;
  startImpersonation: (branchId: string, branchName: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const DEFAULT_RHEMA_DETAILS: ChurchDetails = {
  id: RHEMA_CHURCH_ID,
  name: RHEMA_CHURCH_NAME,
  churchCode: 'RHEMA',
  subdomain: 'rhema',
  contactEmail: 'contact@rhemaglobalministries.org',
  contactPhone: '',
  tagline: 'Transforming Lives Through The Word of God',
  aboutUs: 'Welcome to Rhema Global Ministries. A Bible-believing, Christ-centered ministry.',
  isActive: true,
  theme: RHEMA_DEFAULT_THEME,
  useWeChristianDailyPromise: true,
  whatsappIntegrationEnabled: false,
  features: {
    hasSermons: true,
    hasDailyPromises: true,
    hasWorshipSongs: true,
    hasGiving: true,
    hasWhatsAppAutomation: false,
  },
};

const ChurchContext = createContext<ChurchContextType | undefined>(undefined);

export const ChurchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeChurch, setActiveChurch] = useState<ChurchDetails | null>(DEFAULT_RHEMA_DETAILS);
  const [churchId, setChurchIdState] = useState<string>(RHEMA_CHURCH_ID);
  const [loading, setLoading] = useState(false);

  // Multi-branch impersonation state
  const [originalChurchId, setOriginalChurchId] = useState<string | null>(null);
  const [impersonatedBranchName, setImpersonatedBranchName] = useState<string | null>(null);
  const isImpersonating = !!originalChurchId;

  // Real-time listener for the currently selected churchId
  useEffect(() => {
    const activeTargetId = churchId || RHEMA_CHURCH_ID;
    const unsub = firestore()
      .collection('Rhema Church')
      .doc(activeTargetId)
      .onSnapshot(
        (docSnap) => {
          if (docSnap && docSnap.exists()) {
            const data = { id: docSnap.id, ...docSnap.data() } as ChurchDetails;
            setActiveChurch(data);
          }
        },
        (error) => {
          console.warn('[ChurchContext] onSnapshot error:', error);
        }
      );

    // Sync active church with FirestoreService and notification topic
    require('../services/FirestoreService').default.setChurchId(activeTargetId).catch(() => {});
    require('../services/NotificationService').default.subscribeToChurchTopic(activeTargetId).catch(() => {});

    return () => unsub();
  }, [churchId]);

  const setChurchId = async (id: string) => {
    const targetId = id || RHEMA_CHURCH_ID;
    try {
      if (targetId !== churchId) {
        await resetAllClientCaches('church_switch');
      }
      const details = await ChurchService.getChurchDetails(targetId);
      if (details) {
        setActiveChurch(details);
        setChurchIdState(targetId);
        await AsyncStorage.setItem('@cached_church_id', targetId);
        await require('../services/FirestoreService').default.setChurchId(targetId);
      }
    } catch (e) {
      console.error('Error setting churchId', e);
    }
  };

  const startImpersonation = async (branchId: string, branchName: string) => {
    setLoading(true);
    try {
      const details = await ChurchService.getChurchDetails(branchId);
      if (details) {
        if (branchId !== churchId) {
          await resetAllClientCaches('church_switch');
        }
        if (!originalChurchId) {
          setOriginalChurchId(churchId);
        }
        setImpersonatedBranchName(branchName);
        setActiveChurch(details);
        setChurchIdState(branchId);
        await require('../services/FirestoreService').default.setChurchId(branchId);
      }
    } catch (e) {
      console.error('Error starting impersonation', e);
    } finally {
      setLoading(false);
    }
  };

  const stopImpersonation = async () => {
    if (originalChurchId) {
      setLoading(true);
      try {
        const details = await ChurchService.getChurchDetails(originalChurchId);
        if (details) {
          if (originalChurchId !== churchId) {
            await resetAllClientCaches('church_switch');
          }
          setActiveChurch(details);
          setChurchIdState(originalChurchId);
          await require('../services/FirestoreService').default.setChurchId(originalChurchId);
          setOriginalChurchId(null);
          setImpersonatedBranchName(null);
        }
      } catch (e) {
        console.error('Error stopping impersonation', e);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <ChurchContext.Provider value={{ 
      activeChurch, churchId, setChurchId, setActiveChurch, loading,
      originalChurchId, isImpersonating, impersonatedBranchName,
      startImpersonation, stopImpersonation
    }}>
      {children}
    </ChurchContext.Provider>
  );
};

export const useChurch = () => {
  const context = useContext(ChurchContext);
  if (context === undefined) {
    throw new Error('useChurch must be used within a ChurchProvider');
  }
  return context;
};
