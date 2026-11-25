import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PastorEvent } from '../types/event';

export type PastorEventStackParamList = {
  Dashboard: undefined;
  EventDetail: { event: PastorEvent; allEvents: PastorEvent[] };
  RoutePlanner: { events: PastorEvent[] };
  EventMap: { events: PastorEvent[] };
  CreateEvent: { editEvent?: PastorEvent } | undefined;
  AIAssistant: undefined;
};

const Stack = createNativeStackNavigator<PastorEventStackParamList>();

export default function PastorEventNavigator() {
  return (
    <Stack.Navigator
      id="pastor-event-stack"
      screenOptions={{
        headerShown: false
      }}
    >
      <Stack.Screen 
        name="Dashboard" 
        getComponent={() => require('../screens/admin/pastor_events/PastorEventDashboard').default} 
      />
      <Stack.Screen 
        name="EventDetail" 
        getComponent={() => require('../screens/admin/pastor_events/PastorEventDetail').default} 
      />
      <Stack.Screen 
        name="RoutePlanner" 
        getComponent={() => require('../screens/admin/pastor_events/PastorEventRoutePlanner').default} 
      />
      <Stack.Screen 
        name="EventMap" 
        getComponent={() => require('../screens/admin/pastor_events/PastorEventMap').default} 
      />
      <Stack.Screen 
        name="CreateEvent" 
        getComponent={() => require('../screens/admin/pastor_events/CreatePastorEvent').default} 
      />
      <Stack.Screen 
        name="AIAssistant" 
        getComponent={() => require('../screens/admin/pastor_events/AIAssistantModal').default} 
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
