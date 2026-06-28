import React, { useEffect, useState } from 'react';  
import { useParams, Link } from 'react-router-dom';  
import { supabase } from '../lib/supabase';  
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function PatientDetail({ clinicUser }: { clinicUser: any }) {  
  const { id } = useParams();  
  const [patient, setPatient] = useState<any>(null);  
  const [chartData, setChartData] = useState<any[]>([]);  
  const [nudgeLog, setNudgeLog] = useState<any[]>([]);

  useEffect(() => {  
    loadPatient();  
  }, [id]);

  async function loadPatient() {  
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', id).single();  
    if (!profile || profile.clinic_id !== clinicUser.clinic_id) return;  
    setPatient(profile);

    const today = new Date().toISOString().split('T')[0];  
    const thirtyDaysAgo = new Date(Date.now() \- 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: proteinLogs } = await supabase  
      .from('protein_logs')  
      .select('amount_g, logged_at')  
      .eq('user_id', id)  
      .gte('logged_at', thirtyDaysAgo);

    const dailyMap: Record<string, number> = {};  
    for (const log of (proteinLogs || [])) {  
      const day = log.logged_at.split('T')[0];  
      dailyMap[day] = (dailyMap[day] || 0\) + log.amount_g;  
    }

    const chart = Object.entries(dailyMap).map(([day, amount]) => {  
      const pct = profile.protein_target_g ? (amount / profile.protein_target_g) * 100 : 0;  
      let color = '#ef4444';  
      if (pct >= 100\) color = '#10b981';  
      else if (pct >= 50\) color = '#f59e0b';  
      else if (pct >= 30\) color = '#f97316';  
      return { day: day.slice(5), amount: Math.round(pct), color };  
    }).slice(-30);

    setChartData(chart);

    const { data: nudges } = await supabase  
      .from('nudge_events')  
      .select('*')  
      .eq('user_id', id)  
      .gte('sent_at', thirtyDaysAgo)  
      .order('sent_at', { ascending: false });

    setNudgeLog(nudges || []);  
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

  if (!patient) return <div style={{ padding: 40 }}>Loading...</div>;

  return (  
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: 40 }}>  
      <Link to="/" style={{ color: '#0ea5e9', textDecoration: 'none', marginBottom: 24, display: 'inline-block' }}>← Back to Patient Panel</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>  
        <div>  
          <h1 style={{ color: '#f8fafc', fontSize: 32, margin: '0 0 8px' }}>{patient.first_name || 'Patient'}</h1>  
          <p style={{ color: '#94a3b8', margin: 0 }}>Tier: {patient.tier} • Weight: {patient.body_weight_kg}kg • Protein target: {Math.round(patient.protein_target_g)}g</p>  
        </div>  
        <button onClick={generateReport} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: '#0ea5e9', color: '#f8fafc', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>  
          Generate Report  
        </button>  
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>  
        {[  
          { label: 'Protein Adherence', value: '---', sub: 'This week / This month' },  
          { label: 'Hydration Adherence', value: '---', sub: 'This week / This month' },  
          { label: 'Nudge Response Rate', value: '---', sub: 'This week / This month' },  
          { label: 'Workout Completion', value: '---', sub: 'This week / This month' },  
        ].map((card, i) => (  
          <div key={i} style={{ background: '#1e293b', borderRadius: 16, padding: 24 }}>  
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>{card.label}</div>  
            <div style={{ color: '#f8fafc', fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>{card.value}</div>  
            <div style={{ color: '#64748b', fontSize: 12 }}>{card.sub}</div>  
          </div>  
        ))}  
      </div>

      <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, marginBottom: 32 }}>  
        <h3 style={{ color: '#f8fafc', margin: '0 0 16px' }}>30-Day Protein Timeline</h3>  
        <ResponsiveContainer width="100%" height={240}>  
          <BarChart data={chartData}>  
            <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 12 }} />  
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} label={{ value: '% of target', fill: '#94a3b8', angle: \-90, position: 'insideLeft' }} />  
            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc' }} />  
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>  
              {chartData.map((entry, index) => (  
                <Cell key={\`cell-${index}\`} fill={entry.color} />  
              ))}  
            </Bar>  
          </BarChart>  
        </ResponsiveContainer>  
      </div>

      <div style={{ background: '#1e293b', borderRadius: 16, padding: 24 }}>  
        <h3 style={{ color: '#f8fafc', margin: '0 0 16px' }}>Nudge Log</h3>  
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>  
          <thead>  
            <tr style={{ borderBottom: '1px solid #334155' }}>  
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 12 }}>Time</th>  
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 12 }}>Type</th>  
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 12 }}>Level</th>  
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 12 }}>Response</th>  
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