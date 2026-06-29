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

    // Fired when user taps on the push notification
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      const nudgeType = data?.nudge_type;
      
      try {
        const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
        const { data: latestNudge } = await supabase
          .from('nudge_events')
          .select('id')
          .eq('user_id', user.id)
          .eq('nudge_type', nudgeType || 'protein_deficit')
          .gte('sent_at', todayStart)
          .is('opened_at', null)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestNudge) {
          await supabase
            .from('nudge_events')
            .update({
              opened_at: new Date().toISOString(),
              action_taken: 'opened',
              action_at: new Date().toISOString()
            })
            .eq('id', latestNudge.id);
        }
      } catch (err) {
        console.warn('Failed to update nudge_events on interaction:', err);
      }
    });

    return () => {
      subscription.remove();
    };
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

  await supabase.from('push_tokens').upsert({  
    user_id: userId,  
    token,  
    platform: Platform.OS,  
  }, { onConflict: 'user_id' });  
}  
