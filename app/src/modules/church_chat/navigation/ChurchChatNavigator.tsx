import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

export default function ChurchChatNavigator({ route, navigation }: any) {
  const initialRoomId = route?.params?.params?.roomId || route?.params?.roomId;
  const initialScreen = initialRoomId ? 'RhemaChatRoom' : 'RhemaChats';
  const initialRoomParams = initialRoomId
    ? route?.params?.params || route?.params
    : undefined;

  React.useEffect(() => {
    const incomingRoomId = route?.params?.params?.roomId || route?.params?.roomId;
    if (incomingRoomId && route?.params?.screen !== 'RhemaChatRoom') {
      navigation.navigate('RhemaChatRoom', route?.params?.params || route?.params);
    }
  }, [navigation, route?.params]);

  return (
    <Stack.Navigator
      id="ChurchChatStack"
      initialRouteName={initialScreen}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name="RhemaChats"
        getComponent={() => require('../screens/RhemaChatsScreen').default}
      />
      <Stack.Screen
        name="RhemaChatRoom"
        getComponent={() => require('../screens/RhemaChatRoomScreen').default}
        initialParams={initialRoomParams}
      />
      <Stack.Screen
        name="NewChatDirectory"
        getComponent={() => require('../screens/NewChatDirectoryScreen').default}
      />
      <Stack.Screen
        name="CreateGroup"
        getComponent={() => require('../screens/CreateGroupScreen').default}
      />
      <Stack.Screen
        name="GroupInfo"
        getComponent={() => require('../screens/GroupInfoScreen').default}
      />
      <Stack.Screen
        name="ContactInfo"
        getComponent={() => require('../screens/ContactInfoScreen').default}
      />
      <Stack.Screen
        name="ForwardMessage"
        getComponent={() => require('../screens/ForwardMessageScreen').default}
      />
      <Stack.Screen
        name="ArchivedChats"
        getComponent={() => require('../screens/ArchivedChatsScreen').default}
      />
    </Stack.Navigator>
  );
}
