import React, { useEffect, useState, useCallback } from 'react';  
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';  
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';  
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import LogBottomSheet from '../components/LogBottomSheet';
import mealsData from '../data/meals.json';

const MEALS_LIBRARY = mealsData as any[];

export default function TodayScreen() {  
  const { user } = useAuth();  
  const navigation = useNavigation<any>();  
  
  const [profile, setProfile] = useState<any>(null);  
  const [proteinToday, setProteinToday] = useState(0);  
  const [hydrationToday, setHydrationToday] = useState(0);  
  const [nudges, setNudges] = useState<any[]>([]);  
  const [workoutStatus, setWorkoutStatus] = useState<'green' | 'yellow' | 'orange' | 'red'>('red');  
  const [refreshing, setRefreshing] = useState(false);

  // Phase 4 states
  const [logSheetVisible, setLogSheetVisible] = useState(false);
  const [nextMeal, setNextMeal] = useState<any>(null);

  useFocusEffect(  
    useCallback(() => {  
      loadData();  
    }, [])  
  );

  function getWeekStart(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  async function loadData() {  
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];  
    
    // 1. Load profiles
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();  
    setProfile(profileData);

    // 2. Load protein logs for today
    const { data: proteinLogs } = await supabase
      .from('protein_logs')
      .select('amount_g, logged_at, meal_id')
      .eq('user_id', user.id)
      .gte('logged_at', today)
      .order('logged_at', { ascending: false });  
    
    const proteinSum = (proteinLogs || []).reduce((s, l) => s + l.amount_g, 0);  
    setProteinToday(proteinSum);

    // 3. Load hydration logs for today
    const { data: hydrationLogs } = await supabase.from('hydration_logs').select('amount_oz').eq('user_id', user.id).gte('logged_at', today);  
    const hydrationSum = (hydrationLogs || []).reduce((s, l) => s + l.amount_oz, 0);  
    setHydrationToday(hydrationSum);

    // 4. Load nudge events for today
    const { data: nudgeData } = await supabase.from('nudge_events').select('*').eq('user_id', user.id).gte('sent_at', today).order('sent_at', { ascending: false });  
    setNudges(nudgeData || []);

    // 5. Load next unlogged meal from selections
    const weekStart = getWeekStart();
    const { data: selectionData } = await supabase
      .from('meal_selections')
      .select('selections')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle();

    const rawSelections = selectionData?.selections || [];
    const userSelections = rawSelections.map((item: any) => {
      const mealId = typeof item === 'object' ? (item.meal_id || item.id) : item;
      const mealType = typeof item === 'object' ? (item.meal_type || item.type) : null;
      const mealDetails = MEALS_LIBRARY.find(m => m.id === mealId || m.id === String(mealId));
      if (!mealDetails) return null;
      return {
        ...mealDetails,
        timeSlot: mealType || (mealDetails.meal_types && mealDetails.meal_types[0]) || 'snack'
      };
    }).filter(Boolean);

    // Filter out meals logged today
    const loggedTodayIds = (proteinLogs || []).map(l => String(l.meal_id)).filter(Boolean);
    const nextUnlogged = userSelections.find((m: any) => !loggedTodayIds.includes(String(m.id)));
    setNextMeal(nextUnlogged || null);

    // Fuel Status Gate logic  
    const target = profileData?.protein_target_g || 100;  
    const pct = proteinSum / target;  
    const lastLog = proteinLogs && proteinLogs.length > 0 ? new Date(proteinLogs[0].logged_at) : null;  
    const hoursSince = lastLog ? (Date.now() - lastLog.getTime()) / 3600000 : 24;  
    const hasLogWithin3h = hoursSince <= 3;  
    const hasLogWithin6h = hoursSince <= 6;  

    if (pct >= 0.8 && hasLogWithin3h) {  
      setWorkoutStatus('green');  
    } else if (pct >= 0.5 && hasLogWithin6h) {  
      setWorkoutStatus('yellow');  
    } else if (pct >= 0.3 && hoursSince <= 12) {  
      setWorkoutStatus('orange');  
    } else {  
      setWorkoutStatus('red');  
    }  
  }  

  const handleLogNextMeal = async () => {
    if (!nextMeal || !user) return;
    try {
      const { error } = await supabase.from('protein_logs').insert({
        user_id: user.id,
        amount_g: nextMeal.protein_g,
        meal_id: String(nextMeal.id),
        source: 'meals',
        meal_type: nextMeal.timeSlot || 'snack',
        logged_at: new Date().toISOString(),
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      // Mark the latest pending nudge as resolved!
      const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
      const { data: latestNudge } = await supabase
        .from('nudge_events')
        .select('id')
        .eq('user_id', user.id)
        .gte('sent_at', todayStart)
        .eq('action_taken', 'no_action')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestNudge) {
        await supabase
          .from('nudge_events')
          .update({
            action_taken: 'logged',
            action_at: new Date().toISOString()
          })
          .eq('id', latestNudge.id);
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not log meal.');
    }
  };

  const handleDismissNudge = async (nudgeId: string) => {
    try {
      const { error } = await supabase
        .from('nudge_events')
        .update({
          action_taken: 'dismissed',
          action_at: new Date().toISOString()
        })
        .eq('id', nudgeId);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not dismiss nudge.');
    }
  };

  const statusMessages = {  
    green: { text: 'Protein intake on track. Strength session gated GREEN (Fully fueled).', color: '#10b981' },  
    yellow: { text: 'Protein intake moderate. Strength session gated YELLOW (Caution advised).', color: '#f59e0b' },  
    orange: { text: 'Protein intake deficient. Strength session gated ORANGE (Light workout only).', color: '#f97316' },  
    red: { text: 'Critical protein deficit. Strength session gated RED (Underfueled — workout locked).', color: '#ef4444' }  
  };  

  const greeting = () => {  
    const hrs = new Date().getHours();  
    if (hrs < 12) return 'Morning';  
    if (hrs < 17) return 'Afternoon';  
    return 'Evening';  
  };  

  const proteinTarget = profile?.protein_target_g || 100;
  const hydrationTarget = profile?.hydration_target_oz || 64;

  return (  
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData().finally(() => setRefreshing(false)); }} />}  
      >  
        <View style={styles.header}>  
          <Text style={styles.greeting}>{greeting()}, {profile?.first_name || 'there'}</Text>  
          <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>  
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.gear}>  
            <Text style={{ color: '#94a3b8', fontSize: 20 }}>⚙️</Text>  
          </TouchableOpacity>  
        </View>  

        <View style={styles.card}>  
          <Text style={styles.cardTitle}>Daily Targets</Text>  
          <View style={styles.progressRow}>  
            <View style={styles.progressItem}>  
              <Text style={styles.progressLabel}>Protein</Text>  
              <Text style={styles.progressValue}>{proteinToday}g / {proteinTarget}g</Text>  
              <View style={styles.barBg}>  
                <View style={[styles.barFill, { width: `${Math.min(100, (proteinToday / proteinTarget) * 100)}%`, backgroundColor: '#0ea5e9' }]} />  
              </View>  
            </View>  
            <View style={styles.progressItem}>  
              <Text style={styles.progressLabel}>Hydration</Text>  
              <Text style={styles.progressValue}>{hydrationToday}oz / {hydrationTarget}oz</Text>  
              <View style={styles.barBg}>  
                <View style={[styles.barFill, { width: `${Math.min(100, (hydrationToday / hydrationTarget) * 100)}%`, backgroundColor: '#10b981' }]} />  
              </View>  
            </View>  
          </View>  
        </View>  

        {/* Next Meal Gated Card */}
        {nextMeal ? (
          <View style={styles.card}>  
            <Text style={styles.cardTitle}>Next Meal</Text>  
            <Text style={styles.cardBody}>
              {nextMeal.name} — {nextMeal.protein_g}g protein ({nextMeal.timeSlot.toUpperCase()})
            </Text>  
            <View style={styles.buttonRow}>  
              <TouchableOpacity style={styles.smallButton} onPress={handleLogNextMeal}>  
                <Text style={styles.smallButtonText}>I Ate This</Text>  
              </TouchableOpacity>  
              <TouchableOpacity 
                style={styles.smallButtonOutline} 
                onPress={() => navigation.navigate('Main', { screen: 'Meals' })}
              >  
                <Text style={styles.smallButtonOutlineText}>Not feeling this</Text>  
              </TouchableOpacity>  
            </View>  
          </View>
        ) : (
          <View style={styles.card}>  
            <Text style={styles.cardTitle}>Next Meal</Text>  
            <Text style={styles.cardBody}>
              No meals scheduled for today. Browse the library to plan your meals.
            </Text>  
            <View style={styles.buttonRow}>  
              <TouchableOpacity 
                style={styles.smallButton} 
                onPress={() => navigation.navigate('Main', { screen: 'Meals' })}
              >  
                <Text style={styles.smallButtonText}>Browse Meals</Text>  
              </TouchableOpacity>  
            </View>  
          </View>
        )}

        {nudges.length > 0 && (  
          <View style={styles.card}>  
            <Text style={styles.cardTitle}>Today's Nudges</Text>  
            {nudges.map((n, i) => (  
              <View key={i} style={styles.nudgeRow}>  
                <Text style={styles.nudgeText}>  
                  {n.nudge_type === 'meal_reminder' ? 'Meal reminder' : n.nudge_type === 'protein_deficit' ? 'Protein reminder' : n.nudge_type === 'catabolic_warning' ? 'Catabolic State Warning ⚠️' : n.nudge_type} sent {new Date(n.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  
                </Text>  
                {n.action_taken === 'no_action' || !n.action_taken ? (
                  <TouchableOpacity onPress={() => handleDismissNudge(n.id)} style={styles.dismissBtn}>
                    <Text style={styles.dismissBtnText}>Dismiss</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.nudgeStatus}>  
                    {n.action_taken === 'logged' || n.action_taken === 'logged_protein' ? '✓ logged' : n.action_taken === 'opened' ? 'opened' : 'dismissed'}  
                  </Text>  
                )}
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
      </ScrollView>

      {/* FAB button */}
      <TouchableOpacity style={styles.fab} onPress={() => setLogSheetVisible(true)}>  
        <Text style={styles.fabText}>+</Text>  
      </TouchableOpacity>

      {/* Log Bottom Sheet Modal */}
      <LogBottomSheet
        visible={logSheetVisible}
        onDismiss={() => setLogSheetVisible(false)}
        onLogged={loadData}
      />
    </View>
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
  nudgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },  
  nudgeText: { fontSize: 13, color: '#cbd5e1', flex: 1 },  
  nudgeStatus: { fontSize: 13, color: '#94a3b8' },  
  statusText: { fontSize: 14, fontWeight: '500' },  
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },  
  fabText: { color: '#f8fafc', fontSize: 28, fontWeight: '300' },  
  dismissBtn: { backgroundColor: '#334155', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  dismissBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
});  
