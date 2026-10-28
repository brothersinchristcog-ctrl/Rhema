import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';

import FirestoreService, { AppMember } from '../services/FirestoreService';
import { RHEMA_CHURCH_ID } from '../constants/ChurchConfig';

interface AuthContextType {
  user: FirebaseAuthTypes.User | null;
  member: AppMember | null;
  loading: boolean;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  setMember: (member: AppMember | null) => void;
  viewMode: 'admin' | 'member';
  setViewMode: (mode: 'admin' | 'member') => void;
  isPlatformSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [member, setMember] = useState<AppMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'admin' | 'member'>('member');
  const [isPlatformSuperAdmin, setIsPlatformSuperAdmin] = useState(false);
  const memberListenerRef = useRef<(() => void) | null>(null);
  const isSigningOutRef = useRef<boolean>(false);

  const updateMember = (newMember: AppMember | null) => {
    setMember(newMember);
    if (newMember) {
      AsyncStorage.setItem('@cached_member', JSON.stringify(newMember)).catch(() => {});
    }
  };

  useEffect(() => {
    let subscriber: (() => void) | undefined;

    const initializeAuth = async () => {
      // 1. Load cached member & cached user session immediately so the user stays logged in forever until explicit signOut
      let cachedUserObj: any = null;
      let cachedMemberObj: AppMember | null = null;
      try {
        const [cachedMemberStr, cachedUserStr] = await Promise.all([
          AsyncStorage.getItem('@cached_member'),
          AsyncStorage.getItem('@cached_user'),
        ]);
        if (cachedMemberStr) {
          cachedMemberObj = JSON.parse(cachedMemberStr);
          console.log('👤 [Auth] Loaded cached member:', cachedMemberObj?.name);
          setMember(cachedMemberObj);
        }
        if (cachedUserStr) {
          cachedUserObj = JSON.parse(cachedUserStr);
          console.log('🔑 [Auth] Restored persistent user session:', cachedUserObj?.uid);
          setUser(cachedUserObj as FirebaseAuthTypes.User);
        }
      } catch (e) {
        // Ignore cache read errors
      }

      // 2. Listen to Firebase Auth state changes
      subscriber = auth().onAuthStateChanged(async (userState) => {
        if (isSigningOutRef.current) {
          setUser(null);
          setMember(null);
          setLoading(false);
          return;
        }

        if (userState && userState.isAnonymous) {
          try {
            const intentStr = await AsyncStorage.getItem('@guest_intent');
            if (intentStr !== 'true') {
              // If we have a persisted real user session, keep it instead of dropping to null
              if (cachedUserObj && !cachedUserObj.isAnonymous) {
                setUser(cachedUserObj as FirebaseAuthTypes.User);
                setLoading(false);
                return;
              }
              console.log('🤫 [Auth] Anonymous user detected without guest intent. Showing Login.');
              setUser(null);
              setLoading(false);
              return;
            }
          } catch (e) {
            // Ignore
          }
        }

        // If Firebase reports null (e.g. offline boot or token refresh hiccup), preserve cached session if available
        if (!userState) {
          if (cachedUserObj && !cachedUserObj.isAnonymous && !isSigningOutRef.current) {
            console.log('🛡️ [Auth] Preserving persistent user session while Firebase Auth is null/offline.');
            setUser(cachedUserObj as FirebaseAuthTypes.User);
            setLoading(false);
            return;
          }
          setUser(null);
          setLoading(false);
          return;
        }

        setUser(userState);

        if (!userState.isAnonymous) {
          // Persist user session so user is NEVER asked to log in again unless they tap Sign Out
          const persistentUser = {
            uid: userState.uid,
            phoneNumber: userState.phoneNumber || cachedUserObj?.phoneNumber || '',
            displayName: userState.displayName || cachedUserObj?.displayName || '',
            email: userState.email || cachedUserObj?.email || '',
            isAnonymous: false,
          };
          cachedUserObj = persistentUser;
          AsyncStorage.setItem('@cached_user', JSON.stringify(persistentUser)).catch(() => {});

          try {
            console.log('🔐 [Auth] User Logged In:', userState.uid);

            // Check Super Admin Status
            try {
              const adminDoc = await firestore().collection('platform_admins').doc(userState.uid).get();
              const isAdmin = typeof (adminDoc as any).exists === 'function' ? (adminDoc as any).exists() : Boolean((adminDoc as any).exists);
              setIsPlatformSuperAdmin(isAdmin);
              if (isAdmin) {
                const notifSvc = require('../services/NotificationService').default;
                notifSvc.subscribeToSuperAdminTopic().catch(() => {});
              }
            } catch (err) {
              setIsPlatformSuperAdmin(false);
            }

            // Refresh token when online (ignore errors when offline)
            try {
              await userState.getIdToken(true);
            } catch (tokenErr) {
              console.warn('⚠️ [Auth] Token refresh skipped (offline?):', tokenErr);
            }

            // Fetch member profile from Rhema Church
            let globalUser = await FirestoreService.getGlobalUser(userState.uid);

            if (!globalUser && userState.phoneNumber) {
              console.log('🔄 [Auth] Looking up member by phone...', userState.phoneNumber);
              const fallback = await FirestoreService.checkContactExists(userState.phoneNumber);
              if (fallback?.exists && fallback?.member) {
                const targetChurch = fallback.member.churchId || RHEMA_CHURCH_ID;
                await FirestoreService.syncMember(targetChurch, fallback.member.id, userState.uid);
                globalUser = { ...fallback.member, uid: userState.uid, primaryChurchId: targetChurch } as any;
              }
            } else if (globalUser && globalUser.uid !== userState.uid) {
              const targetChurch = globalUser.primaryChurchId || RHEMA_CHURCH_ID;
              await FirestoreService.syncMember(targetChurch, globalUser.uid, userState.uid);
              globalUser = { ...globalUser, uid: userState.uid, primaryChurchId: targetChurch } as any;
            }

            const targetChurchId = globalUser?.primaryChurchId || RHEMA_CHURCH_ID;

            // FCM Setup
            try {
              const authStatus = await messaging().requestPermission();
              const enabled =
                authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                authStatus === messaging.AuthorizationStatus.PROVISIONAL;

              if (enabled) {
                const token = await messaging().getToken();
                if (token) {
                  await require('../services/firebaseConfig').firestore()
                    .collection('Rhema Church').doc(targetChurchId)
                    .collection('members').doc(userState.uid).set({
                      fcmToken: token
                    }, { merge: true });

                  await require('../services/NotificationService').default.subscribeToChurchTopic(targetChurchId);
                }

                messaging().onTokenRefresh(async (newToken) => {
                  await require('../services/firebaseConfig').firestore()
                    .collection('Rhema Church').doc(targetChurchId)
                    .collection('members').doc(userState.uid).set({
                      fcmToken: newToken
                    }, { merge: true });

                  await require('../services/NotificationService').default.subscribeToChurchTopic(targetChurchId);
                });
              }
            } catch (err) {
              console.log('❌ [FCM] Error setting up notifications:', err);
            }

            // Fetch nested member profile
            let memberProfile = await FirestoreService.getMemberProfile(targetChurchId, userState.uid);

            const searchPhone = userState.phoneNumber || globalUser?.phone || memberProfile?.phone || cachedMemberObj?.phone;
            if (searchPhone) {
              try {
                const contactCheck = await FirestoreService.checkContactExists(searchPhone);
                if (contactCheck?.exists && contactCheck.member) {
                  if (contactCheck.member.id !== userState.uid) {
                    await FirestoreService.syncMember(targetChurchId, contactCheck.member.id, userState.uid);
                  }
                  memberProfile = { ...memberProfile, ...contactCheck.member, id: userState.uid } as AppMember;
                }
              } catch (e) {
                console.warn('⚠️ [Auth] checkContactExists failed during login:', e);
              }
            }

            if (memberProfile || globalUser) {
              const combinedMember: AppMember = {
                ...(cachedMemberObj || {}),
                ...(globalUser || {}),
                ...(memberProfile || {}),
                id: userState.uid,
                churchId: targetChurchId,
                primaryChurchId: targetChurchId,
              } as AppMember;

              cachedMemberObj = combinedMember;
              setMember(combinedMember);
              AsyncStorage.setItem('@cached_member', JSON.stringify(combinedMember)).catch(() => {});

              const isAdminUser =
                String(combinedMember?.userType || '').toUpperCase().includes('ADMIN') ||
                String(combinedMember?.userType || '').toUpperCase().includes('PASTOR') ||
                String(combinedMember?.userType || '').toUpperCase().includes('SUPER');
              if (isAdminUser) {
                require('../services/NotificationService').default.subscribeToChurchAdminTopic(targetChurchId);
              }
            }

            // Real-time listener on member profile (updates role/profile changes live, NEVER auto-logs out)
            if (memberListenerRef.current) memberListenerRef.current();
            memberListenerRef.current = firestore()
              .collection('Rhema Church')
              .doc(targetChurchId)
              .collection('members')
              .doc(userState.uid)
              .onSnapshot(
                async (snap) => {
                  if (snap.exists() && snap.data()) {
                    const updated = snap.data() as AppMember;
                    setMember((prev) => {
                      const prevIsAdmin = String(prev?.userType || '').toUpperCase().includes('ADMIN');
                      const updatedIsAdmin = String(updated.userType || '').toUpperCase().includes('ADMIN');

                      if (snap.metadata.fromCache && prevIsAdmin && !updatedIsAdmin) {
                        updated.userType = prev?.userType;
                      }

                      const next = {
                        ...prev,
                        ...updated,
                        id: userState.uid,
                        churchId: targetChurchId,
                        primaryChurchId: targetChurchId,
                      } as AppMember;
                      AsyncStorage.setItem('@cached_member', JSON.stringify(next)).catch(() => {});

                      const nextIsAdminUser =
                        String(next?.userType || '').toUpperCase().includes('ADMIN') ||
                        String(next?.userType || '').toUpperCase().includes('PASTOR') ||
                        String(next?.userType || '').toUpperCase().includes('SUPER');
                      if (nextIsAdminUser) {
                        require('../services/NotificationService').default.subscribeToChurchAdminTopic(targetChurchId);
                      }

                      return next;
                    });
                  }
                  // NOTE: Never call auth().signOut() here — session persists until explicit user logout.
                },
                (err) => console.warn('⚠️ [Auth] Member listener error:', err)
              );
          } catch (err) {
            console.error('❌ [Auth] Profile Fetch Failed (keeping cached session):', err);
          }
        }

        setLoading(false);
      });
    };

    initializeAuth();

    return () => {
      if (subscriber) subscriber();
      if (memberListenerRef.current) memberListenerRef.current();
    };
  }, []);

  const signInAnonymously = async () => {
    try {
      const cred = await auth().signInAnonymously();
      setUser(cred.user);
    } catch (error) {
      console.error('Anonymous sign in error:', error);
      throw error;
    }
  };

  // Explicit user-initiated logout ONLY
  const signOut = async () => {
    try {
      isSigningOutRef.current = true;
      if (memberListenerRef.current) {
        memberListenerRef.current();
        memberListenerRef.current = null;
      }
      await AsyncStorage.multiRemove(['@cached_member', '@cached_user', '@guest_intent']);
      setMember(null);
      setUser(null);
      setIsPlatformSuperAdmin(false);
      if (auth().currentUser) {
        await auth().signOut();
      }
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      isSigningOutRef.current = false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, member, loading, signInAnonymously, signOut, setMember: updateMember, viewMode, setViewMode, isPlatformSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
