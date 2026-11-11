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
  isPendingApproval: boolean;
  isRejected: boolean;
  registrationRequest: any | null;
  refreshApprovalStatus: () => Promise<boolean>;
  setPendingApprovalState: (pending: boolean, rejected?: boolean, req?: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [member, setMember] = useState<AppMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'admin' | 'member'>('member');
  const [isPlatformSuperAdmin, setIsPlatformSuperAdmin] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [registrationRequest, setRegistrationRequest] = useState<any | null>(null);
  const memberListenerRef = useRef<(() => void) | null>(null);
  const superAdminListenerRef = useRef<(() => void) | null>(null);
  const isSigningOutRef = useRef<boolean>(false);

  const checkSuperAdminStatus = async (targetUid: string): Promise<boolean> => {
    if (!targetUid) return false;

    try {
      // 1. Check root platform_admins collection
      const adminDoc = await firestore()
        .collection('platform_admins')
        .doc(targetUid)
        .get()
        .catch(() => null);
      if (adminDoc && adminDoc.exists) {
        const d = adminDoc.data();
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
        const [
          cachedMemberStr, 
          cachedUserStr, 
          cachedSuperStr,
          pendingFlagStr,
          pendingPhoneStr,
          pendingNameStr,
          pendingCityStr,
          pendingGenderStr,
          pendingStatusStr,
          pendingChurchStr,
        ] = await Promise.all([
          AsyncStorage.getItem('@cached_member'),
          AsyncStorage.getItem('@cached_user'),
          AsyncStorage.getItem('@cached_is_super_admin'),
          AsyncStorage.getItem('@is_pending_approval'),
          AsyncStorage.getItem('@pending_registration_phone'),
          AsyncStorage.getItem('@pending_registration_name'),
          AsyncStorage.getItem('@pending_registration_city'),
          AsyncStorage.getItem('@pending_registration_gender'),
          AsyncStorage.getItem('@pending_registration_status'),
          AsyncStorage.getItem('@pending_registration_church'),
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
            checkSuperAdminStatus(cachedUserObj.uid).then((isSuper) => {
              setIsPlatformSuperAdmin(isSuper);
            }).catch(() => {});
          }
        }

        // Restore pending registration state if user is awaiting admin approval
        if (!cachedMemberObj && pendingFlagStr === 'true') {
          setIsPendingApproval(pendingStatusStr !== 'rejected');
          setIsRejected(pendingStatusStr === 'rejected');
          setRegistrationRequest({
            phone: pendingPhoneStr || '',
            fullName: pendingNameStr || '',
            city: pendingCityStr || '',
            gender: pendingGenderStr || '',
            status: pendingStatusStr || 'pending',
            churchId: pendingChurchStr || 'rhema',
          });
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
          setMember(null);
          setIsPendingApproval(false);
          setIsRejected(false);
          setRegistrationRequest(null);
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

            // Check Super Admin Status via 'platform_admins' collection
            try {
              const isSuper = await checkSuperAdminStatus(userState.uid);
              setIsPlatformSuperAdmin(isSuper);
              if (isSuper) {
                const notifSvc = require('../services/NotificationService').default;
                notifSvc.subscribeToSuperAdminTopic().catch(() => {});
              }

              // Set up live listener for platform_admins changes
              if (superAdminListenerRef.current) superAdminListenerRef.current();
              superAdminListenerRef.current = firestore()
                .collection('platform_admins')
                .doc(userState.uid)
                .onSnapshot(
                  (snap) => {
                    if (snap && snap.exists) {
                      const data = snap.data();
                      const hasSuper = (
                        data?.superadmin === true ||
                        String(data?.role || '').toLowerCase().replace(/\s+/g, '') === 'superadmin' ||
                        String(data?.role || '').toLowerCase().includes('super')
                      );
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

            const hasValidMemberProfile = Boolean(
              memberProfile && (
                memberProfile.status === 'Active' ||
                memberProfile.firstName ||
                memberProfile.name ||
                memberProfile.userType
              )
            );

            if (!hasValidMemberProfile && !isPlatformSuperAdmin) {
              // This is a registering user or applicant awaiting admin approval!
              console.log('⏳ [Auth] User is not an active approved member yet. Checking registration request...');
              setMember(null);
              await AsyncStorage.removeItem('@cached_member').catch(() => {});

              const phoneToCheck = userState.phoneNumber || searchPhone || '';
              const reqData = await FirestoreService.getRegistrationRequest(targetChurchId, phoneToCheck);

              if (reqData?.status === 'rejected') {
                setIsPendingApproval(false);
                setIsRejected(true);
                setRegistrationRequest(reqData);
              } else {
                setIsPendingApproval(true);
                setIsRejected(false);
                setRegistrationRequest(reqData || { phone: phoneToCheck, status: 'pending' });
              }
              setLoading(false);
              return;
            }

            // User is an approved active member!
            setIsPendingApproval(false);
            setIsRejected(false);
            setRegistrationRequest(null);
            await AsyncStorage.multiRemove([
              '@is_pending_approval',
              '@pending_registration_status',
              '@pending_registration_phone',
              '@pending_registration_name',
              '@pending_registration_city',
              '@pending_registration_gender',
              '@pending_registration_church',
            ]).catch(() => {});

            // FCM Setup - ONLY for approved active members
            try {
              const NotificationService = require('../services/NotificationService').default;
              await NotificationService.requestUserPermission().catch(() => {});
              const token = await messaging().getToken().catch(() => null);
              if (token) {
                await require('../services/firebaseConfig').firestore()
                  .collection('Rhema Church').doc(targetChurchId)
                  .collection('members').doc(userState.uid).set({
                    fcmToken: token
                  }, { merge: true });

                await NotificationService.subscribeToChurchTopic(targetChurchId);
              }

              messaging().onTokenRefresh(async (newToken) => {
                await require('../services/firebaseConfig').firestore()
                  .collection('Rhema Church').doc(targetChurchId)
                  .collection('members').doc(userState.uid).set({
                    fcmToken: newToken
                  }, { merge: true });

                await NotificationService.subscribeToChurchTopic(targetChurchId);
              });
            } catch (err) {
              console.log('❌ [FCM] Error setting up notifications:', err);
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
                Boolean((combinedMember as any)?.isSuperAdmin) ||
                Boolean((combinedMember as any)?.superadmin);
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
      if (auth().currentUser) {
        await auth().signOut().catch(() => {});
      }
      await AsyncStorage.multiRemove([
        '@cached_member', 
        '@cached_user', 
        '@guest_intent', 
        '@cached_is_super_admin',
        '@is_pending_approval',
        '@pending_registration_phone',
        '@pending_registration_name',
        '@pending_registration_city',
        '@pending_registration_gender',
        '@pending_registration_status',
        '@pending_registration_church',
      ]).catch(() => {});
      setUser(null);
      setMember(null);
      setIsPlatformSuperAdmin(false);
      setIsPendingApproval(false);
      setIsRejected(false);
      setRegistrationRequest(null);
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      isSigningOutRef.current = false;
    }
  };

  const refreshApprovalStatus = async (): Promise<boolean> => {
    try {
      const targetChurchId = RHEMA_CHURCH_ID;
      const storedPhone = await AsyncStorage.getItem('@pending_registration_phone').catch(() => null);
      const phoneToCheck = user?.phoneNumber || registrationRequest?.phone || storedPhone || '';
      if (!phoneToCheck && !user?.uid) return false;

      // 1. Check if member doc was created in members collection
      let profile = user?.uid ? await FirestoreService.getMemberProfile(targetChurchId, user.uid) : null;
      if (!profile && phoneToCheck) {
        const check = await FirestoreService.checkContactExists(phoneToCheck);
        if (check?.exists && check?.member) {
          profile = check.member;
        }
      }
      if (profile && (profile.status === 'Active' || profile.firstName || profile.name)) {
        setIsPendingApproval(false);
        setIsRejected(false);
        setMember(profile);
        await AsyncStorage.multiRemove([
          '@is_pending_approval',
          '@pending_registration_status',
          '@pending_registration_phone',
          '@pending_registration_name',
          '@pending_registration_city',
          '@pending_registration_gender',
          '@pending_registration_church',
        ]).catch(() => {});
        await AsyncStorage.setItem('@cached_member', JSON.stringify(profile)).catch(() => {});
        return true;
      }

      // 2. Check registration request status
      const req = await FirestoreService.getRegistrationRequest(targetChurchId, phoneToCheck);
      if (req?.status === 'approved') {
        setIsPendingApproval(false);
        setIsRejected(false);
        setRegistrationRequest(req);
        await AsyncStorage.multiRemove([
          '@is_pending_approval',
          '@pending_registration_status',
          '@pending_registration_phone',
          '@pending_registration_name',
          '@pending_registration_city',
          '@pending_registration_gender',
          '@pending_registration_church',
        ]).catch(() => {});
        return true;
      } else if (req?.status === 'rejected') {
        setIsPendingApproval(false);
        setIsRejected(true);
        setRegistrationRequest(req);
        await AsyncStorage.setItem('@pending_registration_status', 'rejected').catch(() => {});
        return false;
      } else {
        setIsPendingApproval(true);
        setIsRejected(false);
        setRegistrationRequest(req);
        await AsyncStorage.setItem('@pending_registration_status', 'pending').catch(() => {});
        return false;
      }
    } catch (e) {
      console.warn('refreshApprovalStatus error:', e);
      return false;
    }
  };

  const setPendingApprovalState = (pending: boolean, rejected = false, req: any = null) => {
    setIsPendingApproval(pending);
    setIsRejected(rejected);
    setRegistrationRequest(req);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      member, 
      loading, 
      signInAnonymously, 
      signOut, 
      setMember: updateMember, 
      viewMode, 
      setViewMode, 
      isPlatformSuperAdmin, 
      refreshSuperAdminStatus,
      isPendingApproval,
      isRejected,
      registrationRequest,
      refreshApprovalStatus,
      setPendingApprovalState,
    }}>
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
