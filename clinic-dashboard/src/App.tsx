import React, { useEffect, useState } from 'react';  
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';  
import { supabase } from './lib/supabase';  
import LoginPage from './pages/LoginPage';  
import PatientPanel from './pages/PatientPanel';  
import PatientDetail from './pages/PatientDetail';  
import ClinicSettings from './pages/ClinicSettings';

function App() {  
  const [session, setSession] = useState<any>(null);  
  const [clinicUser, setClinicUser] = useState<any>(null);  
  const [loading, setLoading] = useState(true);

  useEffect(() => {  
    supabase.auth.getSession().then(({ data: { session } }) => {  
      setSession(session);  
      if (session?.user) checkClinicUser(session.user.id);  
      else setLoading(false);  
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {  
      setSession(session);  
      if (session?.user) checkClinicUser(session.user.id);  
      else { setClinicUser(null); setLoading(false); }  
    });

    return () => listener.subscription.unsubscribe();  
  }, []);

  async function checkClinicUser(userId: string) {  
    const { data, error } = await supabase.from('clinic_users').select('*, clinics(*)').eq('id', userId).single();  
    if (error || !data) {  
      await supabase.auth.signOut();  
      setClinicUser(null);  
    } else {  
      setClinicUser(data);  
    }  
    setLoading(false);  
  }

  if (loading) return <div style={{ background: '#0f172a', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f8fafc' }}>Loading...</div>;

  return (  
    <BrowserRouter>  
      {!session ? (  
        <Routes><Route path="*" element={<LoginPage />} /></Routes>  
      ) : !clinicUser ? (  
        <Routes><Route path="*" element={<div style={{ padding: 40, textAlign: 'center' }}>Access not authorized</div>} /></Routes>  
      ) : (  
        <Routes>  
          <Route path="/" element={<PatientPanel clinicUser={clinicUser} />} />  
          <Route path="/patient/:id" element={<PatientDetail clinicUser={clinicUser} />} />  
          <Route path="/settings" element={<ClinicSettings clinicUser={clinicUser} />} />  
          <Route path="*" element={<Navigate to="/" />} />  
        </Routes>  
      )}  
    </BrowserRouter>  
  );  
}

export default App;  
