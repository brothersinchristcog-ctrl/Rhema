// @ts-nocheck - Forced IDE refresh
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

export type AdminGalleryStackParamList = {
  AdminGalleryDashboard: undefined;
  AdminGalleryCreateAlbum: undefined;
  AdminGalleryAlbumDetail: { albumId: string; albumName: string; albumDescription?: string };
};

const Stack = createNativeStackNavigator<AdminGalleryStackParamList>();

export default function AdminGalleryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen
        name="AdminGalleryDashboard"
        getComponent={() => require('./AdminGalleryDashboard').default}
      />
      <Stack.Screen 
        name="AdminGalleryCreateAlbum" 
        getComponent={() => require('./AdminGalleryCreateAlbum').default} 
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="AdminGalleryAlbumDetail"
        getComponent={() => require('./AdminGalleryAlbumDetail').default}
      />
    </Stack.Navigator>
  );
}
