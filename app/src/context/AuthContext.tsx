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
  refreshSuperAdminStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [member, setMember] = useState<AppMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'admin' | 'member'>('member');
  const [isPlatformSuperAdmin, setIsPlatformSuperAdmin] = useState(false);
  const memberListenerRef = useRef<(() => void) | null>(null);
  const superAdminListenerRef = useRef<(() => void) | null>(null);
  const isSigningOutRef = useRef<boolean>(false);

  const KNOWN_SUPER_ADMIN_UIDS = [
    'q43NWXEu8iTiFE0B7RDa7O8yq2o2', // Sakibanda Sunil Babu (+918374331432)
    'sXjfTqNTkKOT6dYVxkpbhjritCi2', // Prabhakar Yeddula (+919392723536)
    'LtbLZnTmhWMaCASSTmSC5ad0ST33', // Jayanthi Admin (+919398501975)
  ];

  const checkSuperAdminStatus = async (targetUid: string): Promise<boolean> => {
    if (!targetUid) return false;

    // Fast-path 1: Known UID
    if (KNOWN_SUPER_ADMIN_UIDS.includes(targetUid)) {
      AsyncStorage.setItem('@cached_is_super_admin', JSON.stringify(true)).catch(() => {});
      return true;
    }

    try {
      // 1. Primary check: 'Rhema Church/rhema/Platform Admin' subcollection -> {targetUid} -> 'Role'
      const churchRoleSnap = await firestore()
        .collection('Rhema Church')
        .doc(RHEMA_CHURCH_ID)
        .collection('Platform Admin')
        .doc(targetUid)
        .collection('Role')
        .get()
        .catch(() => null);

      if (churchRoleSnap && !churchRoleSnap.empty) {
        const hasSuperAdminRole = churchRoleSnap.docs.some((d) => {
          const data = d.data();
          return (
            data?.superadmin === true ||
            String(data?.role || '').toLowerCase().replace(/\s+/g, '') === 'superadmin' ||
            String(data?.role || '').toLowerCase().includes('super')
          );
        });
        if (hasSuperAdminRole) {
          AsyncStorage.setItem('@cached_is_super_admin', JSON.stringify(true)).catch(() => {});
          return true;
        }
      }

      // 2. Direct doc in Rhema Church/rhema/Platform Admin/{targetUid}
      const churchDirectDoc = await firestore()
        .collection('Rhema Church')
        .doc(RHEMA_CHURCH_ID)
        .collection('Platform Admin')
        .doc(targetUid)
        .get()
        .catch(() => null);
      if (churchDirectDoc && churchDirectDoc.exists) {
        const d = churchDirectDoc.data();
        if (
          d?.superadmin === true ||
          String(d?.role || '').toLowerCase().replace(/\s+/g, '') === 'superadmin' ||
          String(d?.role || '').toLowerCase().includes('super')
        ) {
          AsyncStorage.setItem('@cached_is_super_admin', JSON.stringify(true)).catch(() => {});
          return true;
        }
      }

      // 3. Fallback: root Platform Admin collection Role subcollection
      const rootRoleSnap = await firestore()
        .collection('Platform Admin')
        .doc(targetUid)
        .collection('Role')
        .get()
        .catch(() => null);

      if (rootRoleSnap && !rootRoleSnap.empty) {
        const hasSuper = rootRoleSnap.docs.some((d: any) => {
          const data = d.data();
          return (
            data?.superadmin === true ||
            String(data?.role || '').toLowerCase().replace(/\s+/g, '') === 'superadmin' ||
            String(data?.role || '').toLowerCase().includes('super')
          );
        });
        if (hasSuper) {
          AsyncStorage.setItem('@cached_is_super_admin', JSON.stringify(true)).catch(() => {});
          return true;
        }
      }

      // 4. Fallback: root Platform Admin direct doc
      const rootDoc = await firestore()
        .collection('Platform Admin')
        .doc(targetUid)
        .get()
        .catch(() => null);
      if (rootDoc && rootDoc.exists) {
        const d = rootDoc.data();
        if (
          d?.superadmin === true ||
          String(d?.role || '').toLowerCase().replace(/\s+/g, '') === 'superadmin' ||
          String(d?.role || '').toLowerCase().includes('super')
        ) {
          AsyncStorage.setItem('@cached_is_super_admin', JSON.stringify(true)).catch(() => {});
          return true;
        }
      }

      // 5. Fallback: root platform_admins
      const legacyDoc = await firestore()
        .collection('platform_admins')
        .doc(targetUid)
        .get()
        .catch(() => null);
      if (legacyDoc && legacyDoc.exists) {
        const d = legacyDoc.data();
        if (
          d?.superadmin === true ||
          String(d?.role || '').toLowerCase().replace(/\s+/g, '') === 'superadmin' ||
          String(d?.role || '').toLowerCase().includes('super')
        ) {
          AsyncStorage.setItem('@cached_is_super_admin', JSON.stringify(true)).catch(() => {});
          return true;
        }
      }

      // 6. Member document check in Rhema Church
      const memberDoc = await firestore()
        .collection('Rhema Church')
        .doc(RHEMA_CHURCH_ID)
        .collection('members')
        .doc(targetUid)
        .get()
        .catch(() => null);
      if (memberDoc && memberDoc.exists) {
        const d = memberDoc.data();
        if (
          d?.superadmin === true ||
          d?.isSuperAdmin === true ||
          String(d?.userType || '').toLowerCase().includes('super') ||
          String(d?.role || '').toLowerCase().includes('super')
        ) {
          AsyncStorage.setItem('@cached_is_super_admin', JSON.stringify(true)).catch(() => {});
          return true;
        }
      }

      return false;
    } catch (err) {
      console.warn('⚠️ [Auth] checkSuperAdminStatus error:', err);
      return false;
    }
  };

  const refreshSuperAdminStatus = async (): Promise<boolean> => {
    if (!user?.uid) return false;
    const isSuper = await checkSuperAdminStatus(user.uid);
    setIsPlatformSuperAdmin(isSuper);
    return isSuper;
  };


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
        const [cachedMemberStr, cachedUserStr, cachedSuperStr] = await Promise.all([
          AsyncStorage.getItem('@cached_member'),
          AsyncStorage.getItem('@cached_user'),
          AsyncStorage.getItem('@cached_is_super_admin'),
        ]);
        if (cachedSuperStr) {
          try {
            const isSuper = JSON.parse(cachedSuperStr);
            if (isSuper === true) setIsPlatformSuperAdmin(true);
          } catch (_) {}
        }
        if (cachedMemberStr) {
          cachedMemberObj = JSON.parse(cachedMemberStr);
          console.log('👤 [Auth] Loaded cached member:', cachedMemberObj?.name);
          setMember(cachedMemberObj);
          if (String(cachedMemberObj?.userType || '').toUpperCase().includes('SUPER')) {
            setIsPlatformSuperAdmin(true);
          }
        }
        if (cachedUserStr) {
          cachedUserObj = JSON.parse(cachedUserStr);
          console.log('🔑 [Auth] Restored persistent user session:', cachedUserObj?.uid);
          setUser(cachedUserObj as FirebaseAuthTypes.User);
          if (cachedUserObj?.uid) {
            if (KNOWN_SUPER_ADMIN_UIDS.includes(cachedUserObj.uid)) {
              setIsPlatformSuperAdmin(true);
            }
            checkSuperAdminStatus(cachedUserObj.uid).then((isSuper) => {
              setIsPlatformSuperAdmin(isSuper);
            }).catch(() => {});
          }
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
            if (cachedUserObj?.uid) {
              checkSuperAdminStatus(cachedUserObj.uid).then(setIsPlatformSuperAdmin).catch(() => {});
            }
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

            // Check Super Admin Status via 'Platform Admin' collection and 'Role' subcollection
            try {
              const isSuper = await checkSuperAdminStatus(userState.uid);
              setIsPlatformSuperAdmin(isSuper);
              if (isSuper) {
                const notifSvc = require('../services/NotificationService').default;
                notifSvc.subscribeToSuperAdminTopic().catch(() => {});
              }

              // Set up live listener for Platform Admin changes
              if (superAdminListenerRef.current) superAdminListenerRef.current();
              superAdminListenerRef.current = firestore()
                .collection('Rhema Church')
                .doc(RHEMA_CHURCH_ID)
                .collection('Platform Admin')
                .doc(userState.uid)
                .collection('Role')
                .onSnapshot(
                  (snap) => {
                    if (snap && !snap.empty) {
                      const hasSuper = snap.docs.some((d) => {
                        const data = d.data();
                        return (
                          data?.superadmin === true ||
                          String(data?.role || '').toLowerCase().replace(/\s+/g, '') === 'superadmin' ||
                          String(data?.role || '').toLowerCase().includes('super')
                        );
                      });
                      setIsPlatformSuperAdmin(hasSuper);
                    }
                  },
                  () => {}
                );
            } catch (err) {
              console.warn('⚠️ [Auth] Error verifying Super Admin status:', err);
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

              const isSuperRole =
                String(combinedMember?.userType || '').toUpperCase().includes('SUPER') ||
                KNOWN_SUPER_ADMIN_UIDS.includes(userState.uid);
              if (isSuperRole) {
                setIsPlatformSuperAdmin(true);
                AsyncStorage.setItem('@cached_is_super_admin', JSON.stringify(true)).catch(() => {});
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
      if (superAdminListenerRef.current) superAdminListenerRef.current();
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
      if (superAdminListenerRef.current) {
        superAdminListenerRef.current();
        superAdminListenerRef.current = null;
      }
      await AsyncStorage.multiRemove(['@cached_member', '@cached_user', '@guest_intent', '@cached_is_super_admin']);
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
    <AuthContext.Provider value={{ user, member, loading, signInAnonymously, signOut, setMember: updateMember, viewMode, setViewMode, isPlatformSuperAdmin, refreshSuperAdminStatus }}>
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
