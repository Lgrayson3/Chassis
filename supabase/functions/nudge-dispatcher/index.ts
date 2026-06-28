import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const today = new Date().toISOString().split('T')[0]

    // Fetch profiles that have a push token
    const { data: profiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('id, first_name, push_token, protein_target_g')
      .not('push_token', 'is', null)

    if (profilesError) {
      console.error(`Error fetching profiles: ${profilesError.message}`)
      return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 })
    }

    console.log(`Checking nudges for ${profiles.length} profiles...`)
    const sentNudges = []

    for (const profile of profiles) {
      // Fetch user's protein log sum for today
      const { data: logs, error: logsError } = await supabaseClient
        .from('protein_logs')
        .select('amount_g')
        .eq('user_id', profile.id)
        .gte('logged_at', `${today}T00:00:00Z`)

      if (logsError) {
        console.error(`Error fetching logs for user ${profile.id}: ${logsError.message}`)
        continue
      }

      const proteinToday = (logs || []).reduce((sum, log) => sum + (log.amount_g || 0), 0)
      const target = profile.protein_target_g || 100

      if (proteinToday < target) {
        const messageText = `Hey ${profile.first_name || 'there'}! You've logged ${Math.round(proteinToday)}g of protein today. Hit your target of ${Math.round(target)}g to stay on track!`
        
        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              to: profile.push_token,
              title: 'Protein Goal Reminder',
              body: messageText,
              sound: 'default',
              data: { user_id: profile.id, nudge_type: 'protein_deficit' },
            }),
          })

          const resJson = await response.json()
          console.log(`Expo Push Response for ${profile.id}:`, resJson)

          // Log nudge event
          await supabaseClient.from('nudge_events').insert({
            user_id: profile.id,
            nudge_type: 'protein_deficit',
            level: 2,
            message: messageText,
            channel: 'push',
            action_taken: 'no_action',
          })

          sentNudges.push({ userId: profile.id, status: 'sent' })
        } catch (e: any) {
          console.error(`Failed to send push to user ${profile.id}: ${e.message}`)
        }
      }
    }

    return new Response(JSON.stringify({ triggered: true, sent_count: sentNudges.length, details: sentNudges }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error(`Nudge Dispatcher Error: ${err.message}`)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
