import React, { useEffect, useState } from 'react';  
import { useParams, Link } from 'react-router-dom';  
import { supabase } from '../lib/supabase';  
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function PatientDetail({ clinicUser }: { clinicUser: any }) {  
  const { id } = useParams();  
  const [patient, setPatient] = useState<any>(null);  
  const [chartData, setChartData] = useState<any[]>([]);  
  const [nudgeLog, setNudgeLog] = useState<any[]>([]);
  const [period, setPeriod] = useState<'7d' | '30d'>('30d');

  // Stats state
  const [stats, setStats] = useState({
    proteinAdherence: 0,
    nudgeResponseRate: 100,
    workoutCompletion: 0,
    daysActive: 0
  });

  useEffect(() => {  
    loadPatient();  
  }, [id, period]);

  async function loadPatient() {  
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', id).single();  
    if (!profile || profile.clinic_id !== clinicUser.clinic_id) return;  
    setPatient(profile);

    const daysInPeriod = period === '7d' ? 7 : 30;
    const dateLimit = new Date(Date.now() - daysInPeriod * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 1. Fetch protein logs
    const { data: proteinLogs } = await supabase  
      .from('protein_logs')  
      .select('amount_g, logged_at')  
      .eq('user_id', id)  
      .gte('logged_at', dateLimit);

    const allDates = Array.from({ length: daysInPeriod }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (daysInPeriod - 1 - i));
      return d.toISOString().split('T')[0];
    });

    const dailyProtein: Record<string, number> = {};  
    for (const log of (proteinLogs || [])) {  
      const day = log.logged_at.split('T')[0];  
      dailyProtein[day] = (dailyProtein[day] || 0) + log.amount_g;  
    }

    // Protein Adherence calculation (Avg % of target, days with no logs are 0)
    const proteinAdherence = allDates.reduce((sum, day) => {
      const pct = dailyProtein[day] ? (dailyProtein[day] / profile.protein_target_g) * 100 : 0;
      return sum + pct;
    }, 0) / daysInPeriod;

    // Build timeline chart data
    const chart = allDates.map(day => {  
      const amount = dailyProtein[day] || 0;
      const pct = profile.protein_target_g ? (amount / profile.protein_target_g) * 100 : 0;  
      let color = '#ef4444';  
      if (pct >= 100) color = '#10b981';  
      else if (pct >= 50) color = '#f59e0b';  
      else if (pct >= 30) color = '#f97316';  
      return { day: day.slice(5), amount: Math.round(pct), color };  
    });

    setChartData(chart);

    // 2. Fetch nudge events
    const { data: nudges } = await supabase  
      .from('nudge_events')  
      .select('*')  
      .eq('user_id', id)  
      .gte('sent_at', dateLimit)  
      .order('sent_at', { ascending: false });

    const currentNudges = nudges || [];
    setNudgeLog(currentNudges);  

    const totalNudges = currentNudges.length;
    const respondedNudges = currentNudges.filter(n => n.action_taken && n.action_taken !== 'no_action' && n.action_taken !== 'no_response').length;
    const nudgeResponseRate = totalNudges > 0 ? (respondedNudges / totalNudges) * 100 : 100;

    // 3. Fetch workout logs
    const { data: workoutLogs } = await supabase
      .from('workout_logs')
      .select('status')
      .eq('user_id', id)
      .gte('scheduled_for', dateLimit);

    const currentWorkoutLogs = workoutLogs || [];
    const completedWorkouts = currentWorkoutLogs.filter(w => w.status === 'completed').length;
    const scheduledWorkouts = currentWorkoutLogs.filter(w => w.status !== 'skipped_underfueled').length;
    const workoutCompletion = scheduledWorkouts > 0 ? (completedWorkouts / scheduledWorkouts) * 100 : 0;

    // Days Active = count of days with at least one protein log entry
    const daysActive = Object.keys(dailyProtein).length;

    setStats({
      proteinAdherence,
      nudgeResponseRate,
      workoutCompletion,
      daysActive
    });
  }

  async function generateReport() {  
    const month = new Date().toISOString().slice(0, 7);  
    const { data } = await supabase.functions.invoke('generate-physician-report', {  
      body: { user_id: id, month },  
    });  
    if (data?.signed_url) {  
      window.open(data.signed_url, '_blank');  
    }  
  }  

  if (!patient) return <div style={{ padding: 40, color: '#f8fafc' }}>Loading...</div>;

  const durationLabel = period === '7d' ? 'last 7 days' : 'last 30 days';

  return (  
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: 40 }}>  
      <Link to="/" style={{ color: '#0ea5e9', textDecoration: 'none', marginBottom: 24, display: 'inline-block' }}>← Back to Patient Panel</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>  
        <div>  
          <h1 style={{ color: '#f8fafc', fontSize: 32, margin: '0 0 8px' }}>{patient.first_name || 'Patient'}</h1>  
          <p style={{ color: '#94a3b8', margin: 0 }}>Tier: {patient.tier === 'glp1' ? 'GLP-1 Program' : 'Longevity Program'} • Weight: {patient.body_weight_kg}kg • Protein target: {Math.round(patient.protein_target_g)}g</p>  
        </div>  
        <button onClick={generateReport} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: '#0ea5e9', color: '#f8fafc', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>  
          Generate Report  
        </button>  
      </div>

      {/* Period Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button 
          onClick={() => setPeriod('7d')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: period === '7d' ? '#0ea5e9' : '#1e293b',
            color: '#f8fafc',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600
          }}
        >
          7 Days
        </button>
        <button 
          onClick={() => setPeriod('30d')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: period === '30d' ? '#0ea5e9' : '#1e293b',
            color: '#f8fafc',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600
          }}
        >
          30 Days
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>  
        {[  
          { label: 'Protein Adherence', value: `${Math.round(stats.proteinAdherence)}%`, sub: `Average daily target met (${durationLabel})` },  
          { label: 'Nudge Response Rate', value: `${Math.round(stats.nudgeResponseRate)}%`, sub: `Action taken on alerts (${durationLabel})` },  
          { label: 'Workout Completion', value: `${Math.round(stats.workoutCompletion)}%`, sub: `Completed vs scheduled (${durationLabel})` },  
          { label: 'Days Active', value: stats.daysActive.toString(), sub: `Days with logged items (${durationLabel})` },  
        ].map((card, i) => (  
          <div key={i} style={{ background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>  
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{card.label}</div>  
            <div style={{ color: '#f8fafc', fontSize: 32, fontWeight: 'bold', marginBottom: 4 }}>{card.value}</div>  
            <div style={{ color: '#64748b', fontSize: 12 }}>{card.sub}</div>  
          </div>  
        ))}  
      </div>

      <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, marginBottom: 32, border: '1px solid #334155' }}>  
        <h3 style={{ color: '#f8fafc', margin: '0 0 16px' }}>{period === '7d' ? '7-Day' : '30-Day'} Protein Timeline</h3>  
        <ResponsiveContainer width="100%" height={240}>  
          <BarChart data={chartData}>  
            <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 12 }} />  
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} label={{ value: '% of target', fill: '#94a3b8', angle: -90, position: 'insideLeft', offset: 0 }} />  
            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc' }} />  
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>  
              {chartData.map((entry, index) => (  
                <Cell key={`cell-${index}`} fill={entry.color} />  
              ))}  
            </Bar>  
          </BarChart>  
        </ResponsiveContainer>  
      </div>

      <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>  
        <h3 style={{ color: '#f8fafc', margin: '0 0 16px' }}>Nudge Log</h3>  
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>  
          <thead>  
            <tr style={{ borderBottom: '1px solid #334155' }}>  
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>Time</th>  
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>Type</th>  
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>Level</th>  
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>Response</th>  
            </tr>  
          </thead>  
          <tbody>  
            {nudgeLog.map((n, i) => (  
              <tr key={i} style={{ borderBottom: '1px solid #334155' }}>  
                <td style={{ padding: '12px 16px', color: '#f8fafc', fontSize: 13 }}>{new Date(n.sent_at).toLocaleString()}</td>  
                <td style={{ padding: '12px 16px', color: '#f8fafc', fontSize: 13 }}>{n.nudge_type}</td>  
                <td style={{ padding: '12px 16px', color: '#f8fafc', fontSize: 13 }}>{n.level}</td>  
                <td style={{ padding: '12px 16px', fontSize: 13 }}>  
                  <span style={{ color: n.action_taken === 'logged' ? '#10b981' : n.action_taken === 'dismissed' ? '#f59e0b' : '#ef4444' }}>  
                    {n.action_taken || 'no_action'}  
                  </span>  
                </td>  
              </tr>  
            ))}  
          </tbody>  
        </table>  
      </div>  
    </div>  
  );  
}