import React, { useEffect, useState, useCallback } from 'react';  
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';  
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';  
import workoutData from '../data/workouts.json';  
import { useFocusEffect } from '@react-navigation/native';

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
  const [profile, setProfile] = useState<any>(null);  
  const [proteinToday, setProteinToday] = useState(0);  
  const [fuelStatus, setFuelStatus] = useState<'green' | 'yellow' | 'orange' | 'red'>('red');  
  const [todayWorkout, setTodayWorkout] = useState<any>(null);  
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

    const lastLog = proteinLogs && proteinLogs.length > 0 ? new Date(proteinLogs[0].logged_at) : null;  
    const status = calcFuelStatus(proteinSum, profileData?.protein_target_g || 100, lastLog);  
    setFuelStatus(status);

    const startDate = new Date(profileData?.created_at || new Date());  
    const daysDiff = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));  
    const dayNumber = (daysDiff % 3) + 1;  
    const tier = profileData?.tier || 'glp1';  
    setTodayWorkout((workoutData as any)[tier]?.[`day${dayNumber}`]);

    // Only insert workout log if none exists for today  
    const { data: existing } = await supabase.from('workout_logs').select('id').eq('user_id', user!.id).eq('scheduled_for', today).single();  
    if (!existing) {  
      await supabase.from('workout_logs').insert({  
        user_id: user!.id,  
        scheduled_for: today,  
        day_number: dayNumber,  
        fuel_status: status,  
        protein_at_start_g: proteinSum,  
        status: status === 'red' ? 'skipped_underfueled' : 'scheduled',  
      });  
    }  
  }

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

  if (fuelStatus === 'red') {  
    return (  
      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}>  
        <Text style={styles.header}>Rest Day Recommended</Text>  
        <Text style={styles.body}>Your body needs fuel before it needs training. Eating today is the workout.</Text>  
        <Text style={styles.proteinStatus}>You've logged {Math.round(proteinToday)}g of {Math.round(profile?.protein_target_g || 100)}g protein goal</Text>  
        <TouchableOpacity style={styles.button} onPress={() => {}}>  
          <Text style={styles.buttonText}>Log Protein Now</Text>  
        </TouchableOpacity>  
        <TouchableOpacity style={styles.buttonOutline} onPress={() => {}}>  
          <Text style={styles.buttonOutlineText}>Reschedule Workout</Text>  
        </TouchableOpacity>  
      </ScrollView>  
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
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}>  
      <Text style={styles.header}>{todayWorkout?.name || 'Workout'}</Text>  
      {isYellow && <Text style={styles.banner}>Consider a lighter session today — you're at {Math.round((proteinToday / (profile?.protein_target_g || 100)) * 100)}% of your protein goal.</Text>}  
      <Text style={styles.duration}>{todayWorkout?.duration_min || 25} min • {exercises.length} exercises</Text>  
      {exercises.map((ex: any, i: number) => (  
        <View key={i} style={styles.exerciseCard}>  
          <Text style={styles.exerciseName}>{ex.name}</Text>  
          <Text style={styles.exerciseReps}>{isYellow ? 2 : ex.sets} sets × {ex.reps}</Text>  
          <Text style={styles.exerciseCue}>{ex.cue}</Text>  
          {ex.band_mod && <Text style={styles.bandMod}>Band: {ex.band_mod}</Text>}  
        </View>  
      ))}  
      <TouchableOpacity style={styles.button} onPress={() => {}}>  
        <Text style={styles.buttonText}>Complete Workout</Text>  
      </TouchableOpacity>  
    </ScrollView>  
  );  
}

const styles = StyleSheet.create({  
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24 },  
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
});  
