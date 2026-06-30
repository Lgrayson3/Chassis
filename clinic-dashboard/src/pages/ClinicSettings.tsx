import React, { useEffect, useState } from 'react';  
import { Link } from 'react-router-dom';  
import { supabase } from '../lib/supabase';

export default function ClinicSettings({ clinicUser }: { clinicUser: any }) {  
  const [patientCount, setPatientCount] = useState(0);  
  const clinic = clinicUser?.clinics || {};  
  const referralCode = clinic?.referral_code || 'PENDING-SETUP';

  useEffect(() => {  
    loadPatientCount();  
  }, []);

  async function loadPatientCount() {  
    const { count } = await supabase  
      .from('profiles')  
      .select('*', { count: 'exact', head: true })  
      .eq('clinic_id', clinicUser.clinic_id);  
    setPatientCount(count || 0);  
  }

  const copyToClipboard = (text: string) => {  
    navigator.clipboard.writeText(text);  
  };

  return (  
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: 40 }}>  
      <div style={{ marginBottom: 32 }}>  
        <Link to="/" style={{ color: '#0ea5e9', textDecoration: 'none' }}>← Back to Patient Panel</Link>  
      </div>

      <h1 style={{ color: '#f8fafc', fontSize: 28, margin: '0 0 32px' }}>Clinic Settings</h1>

      {/* Clinic Info */}  
      <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, marginBottom: 24 }}>  
        <h3 style={{ color: '#f8fafc', margin: '0 0 16px', fontSize: 18 }}>Clinic Information</h3>  
        <div style={{ marginBottom: 12 }}>  
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>Name</div>  
          <div style={{ color: '#f8fafc', fontSize: 16 }}>{clinic.name || '—'}</div>  
        </div>  
        <div>  
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>Address</div>  
          <div style={{ color: '#f8fafc', fontSize: 16 }}>{clinic.address || '—'}</div>  
        </div>  
      </div>

      {/* Patient Invite */}  
      <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, marginBottom: 24 }}>  
        <h3 style={{ color: '#f8fafc', margin: '0 0 16px', fontSize: 18 }}>Patient Invite</h3>  
          
        <div style={{ marginBottom: 16 }}>  
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>Referral Code</div>  
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>  
            <span style={{   
              fontFamily: 'monospace',   
              fontSize: 20,   
              color: '#0ea5e9',   
              background: '#0f172a',   
              padding: '8px 16px',   
              borderRadius: 8,  
              letterSpacing: 1  
            }}>  
              {referralCode}  
            </span>  
            <button   
              onClick={() => copyToClipboard(referralCode)}  
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#334155', color: '#f8fafc', cursor: 'pointer' }}  
            >  
              Copy code  
            </button>  
          </div>  
        </div>

        <div style={{ marginBottom: 16 }}>  
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>Invite Link</div>  
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>  
            <span style={{ color: '#cbd5e1', fontSize: 14 }}>  
              https://chassis-tan.vercel.app/join?code={referralCode}  
            </span>  
            <button   
              onClick={() => copyToClipboard(`https://chassis-tan.vercel.app/join?code=${referralCode}`)}  
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#334155', color: '#f8fafc', cursor: 'pointer' }}  
            >  
              Copy link  
            </button>  
          </div>  
        </div>

        <div style={{ color: '#94a3b8', fontSize: 14 }}>  
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>{patientCount}</span> active patients  
        </div>  
      </div>

      {/* Billing */}  
      <div style={{ background: '#1e293b', borderRadius: 16, padding: 24 }}>  
        <h3 style={{ color: '#f8fafc', margin: '0 0 16px', fontSize: 18 }}>Billing</h3>  
        <div style={{ marginBottom: 16 }}>  
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>Plan Status</div>  
          <div style={{ color: '#10b981', fontSize: 16, fontWeight: 600 }}>Active</div>  
        </div>  
        <button   
          style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: '#334155', color: '#94a3b8', fontSize: 14, cursor: 'not-allowed' }}  
          disabled  
        >  
          Manage Billing (Stripe integration pending)  
        </button>  
      </div>  
    </div>  
  );  
}