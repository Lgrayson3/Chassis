import React, { useEffect, useState, useCallback } from 'react';  
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';  
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';  
import { useNavigation, useFocusEffect } from '@react-navigation/native';

export default function TodayScreen() {  
  const { user } = useAuth();  
  const navigation = useNavigation<any>();  
  const [profile, setProfile] = useState<any>(null);  
  const [proteinToday, setProteinToday] = useState(0);  
  const [hydrationToday, setHydrationToday] = useState(0);  
  const [nudges, setNudges] = useState<any[]>([]);  
  const [workoutStatus, setWorkoutStatus] = useState<'green' | 'yellow' | 'orange' | 'red'>('red');  
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(  
    useCallback(() => {  
      loadData();  
    }, [])  
  );

  async function loadData() {  
    const today = new Date().toISOString().split('T')[0];  
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user!.id).single();  
    setProfile(profileData);

    const { data: proteinLogs } = await supabase.from('protein_logs').select('amount_g, logged_at').eq('user_id', user!.id).gte('logged_at', today).order('logged_at', { ascending: false });  
    const proteinSum = (proteinLogs || []).reduce((s, l) => s + l.amount_g, 0);  
    setProteinToday(proteinSum);

    const { data: hydrationLogs } = await supabase.from('hydration_logs').select('amount_oz').eq('user_id', user!.id).gte('logged_at', today);  
    const hydrationSum = (hydrationLogs || []).reduce((s, l) => s + l.amount_oz, 0);  
    setHydrationToday(hydrationSum);

    const { data: nudgeData } = await supabase.from('nudge_events').select('*').eq('user_id', user!.id).gte('sent_at', today).order('sent_at', { ascending: false });  
    setNudges(nudgeData || []);

    const target = profileData?.protein_target_g || 100;  
    const pct = proteinSum / target;  
    const lastLog = proteinLogs && proteinLogs.length > 0 ? new Date(proteinLogs[0].logged_at) : null;  
    const hoursSince = lastLog ? (Date.now() - lastLog.getTime()) / 3600000 : 24;

    if (pct >= 0.8 && hoursSince <= 4) setWorkoutStatus('green');  
    else if (pct >= 0.5 && hoursSince <= 6) setWorkoutStatus('yellow');  
    else if (pct >= 0.3 && hoursSince <= 12) setWorkoutStatus('orange');  
    else setWorkoutStatus('red');  
  }

  const onRefresh = async () => {  
    setRefreshing(true);  
    await loadData();  
    setRefreshing(false);  
  };

  const proteinPct = Math.min((proteinToday / (profile?.protein_target_g || 100)) * 100, 100);  
  const hydrationPct = Math.min((hydrationToday / (profile?.hydration_target_oz || 64)) * 100, 100);

  const statusMessages = {  
    green: { text: "You're fueled. Today's workout is ready.", color: '#10b981' },  
    yellow: { text: 'Light session available. Hit your protein goal to unlock full training.', color: '#f59e0b' },  
    orange: { text: 'Mobility only today. Eat first, train later.', color: '#f97316' },  
    red: { text: 'Rest day recommended. Focus on eating today.', color: '#ef4444' },  
  };

  const greeting = () => {  
    const h = new Date().getHours();  
    if (h < 12) return 'Good morning';  
    if (h < 18) return 'Good afternoon';  
    return 'Good evening';  
  };

  return (  
    <ScrollView  
      style={styles.container}  
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}  
    >  
      <View style={styles.header}>  
        <Text style={styles.greeting}>{greeting()}, {profile?.first_name}</Text>  
        <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>  
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.gear}>  
          <Text style={{ color: '#94a3b8', fontSize: 20 }}>⚙️</Text>  
        </TouchableOpacity>  
      </View>

      <View style={styles.card}>  
        <View style={styles.progressRow}>  
          <View style={styles.progressItem}>  
            <Text style={styles.progressLabel}>Protein</Text>  
            <Text style={styles.progressValue}>{Math.round(proteinToday)}g / {Math.round(profile?.protein_target_g || 100)}g</Text>  
            <View style={styles.barBg}>  
              <View style={[styles.barFill, { width: `${proteinPct}%`, backgroundColor: proteinPct >= 80 ? '#10b981' : proteinPct >= 50 ? '#f59e0b' : '#f97316' }]} />  
            </View>  
          </View>  
          <View style={styles.progressItem}>  
            <Text style={styles.progressLabel}>Hydration</Text>  
            <Text style={styles.progressValue}>{Math.round(hydrationToday)} / {profile?.hydration_target_oz || 64}oz</Text>  
            <View style={styles.barBg}>  
              <View style={[styles.barFill, { width: `${hydrationPct}%`, backgroundColor: '#0ea5e9' }]} />  
            </View>  
          </View>  
        </View>  
      </View>

      <View style={styles.card}>  
        <Text style={styles.cardTitle}>Next Meal</Text>  
        <Text style={styles.cardBody}>Greek Yogurt Parfait — 23g protein at 7:00 AM</Text>  
        <View style={styles.buttonRow}>  
          <TouchableOpacity style={styles.smallButton} onPress={() => {}}>  
            <Text style={styles.smallButtonText}>I Ate This</Text>  
          </TouchableOpacity>  
          <TouchableOpacity style={styles.smallButtonOutline} onPress={() => navigation.navigate('Main', { screen: 'Meals' })}>  
            <Text style={styles.smallButtonOutlineText}>Not feeling this</Text>  
          </TouchableOpacity>  
        </View>  
      </View>

      {nudges.length > 0 && (  
        <View style={styles.card}>  
          <Text style={styles.cardTitle}>Today's Nudges</Text>  
          {nudges.map((n, i) => (  
            <View key={i} style={styles.nudgeRow}>  
              <Text style={styles.nudgeText}>  
                {n.nudge_type === 'meal_reminder' ? 'Meal reminder' : n.nudge_type === 'protein_deficit' ? 'Protein reminder' : n.nudge_type} sent {new Date(n.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  
              </Text>  
              <Text style={styles.nudgeStatus}>  
                {n.action_taken === 'logged' ? '✓ logged' : n.action_taken === 'dismissed' ? 'dismissed' : 'no response'}  
              </Text>  
            </View>  
          ))}  
        </View>  
      )}

      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Main', { screen: 'Train' })}>  
        <Text style={styles.cardTitle}>Today's Training</Text>  
        <Text style={[styles.statusText, { color: statusMessages[workoutStatus].color }]}>  
          {statusMessages[workoutStatus].text}  
        </Text>  
      </TouchableOpacity>

      <TouchableOpacity style={styles.fab} onPress={() => {}}>  
        <Text style={styles.fabText}>+</Text>  
      </TouchableOpacity>  
    </ScrollView>  
  );  
}

