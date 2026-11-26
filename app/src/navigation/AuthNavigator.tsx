import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Theme from '../theme/Theme';

export type AuthStackParamList = {
  Login: {
    showPhoneInput?: boolean;
    fromJoinSuccess?: boolean;
    invitedPhone?: string;
    invitedName?: string;
    invitedChurchId?: string;
    invitedChurchName?: string;
    inviteId?: string;
    invitedRelation?: string;
    invitedByMemberName?: string;
  } | undefined;
  SignUp: undefined;
  RegistrationSuccess: undefined;
  ApprovalPending: { 
    phoneNumber: string; 
    churchId?: string; 
    applicantName?: string;
    city?: string;
    gender?: string;
    dob?: string;
    applicantData?: any;
  };
  VerifyOtp: {
    confirmation?: any;
    verificationId?: string;
    phoneNumber: string;
    contactId?: string;
    memberName?: string;
    formData?: any;
    isSignUp?: boolean;
    invitedChurchId?: string;
    isGuestInvite?: boolean;
  };
  ChurchSelection: { code?: string } | undefined;
  JoinSuccess: { churchName: string; isNewChurch?: boolean; churchCode?: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

import { useChurch } from '../context/ChurchContext';

export default function AuthNavigator() {
  const { churchId } = useChurch();

  return (
    <Stack.Navigator
      id="auth-stack"
      initialRouteName="Login"
      screenOptions={{
        headerStyle: { backgroundColor: Theme.Colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen
        name="Login"
        getComponent={() => require('../screens/auth/LoginScreen').default}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SignUp"
        getComponent={() => require('../screens/auth/SignUpScreen').default}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RegistrationSuccess"
        getComponent={() => require('../screens/auth/RegistrationSuccessScreen').default}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ApprovalPending"
        getComponent={() => require('../screens/auth/ApprovalPendingScreen').default}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VerifyOtp"
        getComponent={() => require('../screens/auth/VerifyOtpScreen').default}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChurchSelection"
        getComponent={() => require('../screens/auth/ChurchSelectionScreen').default}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JoinSuccess"
        getComponent={() => require('../screens/auth/JoinSuccessScreen').default}
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
