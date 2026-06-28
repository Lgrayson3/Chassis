import React, { useState, useEffect } from 'react';  
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert, ScrollView } from 'react-native';  
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';

export default function SettingsScreen() {  
  const { user, signOut } = useAuth();  
  const [profile, setProfile] = useState<any>(null);  
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {  
    loadProfile();  
  }, []);

  async function loadProfile() {  
    const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single();  
    if (data) {  
      setProfile(data);  
      setNotifications(data.notifications_enabled ?? true);  
    }  
  }

  async function toggleNotifications(value: boolean) {  
    setNotifications(value);  
    await supabase.from('profiles').update({ notifications_enabled: value }).eq('id', user!.id);  
  }

  async function handleSignOut() {  
    await signOut();  
  }

  async function manageSubscription() {  
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {  
      body: { user_id: user!.id },  
    });  
    if (data?.url) {  
      Alert.alert('Subscription', 'Stripe checkout URL: ' + data.url);  
    }  
  }

  return (  
    <ScrollView style={styles.container}>  
      <Text style={styles.header}>Settings</Text>

      <View style={styles.section}>  
        <Text style={styles.sectionTitle}>Profile</Text>  
        <View style={styles.row}>  
          <Text style={styles.label}>Name</Text>  
          <Text style={styles.value}>{profile?.first_name || '—'}</Text>  
        </View>  
        <View style={styles.row}>  
          <Text style={styles.label}>Tier</Text>  
          <Text style={styles.value}>{profile?.tier || '—'}</Text>  
        </View>  
        <View style={styles.row}>  
          <Text style={styles.label}>Protein Target</Text>  
          <Text style={styles.value}>{profile?.protein_target_g ? \`${profile.protein_target_g}g\` : '—'}</Text>  
        </View>  
      </View>

      <View style={styles.section}>  
        <Text style={styles.sectionTitle}>Preferences</Text>  
        <View style={styles.row}>  
          <Text style={styles.label}>Push Notifications</Text>  
          <Switch value={notifications} onValueChange={toggleNotifications} trackColor={{ false: '#334155', true: '#0ea5e9' }} />  
        </View>  
      </View>

      <View style={styles.section}>  
        <Text style={styles.sectionTitle}>Subscription</Text>  
        <TouchableOpacity style={styles.button} onPress={manageSubscription}>  
          <Text style={styles.buttonText}>Manage Subscription</Text>  
        </TouchableOpacity>  
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>  
        <Text style={styles.signOutText}>Sign Out</Text>  
      </TouchableOpacity>  
    </ScrollView>  
  );  
}

const styles = StyleSheet.create({  
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24 },  
  header: { fontSize: 28, fontWeight: 'bold', color: '#f8fafc', marginBottom: 24 },  
  section: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, marginBottom: 16 },  
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },  
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },  
  label: { fontSize: 16, color: '#f8fafc' },  
  value: { fontSize: 16, color: '#94a3b8' },  
  button: { backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center' },  
  buttonText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },  
  signOutButton: { marginTop: 24, padding: 16, alignItems: 'center' },  
  signOutText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },  
});  
