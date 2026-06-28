import React, { createContext, useContext, useEffect, useState } from 'react';  
import { supabase } from '../lib/supabase';

interface AuthContextType {  
  session: any;  
  user: any;  
  loading: boolean;  
  signIn: (email: string, password: string) => Promise<void>;  
  signUp: (email: string, password: string) => Promise<void>;  
  signOut: () => Promise<void>;  
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {  
  const [session, setSession] = useState<any>(null);  
  const [user, setUser] = useState<any>(null);  
  const [loading, setLoading] = useState(true);

  useEffect(() => {  
    supabase.auth.getSession().then(({ data: { session } }) => {  
      setSession(session);  
      setUser(session?.user ?? null);  
      setLoading(false);  
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {  
      setSession(session);  
      setUser(session?.user ?? null);  
      setLoading(false);  
    });

    return () => listener.subscription.unsubscribe();  
  }, []);

  const signIn = async (email: string, password: string) => {  
    const { error } = await supabase.auth.signInWithPassword({ email, password });  
    if (error) throw error;  
  };

  const signUp = async (email: string, password: string) => {  
    const { error } = await supabase.auth.signUp({ email, password });  
    if (error) throw error;  
  };

  const signOut = async () => {  
    await supabase.auth.signOut();  
  };

  return (  
    <AuthContext.Provider value={{ session, user, loading, signIn, signUp, signOut }}>  
      {children}  
    </AuthContext.Provider>  
  );  
}

export function useAuth() {  
  const context = useContext(AuthContext);  
  if (!context) throw new Error('useAuth must be used within AuthProvider');  
  return context;  
}  
