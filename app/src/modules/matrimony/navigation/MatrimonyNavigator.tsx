import React, { useEffect, useRef } from 'react';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { matrimonyApi } from '../services/matrimonyApi';
import MatrimonySplashScreen from '../screens/MatrimonySplashScreen';
import MatrimonyWelcomeScreen from '../screens/MatrimonyWelcomeScreen';
import MatrimonyBasicDetailsScreen from '../screens/MatrimonyBasicDetailsScreen';
import MatrimonyPersonalDetailsScreen from '../screens/MatrimonyPersonalDetailsScreen';
import MatrimonyReligiousDetailsScreen from '../screens/MatrimonyReligiousDetailsScreen';
import MatrimonyLocationDetailsScreen from '../screens/MatrimonyLocationDetailsScreen';
import MatrimonyProfessionalDetailsScreen from '../screens/MatrimonyProfessionalDetailsScreen';
import MatrimonyAdditionalDetailsScreen from '../screens/MatrimonyAdditionalDetailsScreen';
import MatrimonyConsentScreen from '../screens/MatrimonyConsentScreen';
import MatrimonyProfileSuccessScreen from '../screens/MatrimonyProfileSuccessScreen';
import MatrimonyPhotoUploadScreen from '../screens/MatrimonyPhotoUploadScreen';
import MatrimonyMyPhotosScreen from '../screens/MatrimonyMyPhotosScreen';
import MatrimonyEditProfileScreen from '../screens/MatrimonyEditProfileScreen';
import MatrimonyInterestsScreen from '../screens/MatrimonyInterestsScreen';
import MatrimonyInterestsHubScreen from '../screens/MatrimonyInterestsHubScreen';
import MatrimonyHomeScreen from '../screens/MatrimonyHomeScreen';
import MatrimonyMatchesScreen from '../screens/MatrimonyMatchesScreen';
import MatrimonyMatchDetailScreen from '../screens/MatrimonyMatchDetailScreen';
import MatrimonyMessagesScreen from '../screens/MatrimonyMessagesScreen';
import MatrimonyChatScreen from '../screens/MatrimonyChatScreen';
import MatrimonyStatusScreen from '../screens/MatrimonyStatusScreen';
import MatrimonySubmitApprovalScreen from '../screens/MatrimonySubmitApprovalScreen';
import MatrimonyUpgradeScreen from '../screens/MatrimonyUpgradeScreen';
import MatrimonyPrivacySettingsScreen from '../screens/MatrimonyPrivacySettingsScreen';
import MatrimonyAccountSettingsScreen from '../screens/MatrimonyAccountSettingsScreen';
import MatrimonyNotificationsScreen from '../screens/MatrimonyNotificationsScreen';
import MatrimonyNotificationsFeedScreen from '../screens/MatrimonyNotificationsFeedScreen';
import MatrimonyHiddenProfilesScreen from '../screens/MatrimonyHiddenProfilesScreen';
import MatrimonyDeactivateAccountScreen from '../screens/MatrimonyDeactivateAccountScreen';
import MatrimonyDeleteProfileScreen from '../screens/MatrimonyDeleteProfileScreen';

const Stack = createNativeStackNavigator();

export default function MatrimonyNavigator() {
  const stackNavRef = useRef<any>(null);
  const sawProfileDocRef = useRef(false);

  useEffect(() => {
    const uid = auth().currentUser?.uid;
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
            nav.reset({ index: 0, routes: [{ name: 'MatrimonyHome' }] });
          }
        },
        () => {
          // Ignore snapshot transient permission errors on sign-out
        }
      );

    return () => {
      unsubscribe();
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
      <Stack.Screen name="MatrimonySplash" component={MatrimonySplashScreen} />
      <Stack.Screen name="MatrimonyWelcome" component={MatrimonyWelcomeScreen} />
      <Stack.Screen name="MatrimonyBasicDetails" component={MatrimonyBasicDetailsScreen} />
      <Stack.Screen name="MatrimonyPersonalDetails" component={MatrimonyPersonalDetailsScreen} />
      <Stack.Screen name="MatrimonyReligiousDetails" component={MatrimonyReligiousDetailsScreen} />
      <Stack.Screen name="MatrimonyLocationDetails" component={MatrimonyLocationDetailsScreen} />
      <Stack.Screen name="MatrimonyProfessionalDetails" component={MatrimonyProfessionalDetailsScreen} />
      <Stack.Screen name="MatrimonyAdditionalDetails" component={MatrimonyAdditionalDetailsScreen} />
      <Stack.Screen name="MatrimonyConsent" component={MatrimonyConsentScreen} />
      <Stack.Screen name="MatrimonyProfileSuccess" component={MatrimonyProfileSuccessScreen} />
      <Stack.Screen name="MatrimonyPhotoUpload" component={MatrimonyPhotoUploadScreen} />
      <Stack.Screen name="MatrimonyMyPhotos" component={MatrimonyMyPhotosScreen} />
      <Stack.Screen name="MatrimonyEditProfile" component={MatrimonyEditProfileScreen} />
      <Stack.Screen name="MatrimonyInterests" component={MatrimonyInterestsScreen} />
      <Stack.Screen name="MatrimonyInterestsHub" component={MatrimonyInterestsHubScreen} />
      <Stack.Screen name="MatrimonyHome" component={MatrimonyHomeScreen} />
      <Stack.Screen name="MatrimonyMatches" component={MatrimonyMatchesScreen} />
      <Stack.Screen name="MatrimonyMatchDetail" component={MatrimonyMatchDetailScreen} />
      <Stack.Screen name="MatrimonyMessages" component={MatrimonyMessagesScreen} />
      <Stack.Screen name="MatrimonyChat" component={MatrimonyChatScreen} />
      <Stack.Screen name="MatrimonySubmitApproval" component={MatrimonySubmitApprovalScreen} />
      <Stack.Screen name="MatrimonyStatus" component={MatrimonyStatusScreen} />
      <Stack.Screen name="MatrimonyUpgrade" component={MatrimonyUpgradeScreen} />
      <Stack.Screen name="MatrimonyPrivacySettings" component={MatrimonyPrivacySettingsScreen} />
      <Stack.Screen name="MatrimonyAccountSettings" component={MatrimonyAccountSettingsScreen} />
      <Stack.Screen name="MatrimonyNotifications" component={MatrimonyNotificationsScreen} />
      <Stack.Screen name="MatrimonyNotificationsFeed" component={MatrimonyNotificationsFeedScreen} />
      <Stack.Screen name="MatrimonyHiddenProfiles" component={MatrimonyHiddenProfilesScreen} />
      <Stack.Screen name="MatrimonyDeactivateAccount" component={MatrimonyDeactivateAccountScreen} />
      <Stack.Screen name="MatrimonyDeleteProfile" component={MatrimonyDeleteProfileScreen} />
    </Stack.Navigator>
  );
}
