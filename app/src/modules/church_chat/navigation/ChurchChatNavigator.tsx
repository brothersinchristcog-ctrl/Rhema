import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RhemaChatsScreen from '../screens/RhemaChatsScreen';
import RhemaChatRoomScreen from '../screens/RhemaChatRoomScreen';
import NewChatDirectoryScreen from '../screens/NewChatDirectoryScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import ContactInfoScreen from '../screens/ContactInfoScreen';
import ForwardMessageScreen from '../screens/ForwardMessageScreen';
import ArchivedChatsScreen from '../screens/ArchivedChatsScreen';

const Stack = createNativeStackNavigator();

export default function ChurchChatNavigator({ route }: any) {
  const initialRoomId = route?.params?.roomId;
  const initialScreen = initialRoomId ? 'RhemaChatRoom' : 'RhemaChats';

  return (
    <Stack.Navigator
      id="ChurchChatStack"
      initialRouteName={initialScreen}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="RhemaChats" component={RhemaChatsScreen} />
      <Stack.Screen
        name="RhemaChatRoom"
        component={RhemaChatRoomScreen}
        initialParams={initialRoomId ? route?.params : undefined}
      />
      <Stack.Screen name="NewChatDirectory" component={NewChatDirectoryScreen} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
      <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
      <Stack.Screen name="ContactInfo" component={ContactInfoScreen} />
      <Stack.Screen name="ForwardMessage" component={ForwardMessageScreen} />
      <Stack.Screen name="ArchivedChats" component={ArchivedChatsScreen} />
    </Stack.Navigator>
  );
}
