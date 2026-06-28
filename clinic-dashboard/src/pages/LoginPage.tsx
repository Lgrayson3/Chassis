import React, { useState } from 'react';  
import { supabase } from '../lib/supabase';

export default function LoginPage() {  
  const \[email, setEmail\] \= useState('');  
  const \[password, setPassword\] \= useState('');  
  const \[error, setError\] \= useState('');

  const handleLogin \= async (e: React.FormEvent) \=\> {  
    e.preventDefault();  
    setError('');  
    const { error } \= await supabase.auth.signInWithPassword({ email, password });  
    if (error) setError('Access not authorized');  
  };

  return (  
    \<div style={{ minHeight: '100vh', background: '\#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}\>  
      \<div style={{ width: 360, padding: 40 }}\>  
        \<h1 style={{ color: '\#f8fafc', fontSize: 32, marginBottom: 8, fontFamily: 'Playfair Display, serif' }}\>Chassis\</h1\>  
        \<p style={{ color: '\#94a3b8', marginBottom: 32 }}\>Clinic Dashboard\</p\>  
        \<form onSubmit={handleLogin}\>  
          \<input  
            type="email"  
            placeholder="Email"  
            value={email}  
            onChange={e \=\> setEmail(e.target.value)}  
            style={{ width: '100%', padding: 14, marginBottom: 12, borderRadius: 12, border: 'none', background: '\#1e293b', color: '\#f8fafc', fontSize: 16 }}  
          /\>  
          \<input  
            type="password"  
            placeholder="Password"  
            value={password}  
            onChange={e \=\> setPassword(e.target.value)}  
            style={{ width: '100%', padding: 14, marginBottom: 24, borderRadius: 12, border: 'none', background: '\#1e293b', color: '\#f8fafc', fontSize: 16 }}  
          /\>  
          \<button type="submit" style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '\#0ea5e9', color: '\#f8fafc', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}\>  
            Sign In  
          \</button\>  
        \</form\>  
        {error && \<p style={{ color: '\#ef4444', marginTop: 16, textAlign: 'center' }}\>{error}\</p\>}  
      \</div\>  
    \</div\>  
  );  
}