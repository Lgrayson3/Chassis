import React, { useEffect, useState, useCallback } from 'react';  
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, ActivityIndicator, Animated } from 'react-native';  
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

const bodyweightAlternatives: Record<string, string> = {
  "Goblet Squats": "Bodyweight squats",
  "Push-Ups (Incline)": "Knee push-ups / Wall push-ups",
  "Single-Leg RDL": "Bodyweight single-leg RDL",
  "Bent Over Row": "Doorframe row / Bodyweight Y-raises",
  "Plank": "Knee plank",
  "Brisk Walk / Incline Treadmill": "High knees in place",
  "Dead Bug": "Banded dead bug alternative",
  "Bird Dog": "Kneeling bird dog",
  "Glute Bridge": "Single-leg glute bridge",
  "Side Plank": "Knee side plank",
  "Romanian Deadlift": "Good mornings (bodyweight)",
  "Overhead Press": "Pike push-ups (bodyweight)",
  "Split Squat": "Bodyweight split squats",
  "Lat Pulldown": "Bodyweight doorframe pull / Y-raises",
  "Farmer Carry": "Static march in place",
};

export default function TrainScreen() {  
  const { user } = useAuth();  
  const navigation = useNavigation<any>();

  const [profile, setProfile] = useState<any>(null);  
  const [proteinToday, setProteinToday] = useState(0);  
  const [fuelStatus, setFuelStatus] = useState<'green' | 'yellow' | 'orange' | 'red'>('red');  
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Selector and customization states
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [bypassed, setBypassed] = useState(false);
  const [completedExercises, setCompletedExercises] = useState<Record<number, boolean>>({});
  const [swappedExercises, setSwappedExercises] = useState<Record<number, boolean>>({});
  const [setsAdjustments, setSetsAdjustments] = useState<Record<number, number>>({});
  const [completedDaysMap, setCompletedDaysMap] = useState<Record<number, boolean>>({});

  const [logSheetVisible, setLogSheetVisible] = useState(false);
  const [workoutComplete, setWorkoutComplete] = useState(false);

  useFocusEffect(  
    useCallback(() => {  
      loadData();  
      
      return () => {
        if (fuelStatus === 'red' && selectedDay && !bypassed) {
          trackEvent('workout_skipped', {
            fuel_status: 'red',
            protein_at_time: proteinToday
          });
        }
      };
    }, [fuelStatus, proteinToday, selectedDay, bypassed])  
  );

  // Reset selected state when day changes
  useEffect(() => {
    setCompletedExercises({});
    setSwappedExercises({});
    setSetsAdjustments({});
  }, [selectedDay]);

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

      // Fetch completed workouts in the last 7 days to show completion checks in the Hub
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const { data: pastLogs } = await supabase
        .from('workout_logs')
        .select('day_number, status')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('scheduled_for', sevenDaysAgoStr);

      const completedDays: Record<number, boolean> = {};
      if (pastLogs) {
        pastLogs.forEach(log => {
          if (log.day_number) completedDays[log.day_number] = true;
        });
      }
      setCompletedDaysMap(completedDays);

      // Check if user completed a workout today
      const { data: existing } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('scheduled_for', today)
        .eq('status', 'completed')
        .maybeSingle();

      if (existing) {
        setWorkoutComplete(true);
      } else {
        setWorkoutComplete(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleCompleteWorkout = async () => {
    if (!user || !selectedDay) return;
    const today = new Date().toISOString().split('T')[0];
    const dayNum = parseInt(selectedDay.replace('day', '')) || 1;
    const tier = profile?.tier === 'longevity' ? 'longevity' : 'glp1';
    const selectedWorkout = (workoutData as any)[tier]?.[selectedDay];

    try {
      const { error } = await supabase
        .from('workout_logs')
        .insert({  
          user_id: user.id,  
          scheduled_for: today,  
          day_number: dayNum,  
          fuel_status: fuelStatus,  
          protein_at_start_g: proteinToday,  
          status: 'completed',
          completed_at: new Date().toISOString(),
        });

      if (error) {
        Alert.alert('Error completing workout', error.message);
        return;
      }

      await trackEvent('workout_completed', {
        day_number: dayNum,
        fuel_status: fuelStatus,
        duration_min: selectedWorkout?.duration_min || 25
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

  const onRefresh = async () => {  
    setRefreshing(true);  
    await loadData();  
    setRefreshing(false);  
  };  

  const getSetsCount = (ex: any, index: number) => {
    if (setsAdjustments[index] !== undefined) {
      return setsAdjustments[index];
    }
    // Scale sets based on fuel status
    if (fuelStatus === 'orange') return 1;
    if (fuelStatus === 'yellow') return 2;
    return ex.sets;
  };

  const adjustSets = (index: number, change: number, defaultSets: number) => {
    const current = getSetsCount(exercises[index], index);
    const newVal = Math.max(1, current + change);
    setSetsAdjustments(prev => ({
      ...prev,
      [index]: newVal
    }));
  };

  const toggleSwap = (index: number) => {
    setSwappedExercises(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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

  const tier = profile?.tier === 'longevity' ? 'longevity' : 'glp1';

  // 1. Lockout Gate View if Red and not bypassed
  if (selectedDay && fuelStatus === 'red' && !bypassed) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' }}>
        <TouchableOpacity 
          style={styles.backButtonHeader} 
          onPress={() => setSelectedDay(null)}
        >
          <Text style={styles.backText}>← Back to Workout Hub</Text>
        </TouchableOpacity>
        
        <View style={[styles.successCard, { borderColor: '#ef4444' }]}>
          <Text style={[styles.successIcon, { color: '#ef4444' }]}>⚠</Text>
          <Text style={styles.successTitle}>Rest Day Recommended</Text>
          <Text style={[styles.successText, { marginBottom: 20 }]}>
            Your amino-acid availability is low ({Math.round(proteinToday)}g logged today). GLP-1 training requires proper fuel to protect your muscles from lean tissue wasting.
          </Text>
          
          <TouchableOpacity style={[styles.button, { width: '100%' }]} onPress={() => setLogSheetVisible(true)}>  
            <Text style={styles.buttonText}>Log Protein to Unlock</Text>  
          </TouchableOpacity>  
          
          <TouchableOpacity style={styles.bypassBtn} onPress={() => setBypassed(true)}>  
            <Text style={styles.bypassBtnText}>Bypass Gate (I have eaten)</Text>  
          </TouchableOpacity> 
        </View>
        
        <LogBottomSheet
          visible={logSheetVisible}
          onDismiss={() => setLogSheetVisible(false)}
          onLogged={loadData}
          defaultTab="protein"
        />
      </View>
    );
  }

  // 2. Hub Dashboard View
  if (!selectedDay) {
    const programName = tier === 'glp1' ? 'GLP-1 Strength & Tone' : 'Longevity Strength & Stability';
    
    const workoutsList = [
      { key: 'day1', label: 'Day 1', data: (workoutData as any)[tier]?.day1 },
      { key: 'day2', label: 'Day 2', data: (workoutData as any)[tier]?.day2 },
      { key: 'day3', label: 'Day 3', data: (workoutData as any)[tier]?.day3 }
    ];

    const startDate = new Date(profile?.created_at || new Date());  
    const daysDiff = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));  
    const recommendedDayNum = (daysDiff % 3) + 1; 
    const recommendedDayKey = `day${recommendedDayNum}`;

    const fuelConfig = {
      green: { border: '#10b981', bg: '#10b98108', text: '#10b981', desc: 'Fully Fueled. Your amino-acid levels are optimal for strength training and muscle preservation.' },
      yellow: { border: '#eab308', bg: '#eab30808', text: '#eab308', desc: 'Sufficiently Fueled. You can train today, but sets will be scaled down to 2 to protect lean tissue.' },
      orange: { border: '#f97316', bg: '#f9731608', text: '#f97316', desc: 'Mild Deficit. Mobility session is recommended. If training, sets are limited to 1.' },
      red: { border: '#ef4444', bg: '#ef444408', text: '#ef4444', desc: 'Critical Deficit. Heavy lifting is locked. Prioritize logging a high-protein meal or snack to unlock.' }
    };
    
    const activeFuel = fuelConfig[fuelStatus];

    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <ScrollView 
          contentContainerStyle={{ padding: 24 }}
          style={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
        >
          <Text style={styles.header}>Training Hub</Text>
          <Text style={styles.body}>{programName}</Text>

          <View style={[styles.fuelCard, { borderColor: activeFuel.border, backgroundColor: activeFuel.bg }]}>
            <Text style={[styles.fuelCardTitle, { color: activeFuel.text }]}>
              Fuel Status: {fuelStatus.toUpperCase()}
            </Text>
            <Text style={styles.fuelCardDesc}>{activeFuel.desc}</Text>
          </View>

          <Text style={styles.sectionTitle}>Weekly Plan</Text>
          
          {workoutsList.map((dayItem) => {
            const isCompleted = completedDaysMap[parseInt(dayItem.key.replace('day', ''))];
            const isRecommended = dayItem.key === recommendedDayKey;
            
            let pillColor = '#334155';
            let pillText = 'View Workout';
            let pillTextColor = '#cbd5e1';
            
            if (isCompleted) {
              pillColor = '#10b98120';
              pillText = 'Completed';
              pillTextColor = '#10b981';
            } else if (isRecommended) {
              pillColor = '#0ea5e920';
              pillText = 'Recommended';
              pillTextColor = '#0ea5e9';
            }

            return (
              <TouchableOpacity 
                key={dayItem.key} 
                style={[styles.dayCard, isRecommended && styles.dayCardSelected]}
                onPress={() => {
                  setSelectedDay(dayItem.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
              >
                <View style={styles.dayLeft}>
                  <Text style={styles.dayLabel}>{dayItem.label}</Text>
                  <Text style={styles.dayTitle}>{dayItem.data?.name}</Text>
                  <Text style={styles.dayMeta}>
                    {dayItem.data?.duration_min} min • {dayItem.data?.exercises?.length} exercises
                  </Text>
                </View>
                
                <View style={[styles.statusPill, { backgroundColor: pillColor }]}>
                  <Text style={[styles.statusTextPill, { color: pillTextColor }]}>
                    {pillText}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // 3. Active Workout View
  const selectedWorkout = (workoutData as any)[tier]?.[selectedDay];
  const exercises = selectedWorkout?.exercises || [];
  const isYellow = fuelStatus === 'yellow';
  const isOrange = fuelStatus === 'orange';
  
  const exercisesCount = exercises.length;
  const completedCount = Object.values(completedExercises).filter(Boolean).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <ScrollView 
        contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
      >
        <TouchableOpacity 
          style={styles.backButtonHeader} 
          onPress={() => setSelectedDay(null)}
        >
          <Text style={styles.backText}>← Back to Workout Hub</Text>
        </TouchableOpacity>

        <Text style={styles.header}>{selectedWorkout.name}</Text>
        
        {isYellow && (
          <Text style={styles.banner}>
            Yellow Fuel Level: Sets are scaled to 2 to prevent muscle catabolism.
          </Text>
        )}
        
        {isOrange && (
          <Text style={styles.banner}>
            Orange Fuel Level: Low fuel. Sets are scaled to 1. Stay light.
          </Text>
        )}

        <Text style={styles.duration}>
          {selectedWorkout.duration_min} min • {completedCount}/{exercisesCount} Completed
        </Text>

        {exercises.map((ex: any, i: number) => {
          const sets = getSetsCount(ex, i);
          const isSwapped = !!swappedExercises[i];
          const isChecked = !!completedExercises[i];
          const displayName = isSwapped ? (bodyweightAlternatives[ex.name] || `${ex.name} (Alt)`) : ex.name;

          return (
            <View 
              key={i} 
              style={[
                styles.exerciseCard, 
                isChecked && styles.exerciseCardChecked
              ]}
            >
              <View style={styles.exerciseHeaderRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.exerciseName}>{displayName}</Text>
                  <Text style={styles.exerciseReps}>
                    {sets} sets × {ex.reps}
                  </Text>
                </View>
                
                <TouchableOpacity 
                  style={[styles.checkboxContainer, isChecked && styles.checkboxChecked]}
                  onPress={() => {
                    setCompletedExercises(prev => ({ ...prev, [i]: !prev[i] }));
                    Haptics.impactAsync(isChecked ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
                  }}
                >
                  {isChecked && <Text style={styles.checkboxText}>✓</Text>}
                </TouchableOpacity>
              </View>

              <Text style={styles.exerciseCue}>{ex.cue}</Text>
              {ex.band_mod && !isSwapped && <Text style={styles.bandMod}>Band: {ex.band_mod}</Text>}
              {isSwapped && <Text style={styles.bandMod}>Bodyweight variation active</Text>}

              <View style={styles.cardControlsRow}>
                <TouchableOpacity 
                  style={[styles.swapBtn, isSwapped && styles.swapBtnActive]}
                  onPress={() => toggleSwap(i)}
                >
                  <Text style={styles.swapBtnText}>
                    {isSwapped ? 'Swapped to Alt' : 'Swap to Bodyweight'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.adjusterRow}>
                  <Text style={styles.adjusterLabel}>Sets:</Text>
                  <TouchableOpacity 
                    style={styles.adjusterBtn}
                    onPress={() => adjustSets(i, -1, ex.sets)}
                  >
                    <Text style={styles.buttonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.adjusterVal}>{sets}</Text>
                  <TouchableOpacity 
                    style={styles.adjusterBtn}
                    onPress={() => adjustSets(i, 1, ex.sets)}
                  >
                    <Text style={styles.buttonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

        <TouchableOpacity 
          style={[styles.button, { marginTop: 12 }]} 
          onPress={handleCompleteWorkout}
        >  
          <Text style={styles.buttonText}>Complete Workout</Text>  
        </TouchableOpacity>  
      </ScrollView>
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

  // Added Styles for Premium Hub & Interactions
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#cbd5e1', marginTop: 24, marginBottom: 12 },
  backButtonHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backText: { color: '#0ea5e9', fontSize: 16 },
  fuelCard: { borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1 },
  fuelCardTitle: { fontSize: 18, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 },
  fuelCardDesc: { fontSize: 14, color: '#94a3b8', lineHeight: 20 },
  dayCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 18, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: '#334155' },
  dayCardSelected: { borderColor: '#0ea5e9', backgroundColor: '#0ea5e905' },
  dayLeft: { flex: 1 },
  dayLabel: { fontSize: 12, color: '#0ea5e9', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  dayTitle: { fontSize: 17, fontWeight: 'bold', color: '#f8fafc' },
  dayMeta: { fontSize: 13, color: '#94a3b8', marginTop: 6 },
  statusPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  statusTextPill: { fontSize: 11, fontWeight: 'bold' },
  
  exerciseHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  checkboxContainer: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#475569', justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { borderColor: '#10b981', backgroundColor: '#10b981' },
  checkboxText: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold' },
  exerciseCardChecked: { opacity: 0.6, borderColor: '#10b98130', borderWidth: 1 },
  
  cardControlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  swapBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#334155' },
  swapBtnActive: { backgroundColor: '#0ea5e920', borderWidth: 1, borderColor: '#0ea5e9' },
  swapBtnText: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  adjusterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adjusterBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  adjusterLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '500' },
  adjusterVal: { color: '#0ea5e9', fontSize: 14, fontWeight: 'bold' },
  
  bypassBtn: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'center' },
  bypassBtnText: { color: '#64748b', fontSize: 12, textDecorationLine: 'underline' },
});  
