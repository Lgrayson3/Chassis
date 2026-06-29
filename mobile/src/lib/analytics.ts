import { supabase } from './supabase';

export async function trackEvent(name: string, properties: Record<string, any> = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    
    await supabase.from('analytics_events').insert({
      user_id: userId,
      event_name: name,
      properties,
      occurred_at: new Date().toISOString()
    });
  } catch (err) {
    // Analytics failures must never break the user flow
    console.warn('Analytics failure (swallowed):', err);
  }
}
