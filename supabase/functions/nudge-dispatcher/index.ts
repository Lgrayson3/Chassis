import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch profiles that have a push token
    const { data: profiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('id, first_name, push_token, protein_target_g, notification_meal_reminder')
      .not('push_token', 'is', null)

    if (profilesError) {
      console.error(`Error fetching profiles: ${profilesError.message}`)
      return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 })
    }

    console.log(`Checking nudges for ${profiles.length} profiles...`)
    const sentNudges = []

    for (const profile of profiles) {
      // If notifications are disabled globally for this user, skip them
      if (profile.notification_meal_reminder === false) {
        continue;
      }

      // Fetch user's latest logs within the last 48 hours
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const { data: logs, error: logsError } = await supabaseClient
        .from('protein_logs')
        .select('amount_g, logged_at')
        .eq('user_id', profile.id)
        .gte('logged_at', fortyEightHoursAgo)
        .order('logged_at', { ascending: false })

      if (logsError) {
        console.error(`Error fetching logs for user ${profile.id}: ${logsError.message}`)
        continue
      }

      let hoursSinceLastLog = 24.0 // Default to 24 hours if no logs exist
      let lastLogGrams = 0
      
      if (logs && logs.length > 0) {
        const lastLogTime = new Date(logs[0].logged_at).getTime()
        hoursSinceLastLog = (Date.now() - lastLogTime) / 3600000
        lastLogGrams = logs[0].amount_g
      }

      let nudgeType = 'protein_deficit'
      let level = 2
      let messageText = `Hey ${profile.first_name || 'there'}! It's been 4 hours since your last entry. Remember to log your protein to stay on track!`

      // Escalation / skipped meals warning logic
      if (hoursSinceLastLog >= 24.0) {
        // Level 5: Emergency Fuel (24+ hours of inactivity)
        nudgeType = 'emergency_fuel'
        level = 5
        messageText = `CRITICAL: It has been over 24 hours since your last protein log. Consistent intake is key to protecting your lean mass. Please log a meal immediately.`
      } else if (hoursSinceLastLog >= 16.0) {
        // Level 4: Catabolic warning (approx 3 meals missed)
        nudgeType = 'catabolic_warning'
        level = 4
        messageText = `Warning ⚠️: 16+ hours since your last log. Your body may enter a catabolic state (muscle wasting). Please consume protein now.`
      } else if (hoursSinceLastLog >= 4.0) {
        // Level 2: Standard 4-6 hour reminder
        nudgeType = 'protein_deficit'
        level = 2
        messageText = `Hey ${profile.first_name || 'there'}! It's been 4 hours since your last meal. Remember to log your protein!`
      } else {
        // User has logged recently (within 4 hours), no nudge needed
        continue
      }

      // Avoid spamming if a similar level nudge was sent recently (within 4 hours)
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      const { data: recentNudge } = await supabaseClient
        .from('nudge_events')
        .select('id')
        .eq('user_id', profile.id)
        .eq('nudge_type', nudgeType)
        .gte('sent_at', fourHoursAgo)
        .limit(1)
        .maybeSingle()

      if (recentNudge) {
        console.log(`Skipping nudge for ${profile.id} to prevent spamming.`)
        continue
      }

      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            to: profile.push_token,
            title: level >= 4 ? '⚠️ Nutritional Warning' : 'Meal & Protein Reminder',
            body: messageText,
            sound: 'default',
            data: { user_id: profile.id, nudge_type: nudgeType },
          }),
        })

        const resJson = await response.json()
        console.log(`Push Response for ${profile.id}:`, resJson)

        // Log nudge event to database with 'no_action' status
        await supabaseClient.from('nudge_events').insert({
          user_id: profile.id,
          nudge_type: nudgeType,
          level: level,
          message: messageText,
          channel: 'push',
          action_taken: 'no_action',
        })

        sentNudges.push({ userId: profile.id, status: 'sent', type: nudgeType })
      } catch (e: any) {
        console.error(`Failed to send push to user ${profile.id}: ${e.message}`)
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