const styles = StyleSheet.create({  
  container: { flex: 1, backgroundColor: '#0f172a' },  
  header: { padding: 24, paddingTop: 48 },  
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc' },  
  date: { fontSize: 14, color: '#94a3b8', marginTop: 4 },  
  gear: { position: 'absolute', top: 48, right: 24 },  
  card: { backgroundColor: '#1e293b', borderRadius: 16, marginHorizontal: 24, marginBottom: 16, padding: 20 },  
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f8fafc', marginBottom: 12 },  
  cardBody: { fontSize: 14, color: '#cbd5e1', marginBottom: 16 },  
  progressRow: { flexDirection: 'row', gap: 20 },  
  progressItem: { flex: 1 },  
  progressLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },  
  progressValue: { fontSize: 16, fontWeight: '600', color: '#f8fafc', marginBottom: 8 },  
  barBg: { height: 8, backgroundColor: '#334155', borderRadius: 4 },  
  barFill: { height: 8, borderRadius: 4 },  
  buttonRow: { flexDirection: 'row', gap: 12 },  
  smallButton: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, flex: 1 },  
  smallButtonText: { color: '#f8fafc', fontSize: 14, fontWeight: '600', textAlign: 'center' },  
  smallButtonOutline: { borderWidth: 1, borderColor: '#0ea5e9', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, flex: 1 },  
  smallButtonOutlineText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600', textAlign: 'center' },  
  nudgeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },  
  nudgeText: { fontSize: 13, color: '#cbd5e1', flex: 1 },  
  nudgeStatus: { fontSize: 13, color: '#94a3b8' },  
  statusText: { fontSize: 14, fontWeight: '500' },  
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },  
  fabText: { color: '#f8fafc', fontSize: 28, fontWeight: '300' },  
});  
