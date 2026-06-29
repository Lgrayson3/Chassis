import React, { useState, useEffect } from 'react';  
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert, ScrollView, TextInput, ActivityIndicator } from 'react-native';  
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';

export default function SettingsScreen() {  
  const { user, signOut } = useAuth();  

  // Profile fields state
  const [firstName, setFirstName] = useState('');  
  const [bodyWeightLbs, setBodyWeightLbs] = useState('');  
  const [proteinTarget, setProteinTarget] = useState(100);

  // Preferences toggles state
  const [mealReminder, setMealReminder] = useState(true);
  const [hydrationNudges, setHydrationNudges] = useState(true);
  const [reminderHour, setReminderHour] = useState(8);
  const [reminderAmPm, setReminderAmPm] = useState<'AM' | 'PM'>('AM');

  // Plan info
  const [subscriptionStatus, setSubscriptionStatus] = useState('Free Trial');

  // UI state
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showSavedText, setShowSavedText] = useState(false);

  useEffect(() => {  
    loadProfile();  
  }, []);

  async function loadProfile() {  
    if (!user) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();  
      if (data) {  
        setFirstName(data.first_name || '');
        
        // Convert kg from DB back to lbs for display: lbs = Math.round(kg / 0.453592)
        const lbs = data.body_weight_kg ? Math.round(data.body_weight_kg / 0.453592) : 150;
        setBodyWeightLbs(String(lbs));
        setProteinTarget(data.protein_target_g || 100);

        setMealReminder(data.notification_meal_reminder ?? true);
        setHydrationNudges(data.notification_hydration ?? true);

        // Parse HH:MM string to hour and AM/PM
        const timeStr = data.first_reminder_time || '08:00';
        const parts = timeStr.split(':');
        let hr = parseInt(parts[0]);
        let ampm: 'AM' | 'PM' = 'AM';
        if (hr >= 12) {
          ampm = 'PM';
          if (hr > 12) hr -= 12;
        } else if (hr === 0) {
          hr = 12;
        }
        setReminderHour(hr);
        setReminderAmPm(ampm);

        // Plan status
        if (data.subscription_status === 'active') {
          setSubscriptionStatus('GLP-1 Companion — $39/mo');
        } else {
          setSubscriptionStatus('Free Trial');
        }
      }  
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Live protein goal calculations as weight changes
  const handleWeightChange = (text: string) => {
    setBodyWeightLbs(text);
    const weight = parseFloat(text);
    if (!weight || isNaN(weight)) return;
    const autoCalc = Math.round(weight / 5) * 5;
    setProteinTarget(autoCalc);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    const weight = parseFloat(bodyWeightLbs);
    if (!firstName.trim()) {
      Alert.alert('Required', 'First name cannot be empty');
      return;
    }
    if (isNaN(weight) || weight <= 0) {
      Alert.alert('Required', 'Please enter a valid weight');
      return;
    }

    setSavingProfile(true);
    try {
      const body_weight_kg = Math.round(weight * 0.453592 * 10) / 10;
      const { error } = await supabase.from('profiles').update({
        first_name: firstName.trim(),
        body_weight_kg,
        protein_target_g: proteinTarget
      }).eq('id', user.id);

      if (error) {
        Alert.alert('Error saving profile', error.message);
        return;
      }

      setShowSavedText(true);
      setTimeout(() => setShowSavedText(false), 1500);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // Instant notification settings updater
  const handlePreferenceChange = async (
    mealRem: boolean,
    hydNudg: boolean,
    hourVal: number,
    ampmVal: 'AM' | 'PM'
  ) => {
    if (!user) return;
    
    // Optimistic state updates
    setMealReminder(mealRem);
    setHydrationNudges(hydNudg);
    setReminderHour(hourVal);
    setReminderAmPm(ampmVal);

    // Convert hour to 'HH:MM' string
    let h = hourVal;
    if (ampmVal === 'PM' && h < 12) h += 12;
    if (ampmVal === 'AM' && h === 12) h = 0;
    const timeStr = `${h.toString().padStart(2, '0')}:00`;

    try {
      await supabase.from('profiles').update({
        notification_meal_reminder: mealRem,
        notification_hydration: hydNudg,
        first_reminder_time: timeStr
      }).eq('id', user.id);
    } catch (err) {
      console.error('Error updating notification config', err);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return (  
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>  
      <Text style={styles.header}>Settings</Text>

      {/* Profile Section */}
      <View style={styles.section}>  
        <Text style={styles.sectionTitle}>Profile Settings</Text>  
        
        <View style={styles.inputRow}>  
          <Text style={styles.inputLabel}>First Name</Text>  
          <TextInput 
            style={styles.textInput} 
            value={firstName} 
            onChangeText={setFirstName} 
            placeholder="Name" 
            placeholderTextColor="#64748b"
          />
        </View>  
        
        <View style={styles.inputRow}>  
          <Text style={styles.inputLabel}>Weight (lbs)</Text>  
          <TextInput 
            style={styles.textInput} 
            value={bodyWeightLbs} 
            onChangeText={handleWeightChange} 
            keyboardType="numeric" 
            placeholder="lbs"
            placeholderTextColor="#64748b"
          />
        </View>  
        
        <View style={styles.infoRow}>  
          <Text style={styles.infoLabel}>Protein Target</Text>  
          <View style={styles.targetCol}>
            <Text style={styles.infoValue}>{proteinTarget}g/day</Text>  
            <Text style={styles.infoSub}>(auto-calculated)</Text>
          </View>
        </View>  

        <View style={styles.saveContainer}>
          {showSavedText && <Text style={styles.savedText}>Saved ✓</Text>}
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? (
              <ActivityIndicator color="#f8fafc" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Notifications Section */}
      <View style={styles.section}>  
        <Text style={styles.sectionTitle}>Notifications</Text>  
        
        <View style={styles.toggleRow}>  
          <Text style={styles.label}>Meal reminders</Text>  
          <Switch 
            value={mealReminder} 
            onValueChange={(val) => handlePreferenceChange(val, hydrationNudges, reminderHour, reminderAmPm)} 
            trackColor={{ false: '#334155', true: '#0ea5e9' }} 
            thumbColor={mealReminder ? '#f8fafc' : '#94a3b8'}
          />  
        </View>  

        <View style={styles.toggleRow}>  
          <Text style={styles.label}>Hydration nudges</Text>  
          <Switch 
            value={hydrationNudges} 
            onValueChange={(val) => handlePreferenceChange(mealReminder, val, reminderHour, reminderAmPm)} 
            trackColor={{ false: '#334155', true: '#0ea5e9' }} 
            thumbColor={hydrationNudges ? '#f8fafc' : '#94a3b8'}
          />  
        </View>  

        {mealReminder && (
          <View style={styles.timePickerRow}>
            <Text style={styles.timeLabel}>First reminder</Text>
            <View style={styles.timeControls}>
              <TouchableOpacity 
                style={styles.timeBtn} 
                onPress={() => {
                  const hr = reminderHour === 1 ? 12 : reminderHour - 1;
                  handlePreferenceChange(mealReminder, hydrationNudges, hr, reminderAmPm);
                }}
              >
                <Text style={styles.timeBtnText}>-</Text>
              </TouchableOpacity>
              
              <Text style={styles.timeText}>{reminderHour.toString().padStart(2, '0')}:00</Text>
              
              <TouchableOpacity 
                style={styles.timeBtn} 
                onPress={() => {
                  const hr = reminderHour === 12 ? 1 : reminderHour + 1;
                  handlePreferenceChange(mealReminder, hydrationNudges, hr, reminderAmPm);
                }}
              >
                <Text style={styles.timeBtnText}>+</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.ampmBtn, reminderAmPm === 'AM' && styles.ampmBtnActive]}
                onPress={() => handlePreferenceChange(mealReminder, hydrationNudges, reminderHour, 'AM')}
              >
                <Text style={styles.ampmText}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.ampmBtn, reminderAmPm === 'PM' && styles.ampmBtnActive]}
                onPress={() => handlePreferenceChange(mealReminder, hydrationNudges, reminderHour, 'PM')}
              >
                <Text style={styles.ampmText}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Subscription Section */}
      <View style={styles.section}>  
        <Text style={styles.sectionTitle}>Subscription</Text>  
        <View style={styles.subInfoRow}>
          <Text style={styles.subLabel}>Current Plan</Text>
          <Text style={styles.subValue}>{subscriptionStatus}</Text>
        </View>
        
        {/* TODO: Stripe integration will unlock this button in Phase 8 */}
        <TouchableOpacity 
          style={[styles.button, styles.disabledButton]} 
          onPress={() => Alert.alert('Information', 'Subscription management will be unlocked after Stripe integration.')}
          disabled={true}
        >  
          <Text style={styles.buttonText}>Manage Billing</Text>  
        </TouchableOpacity>  
      </View>

      {/* Account Section */}
      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>  
        <Text style={styles.signOutText}>Sign Out</Text>  
      </TouchableOpacity>  
    </ScrollView>  
  );  
}

const styles = StyleSheet.create({  
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24 },  
  header: { fontSize: 28, fontWeight: 'bold', color: '#f8fafc', marginBottom: 24, paddingTop: 20 },  
  section: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },  
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#0ea5e9', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.8 },  
  
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  inputLabel: { fontSize: 16, color: '#f8fafc', flex: 1 },
  textInput: { color: '#f8fafc', fontSize: 16, textAlign: 'right', flex: 1, paddingVertical: 4, fontWeight: '500' },
  
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
  infoLabel: { fontSize: 16, color: '#f8fafc' },
  targetCol: { alignItems: 'flex-end' },
  infoValue: { fontSize: 16, color: '#cbd5e1', fontWeight: '600' },
  infoSub: { fontSize: 11, color: '#64748b', marginTop: 2 },

  saveContainer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, gap: 12 },
  savedText: { color: '#10b981', fontSize: 14, fontWeight: '600' },
  saveButton: { backgroundColor: '#0ea5e9', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, minWidth: 120, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },  
  label: { fontSize: 16, color: '#f8fafc' },  
  
  timePickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  timeLabel: { fontSize: 16, color: '#f8fafc' },
  timeControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeBtn: { backgroundColor: '#334155', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  timeBtnText: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  timeText: { color: '#f8fafc', fontSize: 16, fontWeight: '600', minWidth: 46, textAlign: 'center' },
  ampmBtn: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#0f172a' },
  ampmBtnActive: { backgroundColor: '#0ea5e9' },
  ampmText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },

  subInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  subLabel: { fontSize: 16, color: '#f8fafc' },
  subValue: { fontSize: 15, color: '#cbd5e1', fontWeight: '500' },

  button: { backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center' },  
  disabledButton: { backgroundColor: '#334155', opacity: 0.5 },
  buttonText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },  
  
  signOutButton: { marginTop: 12, padding: 16, alignItems: 'center', width: '100%' },  
  signOutText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },  
});  
