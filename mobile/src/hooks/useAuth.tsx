import React, { createContext, useContext, useEffect, useState } from 'react';  
import { Linking } from 'react-native';
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
    const handleUrl = async (url: string) => {
      try {
        console.log('Handling incoming deep link:', url);
        // Find query parameters (PKCE code)
        const codeMatch = url.match(/[?&]code=([^&#]+)/);
        if (codeMatch) {
          const code = decodeURIComponent(codeMatch[1]);
          console.log('Extracted code from deep link:', code);
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data?.session) {
            setSession(data.session);
            setUser(data.session.user);
          }
          return;
        }

        // Find hash params (implicit access_token & refresh_token)
        const accessTokenMatch = url.match(/[#?&]access_token=([^&#]+)/);
        const refreshTokenMatch = url.match(/[#?&]refresh_token=([^&#]+)/);
        if (accessTokenMatch && refreshTokenMatch) {
          const accessToken = decodeURIComponent(accessTokenMatch[1]);
          const refreshToken = decodeURIComponent(refreshTokenMatch[1]);
          console.log('Extracted session tokens from deep link');
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (data?.session) {
            setSession(data.session);
            setUser(data.session.user);
          }
        }
      } catch (err: any) {
        console.error('Failed to handle deep link url:', url, err.message);
      }
    };

    // Check if app was opened from a deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

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

    // Listen for incoming deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url) handleUrl(event.url);
    });

    return () => {
      listener.subscription.unsubscribe();
      subscription.remove();
    };  
  }, []);

  const signIn = async (email: string, password: string) => {  
    const { error } = await supabase.auth.signInWithPassword({ email, password });  
    if (error) throw error;  
  };

  const signUp = async (email: string, password: string) => {  
    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: 'chassis://auth-callback',
      }
    });  
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
