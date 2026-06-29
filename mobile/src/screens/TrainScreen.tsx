import React, { useEffect, useState, useCallback } from 'react';  
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, ActivityIndicator } from 'react-native';  
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';  
import workoutData from '../data/workouts.json';  
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import LogBottomSheet from '../components/LogBottomSheet';
import { trackEvent } from '../lib/analytics';

function calcFuelStatus(proteinConsumedG: number, proteinTargetG: number, lastLoggedAt: Date | null): 'green' | 'yellow' | 'orange' | 'red' {  
  const hoursSinceLog = lastLoggedAt ? (Date.now() - lastLoggedAt.getTime()) / 3600000 : 24;  
  const pct = proteinConsumedG / proteinTargetG;  
  if (pct >= 0.8 && hoursSinceLog <= 4) return 'green';  
  if (pct >= 0.5 && hoursSinceLog <= 6) return 'yellow';  
  if (pct >= 0.3 && hoursSinceLog <= 12) return 'orange';  
  return 'red';  
}

export default function TrainScreen() {  
  const { user } = useAuth();  
  const navigation = useNavigation<any>();

  const [profile, setProfile] = useState<any>(null);  
  const [proteinToday, setProteinToday] = useState(0);  
  const [fuelStatus, setFuelStatus] = useState<'green' | 'yellow' | 'orange' | 'red'>('red');  
  const [todayWorkout, setTodayWorkout] = useState<any>(null);  
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Phase 4 states
  const [logSheetVisible, setLogSheetVisible] = useState(false);
  const [workoutComplete, setWorkoutComplete] = useState(false);

  useFocusEffect(  
    useCallback(() => {  
      loadData();  
      
      return () => {
        if (fuelStatus === 'red') {
          trackEvent('workout_skipped', {
            fuel_status: 'red',
            protein_at_time: proteinToday
          });
        }
      };
    }, [fuelStatus, proteinToday])  
  );

  async function loadData() {  
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];  
    
    try {
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();  
      setProfile(profileData);

      const { data: proteinLogs } = await supabase.from('protein_logs').select('amount_g, logged_at').eq('user_id', user.id).gte('logged_at', today).order('logged_at', { ascending: false });  
      const proteinSum = (proteinLogs || []).reduce((s, l) => s + l.amount_g, 0);  
      setProteinToday(proteinSum);

      const lastLog = proteinLogs && proteinLogs.length > 0 ? new Date(proteinLogs[0].logged_at) : null;  
      const status = calcFuelStatus(proteinSum, profileData?.protein_target_g || 100, lastLog);  
      setFuelStatus(status);

      const startDate = new Date(profileData?.created_at || new Date());  
      const daysDiff = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));  
      const dayNumber = (daysDiff % 3) + 1;  
      const tier = profileData?.tier || 'glp1';  
      setTodayWorkout((workoutData as any)[tier]?.[`day${dayNumber}`]);

      // Check current status of today's workout log
      const { data: existing, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('scheduled_for', today)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'completed') {
          setWorkoutComplete(true);
        } else {
          setWorkoutComplete(false);
        }
      } else {
        // Log the workout as scheduled ONCE, not on every screen visit
        setWorkoutComplete(false);
        await supabase.from('workout_logs').insert({  
          user_id: user.id,  
          scheduled_for: today,  
          day_number: dayNumber,  
          fuel_status: status,  
          protein_at_start_g: proteinSum,  
          status: status === 'red' ? 'skipped_underfueled' : 'scheduled',  
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleCompleteWorkout = async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const { error } = await supabase
        .from('workout_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('scheduled_for', today);

      if (error) {
        Alert.alert('Error completing workout', error.message);
        return;
      }

      // Track analytics event
      const startDate = new Date(profile?.created_at || new Date());  
      const daysDiff = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));  
      const dayNumber = (daysDiff % 3) + 1;
      await trackEvent('workout_completed', {
        day_number: dayNumber,
        fuel_status: fuelStatus,
        duration_min: todayWorkout?.duration_min || 25
      });

      setWorkoutComplete(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Navigate away after 1200ms
      setTimeout(() => {
        navigation.navigate('Main', { screen: 'Today' });
      }, 1200);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not complete workout.');
    }
  };

  const rescheduleWorkout = async (daysAhead: number) => {
    if (!user) return;
    try {
      const today = new Date();
      const newDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
      const newDateStr = newDate.toISOString().split('T')[0];
      const todayStr = today.toISOString().split('T')[0];

      const { error } = await supabase
        .from('workout_logs')
        .update({ scheduled_for: newDateStr })
        .eq('user_id', user.id)
        .eq('scheduled_for', todayStr);

      if (error) {
        Alert.alert('Error rescheduling session', error.message);
        return;
      }

      Alert.alert('Rescheduled', `Workout moved to ${newDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRescheduleAlert = () => {
    Alert.alert(
      'Reschedule Workout',
      'When would you like to move this session to?',
      [
        { text: 'Tomorrow', onPress: () => rescheduleWorkout(1) },
        { text: 'Day after tomorrow', onPress: () => rescheduleWorkout(2) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const onRefresh = async () => {  
    setRefreshing(true);  
    await loadData();  
    setRefreshing(false);  
  };  

  const mobilityExercises = [  
    { name: 'Cat-Cow', reps: '10 breaths', cue: 'Move slowly with your breath' },  
    { name: 'Hip Circles', reps: '10 each direction', cue: 'Wide stance, big circles' },  
    { name: 'Thoracic Rotation', reps: '10 each side', cue: 'Open chest to ceiling' },  
    { name: 'Deep Squat Hold', reps: '60 seconds', cue: 'Heels down, chest up' },  
    { name: 'Couch Stretch', reps: '90 seconds each leg', cue: 'Squeeze glute, push hips forward' },  
  ];

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  if (workoutComplete) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Workout logged. Nice work.</Text>
          <Text style={styles.successText}>Keep consistent on your nutrition to unlock your next session.</Text>
        </View>
      </View>
    );
  }

  if (fuelStatus === 'red') {  
    return (  
      <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <ScrollView 
          contentContainerStyle={{ padding: 24 }}
          style={styles.container} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
        >  
          <Text style={styles.header}>Rest Day Recommended</Text>  
          <Text style={styles.body}>Your body needs fuel before it needs training. Eating today is the workout.</Text>  
          <Text style={styles.proteinStatus}>You've logged {Math.round(proteinToday)}g of {Math.round(profile?.protein_target_g || 100)}g protein goal</Text>  
          
          <TouchableOpacity style={styles.button} onPress={() => setLogSheetVisible(true)}>  
            <Text style={styles.buttonText}>Log Protein Now</Text>  
          </TouchableOpacity>  
          
          <TouchableOpacity style={styles.buttonOutline} onPress={handleRescheduleAlert}>  
            <Text style={styles.buttonOutlineText}>Reschedule Workout</Text>  
          </TouchableOpacity>  
        </ScrollView>

        <LogBottomSheet
          visible={logSheetVisible}
          onDismiss={() => setLogSheetVisible(false)}
          onLogged={loadData}
          defaultTab="protein"
        />
      </View>
    );  
  }

  if (fuelStatus === 'orange') {  
    return (  
      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}>  
        <Text style={styles.header}>Mobility Session</Text>  
        <Text style={styles.body}>15-minute mobility flow. No equipment needed.</Text>  
        {mobilityExercises.map((ex, i) => (  
          <View key={i} style={styles.exerciseCard}>  
            <Text style={styles.exerciseName}>{ex.name}</Text>  
            <Text style={styles.exerciseReps}>{ex.reps}</Text>  
            <Text style={styles.exerciseCue}>{ex.cue}</Text>  
          </View>  
        ))}  
      </ScrollView>  
    );  
  }

  const isYellow = fuelStatus === 'yellow';  
  const exercises = todayWorkout?.exercises || [];

  return (  
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <ScrollView 
        contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
        style={styles.container} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
      >  
        <Text style={styles.header}>{todayWorkout?.name || 'Workout'}</Text>  
        {isYellow && (
          <Text style={styles.banner}>
            Consider a lighter session today — you're at {Math.round((proteinToday / (profile?.protein_target_g || 100)) * 100)}% of your protein goal.
          </Text>
        )}  
        <Text style={styles.duration}>{todayWorkout?.duration_min || 25} min • {exercises.length} exercises</Text>  
        
        {exercises.map((ex: any, i: number) => (  
          <View key={i} style={styles.exerciseCard}>  
            <Text style={styles.exerciseName}>{ex.name}</Text>  
            <Text style={styles.exerciseReps}>{isYellow ? 2 : ex.sets} sets × {ex.reps}</Text>  
            <Text style={styles.exerciseCue}>{ex.cue}</Text>  
            {ex.band_mod && <Text style={styles.bandMod}>Band: {ex.band_mod}</Text>}  
          </View>  
        ))}  
        
        <TouchableOpacity style={styles.button} onPress={handleCompleteWorkout}>  
          <Text style={styles.buttonText}>Complete Workout</Text>  
        </TouchableOpacity>  
      </ScrollView>

      <LogBottomSheet
        visible={logSheetVisible}
        onDismiss={() => setLogSheetVisible(false)}
        onLogged={loadData}
        defaultTab="protein"
      />
    </View>
  );  
}

const styles = StyleSheet.create({  
  container: { flex: 1, backgroundColor: '#0f172a' },  
  header: { fontSize: 28, fontWeight: 'bold', color: '#f8fafc', marginBottom: 12 },  
  body: { fontSize: 16, color: '#cbd5e1', lineHeight: 24, marginBottom: 24 },  
  proteinStatus: { fontSize: 14, color: '#94a3b8', marginBottom: 24 },  
  button: { backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },  
  buttonText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },  
  buttonOutline: { borderWidth: 1, borderColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center' },  
  buttonOutlineText: { color: '#0ea5e9', fontSize: 16, fontWeight: '600' },  
  banner: { backgroundColor: '#f59e0b20', borderLeftWidth: 4, borderLeftColor: '#f59e0b', padding: 12, borderRadius: 8, color: '#f59e0b', fontSize: 14, marginBottom: 16 },  
  duration: { fontSize: 14, color: '#94a3b8', marginBottom: 16 },  
  exerciseCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12 },  
  exerciseName: { fontSize: 16, fontWeight: '600', color: '#f8fafc', marginBottom: 4 },  
  exerciseReps: { fontSize: 14, color: '#0ea5e9', marginBottom: 4 },  
  exerciseCue: { fontSize: 13, color: '#94a3b8', marginBottom: 4 },  
  bandMod: { fontSize: 12, color: '#f59e0b', fontStyle: 'italic' },
  
  successCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#10b981', width: '100%' },
  successIcon: { fontSize: 48, color: '#10b981', fontWeight: 'bold', marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: 'bold', color: '#f8fafc', marginBottom: 12, textAlign: 'center' },
  successText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
});  
