import React, { useEffect, useState } from 'react';  
import { Link } from 'react-router-dom';  
import { supabase } from '../lib/supabase';

export default function PatientPanel({ clinicUser }: { clinicUser: any }) {  
  const [patients, setPatients] = useState<any[]>([]);  
  const [loading, setLoading] = useState(true);

  useEffect(() => {  
    loadPatients();  
  }, []);

  async function loadPatients() {  
    const { data, error } = await supabase  
      .rpc('get_clinic_patient_summary', { clinic_id_param: clinicUser.clinic_id });

    if (error) {
      console.error('Error loading patients:', error);
      setPatients([]);
    } else {
      const formatted = (data || []).map((p: any) => ({
        ...p,
        proteinPct: p.protein_pct,
        responseRate: p.response_rate,
        completedWorkouts: p.completed_workouts,
        statusColor: p.status_color
      }));
      setPatients(formatted);
    }
    setLoading(false);  
  }

  if (loading) return <div style={{ padding: 40 }}>Loading patients...</div>;

  return (  
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: 40 }}>  
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>  
        <div>  
          <h1 style={{ color: '#f8fafc', fontSize: 28, margin: 0 }}>Patient Panel</h1>  
          <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>{clinicUser.clinics?.name}</p>  
        </div>  
        <Link to="/settings" style={{ color: '#0ea5e9', textDecoration: 'none' }}>Settings</Link>  
      </div>

      <div style={{ background: '#1e293b', borderRadius: 16, overflow: 'hidden' }}>  
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>  
          <thead>  
            <tr style={{ borderBottom: '1px solid #334155' }}>  
              <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Patient</th>  
              <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Protein Avg</th>  
              <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Nudge Response</th>  
              <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Workouts</th>  
              <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Status</th>  
            </tr>  
          </thead>  
          <tbody>  
            {patients.map(p => (  
              <tr key={p.id} style={{ borderBottom: '1px solid #334155' }}>  
                <td style={{ padding: '16px 24px' }}>  
                  <Link to={\`/patient/${p.id}\`} style={{ color: '#0ea5e9', textDecoration: 'none', fontWeight: 600 }}>  
                    {p.first_name || 'Unnamed'}  
                  </Link>  
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Started {new Date(p.created_at).toLocaleDateString()}</div>  
                </td>  
                <td style={{ padding: '16px 24px', color: '#f8fafc' }}>{Math.round(p.proteinPct)}%</td>  
                <td style={{ padding: '16px 24px', color: '#f8fafc' }}>{Math.round(p.responseRate)}%</td>  
                <td style={{ padding: '16px 24px', color: '#f8fafc' }}>{p.completedWorkouts}</td>  
                <td style={{ padding: '16px 24px' }}>  
                  <span style={{ background: p.statusColor + '20', color: p.statusColor, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>  
                    {p.status}  
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