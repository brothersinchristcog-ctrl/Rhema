import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../../../context/AuthContext';
import MatrimonyBottomTabBar from '../components/MatrimonyBottomTabBar';
import MatrimonyMenuDrawer from '../components/MatrimonyMenuDrawer';
import { matrimonyApi } from '../services/matrimonyApi';
import { matrimonyChatService } from '../services/matrimonyChatService';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MatrimonyMainTabs({ navigation }: any) {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        id="MatrimonyTabs"
        initialRouteName="MatrimonyHome"
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
        }}
        tabBar={(props) => <MatrimonyBottomTabBar {...props} />}
      >
        <Tab.Screen name="MatrimonyHome" getComponent={() => require('../screens/MatrimonyHomeScreen').default} />
        <Tab.Screen name="MatrimonyMatches" getComponent={() => require('../screens/MatrimonyMatchesScreen').default} />
        <Tab.Screen name="MatrimonyInterestsHub" getComponent={() => require('../screens/MatrimonyInterestsHubScreen').default} />
        <Tab.Screen name="MatrimonyMessages" getComponent={() => require('../screens/MatrimonyMessagesScreen').default} />
      </Tab.Navigator>
      <MatrimonyMenuDrawer stackNavigation={navigation} />
    </View>
  );
}

export default function MatrimonyNavigator() {
  const { user } = useAuth();
  const uid = user?.uid || auth().currentUser?.uid;
  const stackNavRef = useRef<any>(null);
  const sawProfileDocRef = useRef(false);
  const lastProfileSignatureRef = useRef<string>('');

  useEffect(() => {
    sawProfileDocRef.current = false;
    lastProfileSignatureRef.current = '';
    if (!uid) return;

    const unsubscribe = firestore()
      .collection('matrimony_profiles')
      .doc(uid)
      .onSnapshot(
        (snap) => {
          const nav = stackNavRef.current;
          const navState = nav?.getState?.();
          const activeRoute: string | undefined = navState?.routes?.[navState.index]?.name;

          if (!snap.exists) {
            if (sawProfileDocRef.current && activeRoute && activeRoute !== 'MatrimonySplash' && activeRoute !== 'MatrimonyWelcome') {
              sawProfileDocRef.current = false;
              matrimonyApi.clearAllCaches();
              nav.reset({ index: 0, routes: [{ name: 'MatrimonyWelcome' }] });
            }
            return;
          }

          sawProfileDocRef.current = true;
          const data = snap.data() || {};
          const liveStatus = String(data.profileStatus || '');
          const nextSig = `${liveStatus}|${String(data.visibility || '')}|${String(data.inactiveReason || '')}`;

          if (lastProfileSignatureRef.current !== nextSig) {
            lastProfileSignatureRef.current = nextSig;
            matrimonyApi.patchCachedRegistration((prev) => ({
              ...prev,
              profile: prev.profile
                ? {
                    ...prev.profile,
                    profileStatus: (liveStatus || prev.profile.profileStatus) as any,
                    visibility: data.visibility || prev.profile.visibility,
                    inactiveReason: data.inactiveReason || null,
                  }
                : prev.profile,
            }));
          }

          if (!activeRoute || activeRoute === 'MatrimonySplash') {
            return;
          }

          if (
            liveStatus === 'inactive' ||
            liveStatus === 'suspended' ||
            liveStatus === 'rejected' ||
            liveStatus === 'correction_requested'
          ) {
            if (activeRoute !== 'MatrimonyStatus') {
              matrimonyApi.clearAllCaches();
              nav.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
            }
            return;
          }

          if (liveStatus === 'deleted') {
            if (activeRoute !== 'MatrimonyWelcome') {
              matrimonyApi.clearAllCaches();
              nav.reset({ index: 0, routes: [{ name: 'MatrimonyWelcome' }] });
            }
            return;
          }

          if (liveStatus === 'approved' && activeRoute === 'MatrimonyStatus') {
            matrimonyApi.clearAllCaches();
            nav.reset({ index: 0, routes: [{ name: 'MatrimonyMainTabs' }] });
          }
        },
        () => {
          // Ignore snapshot transient permission errors on sign-out
        }
      );

    return () => {
      unsubscribe();
    };
  }, [uid]);

  useEffect(() => {
    let stopRootPresence: (() => void) | null = null;
    let activeUid: string | null = null;

    const syncForUser = (nextUid: string | null) => {
      if (activeUid === nextUid) return;
      if (stopRootPresence) {
        stopRootPresence();
        stopRootPresence = null;
      }
      activeUid = nextUid;
      if (nextUid) {
        stopRootPresence = matrimonyChatService.startRootPresenceSession(nextUid);
      }
    };

    syncForUser(auth().currentUser?.uid || null);
    const unsubAuth = auth().onAuthStateChanged((u) => {
      syncForUser(u?.uid || null);
    });

    return () => {
      unsubAuth();
      if (stopRootPresence) {
        stopRootPresence();
        stopRootPresence = null;
      }
    };
  }, []);

  return (
    <Stack.Navigator
      id="MatrimonyStack"
      initialRouteName="MatrimonySplash"
      screenOptions={{ headerShown: false }}
      screenListeners={({ navigation }) => ({
        state: () => {
          stackNavRef.current = navigation;
        },
      })}
    >
      <Stack.Screen name="MatrimonySplash" getComponent={() => require('../screens/MatrimonySplashScreen').default} />
      <Stack.Screen name="MatrimonyWelcome" getComponent={() => require('../screens/MatrimonyWelcomeScreen').default} />
      <Stack.Screen name="MatrimonyBasicDetails" getComponent={() => require('../screens/MatrimonyBasicDetailsScreen').default} />
      <Stack.Screen name="MatrimonyPersonalDetails" getComponent={() => require('../screens/MatrimonyPersonalDetailsScreen').default} />
      <Stack.Screen name="MatrimonyReligiousDetails" getComponent={() => require('../screens/MatrimonyReligiousDetailsScreen').default} />
      <Stack.Screen name="MatrimonyLocationDetails" getComponent={() => require('../screens/MatrimonyLocationDetailsScreen').default} />
      <Stack.Screen name="MatrimonyProfessionalDetails" getComponent={() => require('../screens/MatrimonyProfessionalDetailsScreen').default} />
      <Stack.Screen name="MatrimonyAdditionalDetails" getComponent={() => require('../screens/MatrimonyAdditionalDetailsScreen').default} />
      <Stack.Screen name="MatrimonyConsent" getComponent={() => require('../screens/MatrimonyConsentScreen').default} />
      <Stack.Screen name="MatrimonyProfileSuccess" getComponent={() => require('../screens/MatrimonyProfileSuccessScreen').default} />
      <Stack.Screen name="MatrimonyPhotoUpload" getComponent={() => require('../screens/MatrimonyPhotoUploadScreen').default} />
      <Stack.Screen name="MatrimonyMyPhotos" getComponent={() => require('../screens/MatrimonyMyPhotosScreen').default} />
      <Stack.Screen name="MatrimonyEditProfile" getComponent={() => require('../screens/MatrimonyEditProfileScreen').default} />
      <Stack.Screen name="MatrimonyInterests" getComponent={() => require('../screens/MatrimonyInterestsScreen').default} />
      <Stack.Screen name="MatrimonyMainTabs" component={MatrimonyMainTabs} />
      <Stack.Screen name="MatrimonyMatchDetail" getComponent={() => require('../screens/MatrimonyMatchDetailScreen').default} />
      <Stack.Screen name="MatrimonyChat" getComponent={() => require('../screens/MatrimonyChatScreen').default} />
      <Stack.Screen name="MatrimonySubmitApproval" getComponent={() => require('../screens/MatrimonySubmitApprovalScreen').default} />
      <Stack.Screen name="MatrimonyStatus" getComponent={() => require('../screens/MatrimonyStatusScreen').default} />
      <Stack.Screen name="MatrimonyUpgrade" getComponent={() => require('../screens/MatrimonyUpgradeScreen').default} />
      <Stack.Screen name="MatrimonyPrivacySettings" getComponent={() => require('../screens/MatrimonyPrivacySettingsScreen').default} />
      <Stack.Screen name="MatrimonyAccountSettings" getComponent={() => require('../screens/MatrimonyAccountSettingsScreen').default} />
      <Stack.Screen name="MatrimonyNotifications" getComponent={() => require('../screens/MatrimonyNotificationsScreen').default} />
      <Stack.Screen name="MatrimonyNotificationsFeed" getComponent={() => require('../screens/MatrimonyNotificationsFeedScreen').default} />
      <Stack.Screen name="MatrimonySearch" getComponent={() => require('../screens/MatrimonySearchScreen').default} />
      <Stack.Screen name="MatrimonyHiddenProfiles" getComponent={() => require('../screens/MatrimonyHiddenProfilesScreen').default} />
      <Stack.Screen name="MatrimonyDeactivateAccount" getComponent={() => require('../screens/MatrimonyDeactivateAccountScreen').default} />
      <Stack.Screen name="MatrimonyDeleteProfile" getComponent={() => require('../screens/MatrimonyDeleteProfileScreen').default} />
    </Stack.Navigator>
  );
}
