import React, { useEffect, useState } from 'react';  
import { Link } from 'react-router-dom';  
import { supabase } from '../lib/supabase';

export default function PatientPanel({ clinicUser }: { clinicUser: any }) {  
  const [patients, setPatients] = useState<any[]>([]);  
  const [loading, setLoading] = useState(true);

  // Search and filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'On Track' | 'Needs Attention' | 'Non-Compliant'>('All');

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

  // Client-side filtering logic
  const filteredPatients = patients.filter(p => {
    const matchesSearch = !search.trim() || (p.first_name || '').toLowerCase().includes(search.toLowerCase().trim());
    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div style={{ padding: 40, color: '#f8fafc', background: '#0f172a', minHeight: '100vh' }}>Loading patients...</div>;

  return (  
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: 40 }}>  
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>  
        <div>  
          <h1 style={{ color: '#f8fafc', fontSize: 28, margin: 0 }}>Patient Panel</h1>  
          <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>{clinicUser.clinics?.name}</p>  
        </div>  
        <Link to="/settings" style={{ color: '#0ea5e9', textDecoration: 'none', fontWeight: 600 }}>Settings</Link>  
      </div>

      {/* Search and Filters Controls */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input 
          type="text"
          placeholder="Search patients by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#f8fafc',
            fontSize: 14,
            width: '280px',
            outline: 'none'
          }}
        />
        
        <div style={{ display: 'flex', gap: 8 }}>
          {(['All', 'On Track', 'Needs Attention', 'Non-Compliant'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                border: 'none',
                background: statusFilter === status ? '#0ea5e9' : '#1e293b',
                color: '#f8fafc',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'background 0.2s'
              }}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Patients Table */}
      <div style={{ background: '#1e293b', borderRadius: 16, overflow: 'hidden', border: '1px solid #334155' }}>  
        {filteredPatients.length === 0 ? (
          <div style={{ padding: 40, color: '#94a3b8', textAlign: 'center' }}>No patients found matching the criteria.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>  
            <thead>  
              <tr style={{ borderBottom: '1px solid #334155' }}>  
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Patient</th>  
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Protein Avg</th>  
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nudge Response</th>  
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Workouts</th>  
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>  
              </tr>  
            </thead>  
            <tbody>  
              {filteredPatients.map(p => (  
                <tr key={p.id} style={{ borderBottom: '1px solid #334155' }}>  
                  <td style={{ padding: '16px 24px' }}>  
                    <Link to={`/patient/${p.id}`} style={{ color: '#0ea5e9', textDecoration: 'none', fontWeight: 600 }}>  
                      {p.first_name || 'Unnamed'}  
                    </Link>  
                    <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Started {new Date(p.created_at).toLocaleDateString()}</div>  
                  </td>  
                  <td style={{ padding: '16px 24px', color: '#f8fafc', fontSize: 15, fontWeight: 500 }}>{Math.round(p.proteinPct)}%</td>  
                  <td style={{ padding: '16px 24px', color: '#f8fafc', fontSize: 15, fontWeight: 500 }}>{Math.round(p.responseRate)}%</td>  
                  <td style={{ padding: '16px 24px', color: '#f8fafc', fontSize: 15, fontWeight: 500 }}>{p.completedWorkouts}</td>  
                  <td style={{ padding: '16px 24px' }}>  
                    <span style={{ background: p.statusColor + '15', color: p.statusColor, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${p.statusColor}30` }}>  
                      {p.status}  
                    </span>  
                  </td>  
                </tr>  
              ))}  
            </tbody>  
          </table>  
        )}
      </div>  
    </div>  
  );  
}