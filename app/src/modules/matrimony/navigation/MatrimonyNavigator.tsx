import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

const Stack = createNativeStackNavigator();

export default function MatrimonyNavigator() {
  return (
    <Stack.Navigator id="MatrimonyStack" initialRouteName="MatrimonySplash" screenOptions={{ headerShown: false }}>
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
    </Stack.Navigator>
  );
}
