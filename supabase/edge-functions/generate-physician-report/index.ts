import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import PDFDocument from "npm:pdfkit"
import { Buffer } from "https://deno.land/std@0.177.0/node/buffer.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, month } = await req.json()

    if (!user_id || !month) {
      return new Response(JSON.stringify({ error: 'Missing user_id or month' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch patient profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch protein logs for the month
    const startOfMonth = `${month}-01T00:00:00Z`
    // Simple end of month (approx 31 days)
    const endOfMonth = `${month}-31T23:59:59Z`

    const { data: proteinLogs } = await supabaseClient
      .from('protein_logs')
      .select('*')
      .eq('user_id', user_id)
      .gte('logged_at', startOfMonth)
      .lte('logged_at', endOfMonth)

    // Fetch workouts for the month
    const { data: workoutLogs } = await supabaseClient
      .from('workout_logs')
      .select('*')
      .eq('user_id', user_id)
      .gte('scheduled_for', startOfMonth.split('T')[0])
      .lte('scheduled_for', endOfMonth.split('T')[0])

    // Generate PDF
    const pdfBytes = await new Promise<Uint8Array>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 })
        const chunks: any[] = []
        doc.on('data', (chunk) => chunks.push(chunk))
        doc.on('end', () => {
          resolve(new Uint8Array(Buffer.concat(chunks)))
        })
        doc.on('error', (err) => reject(err))

        // Document Header
        doc.fillColor('#0f172a').fontSize(26).text('CHASSIS HEALTH', { align: 'center' })
        doc.fontSize(14).fillColor('#64748b').text('Monthly Physician Report', { align: 'center' })
        doc.moveDown(2)

        // Patient Metadata Box
        doc.fillColor('#1e293b').rect(50, doc.y, 500, 100).fill('#f8fafc')
        doc.fillColor('#0f172a').fontSize(12)
        doc.text(`Patient Name: ${profile.first_name || 'Unnamed'}`, 70, doc.y + 15)
        doc.text(`Report Period: ${month}`, 70, doc.y + 5)
        doc.text(`Weight: ${profile.body_weight_kg || '—'} kg`, 70, doc.y + 5)
        doc.text(`Daily Protein Target: ${profile.protein_target_g || '—'} g`, 70, doc.y + 5)
        doc.text(`Subscription Tier: ${profile.subscription_status || 'essential'}`, 70, doc.y + 5)
        doc.moveDown(3)

        // Reset pointer to margin left
        doc.x = 50

        // Protein Adherence
        doc.fontSize(16).fillColor('#0f172a').text('Protein Intake Summary', { underline: true })
        doc.moveDown()
        const logs = proteinLogs || []
        const totalProtein = logs.reduce((sum, log) => sum + (log.amount_g || 0), 0)
        const avgProtein = logs.length > 0 ? (totalProtein / logs.length).toFixed(1) : '0'
        doc.fontSize(12).text(`Total protein logged: ${totalProtein} g across ${logs.length} entries.`)
        doc.text(`Average per log: ${avgProtein} g.`)
        doc.moveDown()

        // Workouts Status
        doc.fontSize(16).text('Workout History', { underline: true })
        doc.moveDown()
        const workouts = workoutLogs || []
        const completed = workouts.filter(w => w.status === 'completed').length
        const underfueled = workouts.filter(w => w.status === 'skipped_underfueled').length
        doc.fontSize(12).text(`Workouts scheduled: ${workouts.length}`)
        doc.text(`Workouts completed: ${completed}`)
        doc.text(`Workouts skipped due to under-fueling: ${underfueled}`)
        doc.moveDown(2)

        // Clinical assessment guidelines
        doc.fontSize(16).text('Clinical Interpretation Guidelines', { underline: true })
        doc.moveDown()
        doc.fontSize(10).fillColor('#475569')
        doc.text('This report monitors lean muscle mass preservation protocols during GLP-1 therapy. Under-fueling (protein intake < 1.4g/kg/day) automatically gates active strength training sessions to prevent catabolic muscle loss. Verify hydration logs and patient adherence markers if patient fails to progress.', { lineGap: 4 })

        doc.end()
      } catch (e) {
        reject(e)
      }
    })

    // Upload PDF to Supabase Storage
    const filename = `${user_id}/${month}-report.pdf`
    
    // Check if bucket exists, or try upload (Supabase Storage doesn't auto-create, but we assume it's created or we upload directly)
    const { error: uploadError } = await supabaseClient.storage
      .from('physician-reports')
      .upload(filename, pdfBytes, {
        contentType: 'application/pdf',
        upsert: True,
      })

    if (uploadError) {
      console.error(`Error uploading report PDF: ${uploadError.message}`)
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate signed URL
    const { data: signedData, error: signedError } = await supabaseClient.storage
      .from('physician-reports')
      .createSignedUrl(filename, 60 * 60) // 1 hour validity

    if (signedError || !signedData) {
      console.error(`Error generating signed URL: ${signedError?.message}`)
      return new Response(JSON.stringify({ error: signedError?.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ signed_url: signedData.signedUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error(`Generate Report Error: ${err.message}`)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
