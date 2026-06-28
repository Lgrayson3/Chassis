import { useEffect } from 'react';  
import { Platform } from 'react-native';  
import * as Device from 'expo-device';  
import * as Notifications from 'expo-notifications';  
import { supabase } from '../lib/supabase';  
import { useAuth } from './useAuth';

Notifications.setNotificationHandler({  
  handleNotification: async () => ({  
    shouldShowAlert: true,  
    shouldPlaySound: false,  
    shouldSetBadge: false,  
  }),  
});

export function usePushNotifications() {  
  const { user } = useAuth();

  useEffect(() => {  
    if (!user) return;  
    registerPushToken(user.id);  
  }, [user]);  
}

async function registerPushToken(userId: string) {  
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();  
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {  
    const { status } = await Notifications.requestPermissionsAsync();  
    finalStatus = status;  
  }

  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getExpoPushTokenAsync();  
  const token = tokenData.data;

  await supabase.from('profiles').update({  
    push_token: token,  
  }).eq('id', userId);  
}  
