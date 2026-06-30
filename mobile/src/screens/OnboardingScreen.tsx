import React, { useState } from 'react';  
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch, ActivityIndicator, Animated } from 'react-native';  
import Slider from '@react-native-community/slider';
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';
import { trackEvent } from '../lib/analytics';

export default function OnboardingScreen() {  
  const { user } = useAuth();  
  const [step, setStep] = useState(0);  
  
  // State for step 0
  const [firstName, setFirstName] = useState('');  

  // State for step 1
  const [bodyWeightLbs, setBodyWeightLbs] = useState('');  
  const [proteinTarget, setProteinTarget] = useState(100);  

  // State for step 2
  const [tier, setTier] = useState<'glp1' | 'longevity'>('glp1');  

  // State for new step 3 (Texture Preference)
  const [texturePreference, setTexturePreference] = useState<'liquid' | 'soft' | 'standard' | 'emergency'>('standard');

  // State for new step 4 (Nudge Sensitivity)
  const [nudgeSensitivity, setNudgeSensitivity] = useState<'gentle' | 'standard' | 'aggressive'>('standard');

  // State for step 5 (Clinic Code)
  const [clinicCode, setClinicCode] = useState('');  
  const [clinicId, setClinicId] = useState<string | null>(null);  
  const [clinicName, setClinicName] = useState<string | null>(null);  
  const [inlineError, setInlineError] = useState('');
  const [loadingClinic, setLoadingClinic] = useState(false);

  // State for step 6 (Notification Settings)
  const [mealReminder, setMealReminder] = useState(true);
  const [hydrationNudges, setHydrationNudges] = useState(true);
  const [reminderHour, setReminderHour] = useState(8);
  const [reminderAmPm, setReminderAmPm] = useState<'AM' | 'PM'>('AM');

  // Loading state for final step
  const [loading, setLoading] = useState(false);

  // Animation values for premium transition feel
  const fadeAnim = useState(new Animated.Value(1))[0];

  const totalSteps = 8;

  const animateToStep = (nextStep: number) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = async () => {  
    if (step === 0) {
      if (!firstName.trim()) {
        Alert.alert('Required', 'Please enter your first name');
        return;
      }
      if (/\d/.test(firstName)) {
        Alert.alert('Invalid Name', 'First name cannot contain numbers');
        return;
      }
      animateToStep(1);
    } 
    else if (step === 1) {
      const weight = parseFloat(bodyWeightLbs);
      if (isNaN(weight) || weight <= 0) {
        Alert.alert('Required', 'Please enter a valid body weight in lbs');
        return;
      }
      animateToStep(2);
    } 
    else if (step === 2) {
      animateToStep(3);
    } 
    else if (step === 3) {
      animateToStep(4);
    }
    else if (step === 4) {
      animateToStep(5);
    }
    else if (step === 5) {
      await handleClinicValidation();
    } 
    else if (step === 6) {
      animateToStep(7);
    } 
    else if (step === 7) {
      await completeOnboarding();
    }
  };

  const handleBack = () => {  
    if (step > 0) {
      animateToStep(step - 1);  
      setInlineError(''); // Clear any errors on back navigation
    }  
  };

  const handleWeightChange = (text: string) => {
    setBodyWeightLbs(text);
    const weight = parseFloat(text);
    if (!isNaN(weight) && weight > 0) {
      // Auto-calculated protein goal: rounded to nearest 5g of body weight / 5
      const calculated = Math.round(weight / 5) * 5;
      setProteinTarget(calculated);
    }
  };

  const handleClinicValidation = async () => {
    const code = clinicCode.trim();
    if (!code) {
      setClinicId(null);
      setClinicName(null);
      setInlineError('');
      animateToStep(6);
      return;
    }

    setLoadingClinic(true);
    setInlineError('');
    try {
      // Securely validation clinic code using RPC instead of public Select query
      const { data, error } = await supabase
        .rpc('verify_clinic_code', { code_param: code });

      if (error) {
        console.error(error);
        setInlineError("That code doesn't match any clinic. Check with your provider.");
        return;
      }

      if (data && data.length > 0) {
        const clinic = data[0];
        setClinicId(clinic.id);
        setClinicName(clinic.name);
        setInlineError('');
        animateToStep(6);
      } else {
        setInlineError("That code doesn't match any clinic. Check with your provider.");
      }
    } catch (err) {
      console.error(err);
      setInlineError("Error verifying clinic code. Please try again.");
    } finally {
      setLoadingClinic(false);
    }
  };

  const getFormattedReminderTime = () => {
    let h = reminderHour;
    if (reminderAmPm === 'PM' && h < 12) h += 12;
    if (reminderAmPm === 'AM' && h === 12) h = 0;
    const hStr = h.toString().padStart(2, '0');
    return `${hStr}:00`;
  };

  const completeOnboarding = async () => {  
    setLoading(true);
    try {
      const weightLbs = parseFloat(bodyWeightLbs);
      // Convert weight to kg: Math.round(lbs * 0.453592 * 10) / 10
      const body_weight_kg = Math.round(weightLbs * 0.453592 * 10) / 10;
      const firstReminderTime = getFormattedReminderTime();

      // 1. Upsert profile payload
      const { error: upsertError } = await supabase.from('profiles').upsert({  
        id: user!.id,  
        first_name: firstName.trim(),  
        body_weight_kg,  
        protein_target_g: proteinTarget,  
        tier,  
        texture_preference: texturePreference,
        nudge_sensitivity: nudgeSensitivity,
        clinic_id: clinicId || null,  
        hydration_target_oz: 64,  
        onboarding_complete: true,  
        notification_meal_reminder: mealReminder,  
        notification_hydration: hydrationNudges,  
        first_reminder_time: firstReminderTime,  
      });

      if (upsertError) {
        Alert.alert('Onboarding Error', upsertError.message);
        return;
      }

      // Track analytics event
      await trackEvent('onboarding_completed', {
        tier,
        clinic_id: clinicId || null,
        protein_target_g: proteinTarget,
        texture_preference: texturePreference,
        nudge_sensitivity: nudgeSensitivity
      });

      // 2. Update auth metadata so navigation gate passes
      const { error: authError } = await supabase.auth.updateUser({  
        data: { onboarding_complete: true }  
      });  

      if (authError) {
        Alert.alert('Onboarding Error', authError.message);
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const lbsVal = parseFloat(bodyWeightLbs);
  const baselineGoal = isNaN(lbsVal) ? 100 : Math.round(lbsVal / 5) * 5;

  const renderStep = () => {  
    switch (step) {  
      case 0:  
        return (  
          <View style={styles.stepContainer}>  
            <Text style={styles.title}>What should we call you?</Text>  
            <Text style={styles.subtitle}>Enter your first name to personalize your account.</Text>  
            <TextInput 
              style={styles.input} 
              placeholder="First Name" 
              placeholderTextColor="#64748b" 
              value={firstName} 
              onChangeText={setFirstName} 
              autoFocus
              autoCapitalize="words"
            />  
          </View>  
        );  
      case 1:  
        return (  
          <View style={styles.stepContainer}>  
            <Text style={styles.title}>Your Body Weight</Text>  
            <Text style={styles.subtitle}>We use this to establish your initial protein targets.</Text>  
            <TextInput 
              style={styles.input} 
              placeholder="Weight in lbs" 
              placeholderTextColor="#64748b" 
              value={bodyWeightLbs} 
              onChangeText={handleWeightChange} 
              keyboardType="numeric"
              autoFocus
            />  
            
            {!isNaN(lbsVal) && lbsVal > 0 && (
              <View style={styles.sliderContainer}>
                <Text style={styles.goalLabel}>Daily protein goal: <Text style={styles.goalValue}>{proteinTarget}g</Text></Text>
                <Slider
                  style={styles.slider}
                  minimumValue={Math.max(10, baselineGoal - 50)}
                  maximumValue={baselineGoal + 50}
                  step={5}
                  value={proteinTarget}
                  onValueChange={setProteinTarget}
                  minimumTrackTintColor="#0ea5e9"
                  maximumTrackTintColor="#1e293b"
                  thumbTintColor="#0ea5e9"
                />
                <Text style={styles.sliderHint}>Adjust if your physician has given you a different target</Text>
              </View>
            )}
          </View>  
        );  
      case 2:  
        return (  
          <View style={styles.stepContainer}>  
            <Text style={styles.title}>Medication Program</Text>  
            <Text style={styles.subtitle}>Choose the program that fits your current therapy.</Text>  
            <TouchableOpacity 
              style={[styles.card, tier === 'glp1' && styles.cardActive]} 
              onPress={() => setTier('glp1')}
            >  
              <Text style={styles.cardTitle}>GLP-1 Program</Text>  
              <Text style={styles.cardSub}>Semaglutide, tirzepatide, or similar — lower volume, texture-aware training</Text>  
            </TouchableOpacity>  
            <TouchableOpacity 
              style={[styles.card, tier === 'longevity' && styles.cardActive]} 
              onPress={() => setTier('longevity')}
            >  
              <Text style={styles.cardTitle}>Longevity Program</Text>  
              <Text style={styles.cardSub}>General health optimization — higher volume, mobility-forward training</Text>  
            </TouchableOpacity>  
          </View>  
        );  
      case 3:  
        return (  
          <View style={styles.stepContainer}>  
            <Text style={styles.title}>Food Texture Program</Text>  
            <Text style={styles.subtitle}>GLP-1 therapy can sometimes cause mild nausea. Select a texture preference that aligns with your daily comfort.</Text>  
            <TouchableOpacity 
              style={[styles.card, texturePreference === 'standard' && styles.cardActive]} 
              onPress={() => setTexturePreference('standard')}
            >  
              <Text style={styles.cardTitle}>Standard Program</Text>  
              <Text style={styles.cardSub}>Standard solid meals — for normal days with regular appetite.</Text>  
            </TouchableOpacity>  
            <TouchableOpacity 
              style={[styles.card, texturePreference === 'soft' && styles.cardActive]} 
              onPress={() => setTexturePreference('soft')}
            >  
              <Text style={styles.cardTitle}>Soft Foods</Text>  
              <Text style={styles.cardSub}>Gentle, easily digestible textures (oats, purées, eggs).</Text>  
            </TouchableOpacity>  
            <TouchableOpacity 
              style={[styles.card, texturePreference === 'liquid' && styles.cardActive]} 
              onPress={() => setTexturePreference('liquid')}
            >  
              <Text style={styles.cardTitle}>Liquid Priority</Text>  
              <Text style={styles.cardSub}>Smoothies, protein shakes, and broths — for low-appetite days.</Text>  
            </TouchableOpacity>  
            <TouchableOpacity 
              style={[styles.card, texturePreference === 'emergency' && styles.cardActive]} 
              onPress={() => setTexturePreference('emergency')}
            >  
              <Text style={styles.cardTitle}>Emergency Relief</Text>  
              <Text style={styles.cardSub}>Bland foods and high hydration target — to actively combat nausea.</Text>  
            </TouchableOpacity>  
          </View>  
        );  
      case 4:  
        return (  
          <View style={styles.stepContainer}>  
            <Text style={styles.title}>Accountability Nudges</Text>  
            <Text style={styles.subtitle}>Choose how persistent our reminders should be to keep you on track with your goals.</Text>  
            <TouchableOpacity 
              style={[styles.card, nudgeSensitivity === 'gentle' && styles.cardActive]} 
              onPress={() => setNudgeSensitivity('gentle')}
            >  
              <Text style={styles.cardTitle}>Gentle Nudges</Text>  
              <Text style={styles.cardSub}>Minimal notifications. We'll only check in when you are significantly behind.</Text>  
            </TouchableOpacity>  
            <TouchableOpacity 
              style={[styles.card, nudgeSensitivity === 'standard' && styles.cardActive]} 
              onPress={() => setNudgeSensitivity('standard')}
            >  
              <Text style={styles.cardTitle}>Standard Program</Text>  
              <Text style={styles.cardSub}>Balanced notifications to help you stay structured throughout the day.</Text>  
            </TouchableOpacity>  
            <TouchableOpacity 
              style={[styles.card, nudgeSensitivity === 'aggressive' && styles.cardActive]} 
              onPress={() => setNudgeSensitivity('aggressive')}
            >  
              <Text style={styles.cardTitle}>Aggressive Accountability</Text>  
              <Text style={styles.cardSub}>Frequent checks and prompts if you begin to risk missing your daily macros.</Text>  
            </TouchableOpacity>  
          </View>  
        );  
      case 5:  
        return (  
          <View style={styles.stepContainer}>  
            <Text style={styles.title}>Clinic Referral Code</Text>  
            <Text style={styles.subtitle}>Connect your account directly with your physician.</Text>  
            <TextInput 
              style={styles.input} 
              placeholder="Referral code (optional)" 
              placeholderTextColor="#64748b" 
              value={clinicCode} 
              onChangeText={(txt) => { setClinicCode(txt); setInlineError(''); }} 
              autoCapitalize="characters"
            />  
            <Text style={styles.hint}>Leave blank if you weren't referred by a clinic</Text>  
            
            {inlineError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{inlineError}</Text>
                <TouchableOpacity 
                  style={styles.skipButton} 
                  onPress={() => {
                    setClinicCode('');
                    setClinicId(null);
                    setClinicName(null);
                    setInlineError('');
                    animateToStep(6);
                  }}
                >
                  <Text style={styles.skipButtonText}>Continue without code</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>  
        );  
      case 6:  
        return (  
          <View style={styles.stepContainer}>  
            <Text style={styles.title}>Notification Settings</Text>  
            <Text style={styles.subtitle}>Stay accountable with reminders throughout your day.</Text>  
            
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleLabel}>Daily meal reminders</Text>
                <Text style={styles.toggleSub}>Reminds you to eat at your scheduled times</Text>
              </View>
              <Switch
                value={mealReminder}
                onValueChange={setMealReminder}
                trackColor={{ false: '#1e293b', true: '#0ea5e9' }}
                thumbColor={mealReminder ? '#f8fafc' : '#94a3b8'}
              />
            </View>
 
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleLabel}>Hydration nudges</Text>
                <Text style={styles.toggleSub}>Reminds you to log water and stay hydrated</Text>
              </View>
              <Switch
                value={hydrationNudges}
                onValueChange={setHydrationNudges}
                trackColor={{ false: '#1e293b', true: '#0ea5e9' }}
                thumbColor={hydrationNudges ? '#f8fafc' : '#94a3b8'}
              />
            </View>
 
            {mealReminder && (
              <View style={styles.timePickerContainer}>
                <Text style={styles.timePickerTitle}>First reminder at</Text>
                <View style={styles.timePickerRow}>
                  <TouchableOpacity 
                    style={styles.timeAdjustButton} 
                    onPress={() => setReminderHour(prev => prev === 1 ? 12 : prev - 1)}
                  >
                    <Text style={styles.timeAdjustText}>-</Text>
                  </TouchableOpacity>
                  
                  <Text style={styles.timeDisplay}>
                    {reminderHour.toString().padStart(2, '0')}:00
                  </Text>
                  
                  <TouchableOpacity 
                    style={styles.timeAdjustButton} 
                    onPress={() => setReminderHour(prev => prev === 12 ? 1 : prev + 1)}
                  >
                    <Text style={styles.timeAdjustText}>+</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.ampmContainer}>
                    <TouchableOpacity 
                      style={[styles.ampmButton, reminderAmPm === 'AM' && styles.ampmButtonActive]} 
                      onPress={() => setReminderAmPm('AM')}
                    >
                      <Text style={[styles.ampmText, reminderAmPm === 'AM' && styles.ampmTextActive]}>AM</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.ampmButton, reminderAmPm === 'PM' && styles.ampmButtonActive]} 
                      onPress={() => setReminderAmPm('PM')}
                    >
                      <Text style={[styles.ampmText, reminderAmPm === 'PM' && styles.ampmTextActive]}>PM</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>  
        );  
      case 7:  
        return (  
          <View style={styles.stepContainer}>  
            <Text style={styles.title}>Review Your Program</Text>  
            <Text style={styles.subtitle}>Double check your selections before starting.</Text>  
            
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Name</Text>
                <Text style={styles.summaryValue}>{firstName}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Weight</Text>
                <Text style={styles.summaryValue}>{bodyWeightLbs} lbs</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Daily Protein Goal</Text>
                <Text style={styles.summaryValue}>{proteinTarget}g</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Program</Text>
                <Text style={styles.summaryValue}>{tier === 'glp1' ? 'GLP-1 Program' : 'Longevity Program'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Texture Preference</Text>
                <Text style={styles.summaryValue}>
                  {texturePreference.charAt(0).toUpperCase() + texturePreference.slice(1)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Nudge Frequency</Text>
                <Text style={styles.summaryValue}>
                  {nudgeSensitivity.charAt(0).toUpperCase() + nudgeSensitivity.slice(1)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Clinic</Text>
                <Text style={styles.summaryValue}>{clinicName || 'Independent'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Meal Reminders</Text>
                <Text style={styles.summaryValue}>{mealReminder ? `Yes (from ${reminderHour}:00 ${reminderAmPm})` : 'Disabled'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Hydration Nudges</Text>
                <Text style={styles.summaryValue}>{hydrationNudges ? 'Enabled' : 'Disabled'}</Text>
              </View>
            </View>
          </View>  
        );  
      default:  
        return null;  
    }  
  };

  return (  
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container}>  
        <View style={styles.progressBar}>  
          <View style={[styles.progressFill, { width: `${((step + 1) / totalSteps) * 100}%` }]} />  
        </View>  
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>  
          {renderStep()}  
        </Animated.View>  
      </ScrollView>  
      
      <View style={styles.footer}>  
        {step > 0 && (  
          <TouchableOpacity style={styles.backButton} onPress={handleBack} disabled={loadingClinic || loading}>  
            <Text style={styles.backButtonText}>Back</Text>  
          </TouchableOpacity>  
        )}  
        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={handleNext} 
          disabled={loadingClinic || loading}
        >  
          {loadingClinic || loading ? (
            <ActivityIndicator color="#f8fafc" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {step === totalSteps - 1 ? 'Start my program' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>  
      </View>  
    </View>
  );  
}

const styles = StyleSheet.create({  
  wrapper: { flex: 1, backgroundColor: '#0f172a' },
  container: { flexGrow: 1, padding: 24, paddingTop: 40 },  
  progressBar: { height: 4, backgroundColor: '#1e293b', borderRadius: 2, marginBottom: 40 },  
  progressFill: { height: 4, backgroundColor: '#0ea5e9', borderRadius: 2 },  
  content: { flex: 1, justifyContent: 'center' },  
  stepContainer: { width: '100%', alignSelf: 'stretch' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#f8fafc', marginBottom: 12 },  
  subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 24, lineHeight: 20 },  
  input: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, color: '#f8fafc', marginBottom: 12, fontSize: 16, borderWidth: 1, borderColor: '#334155' },  
  
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 18, marginBottom: 16, borderWidth: 1.5, borderColor: '#334155' },  
  cardActive: { borderColor: '#0ea5e9', backgroundColor: '#0ea5e910' },  
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#f8fafc' },  
  cardSub: { fontSize: 13, color: '#94a3b8', marginTop: 6, lineHeight: 18 },  
  
  hint: { fontSize: 13, color: '#64748b', marginTop: 4, marginLeft: 4 },  
  
  sliderContainer: { marginTop: 24, backgroundColor: '#1e293b', padding: 20, borderRadius: 12 },
  goalLabel: { color: '#f8fafc', fontSize: 16, marginBottom: 16, fontWeight: '500' },
  goalValue: { color: '#0ea5e9', fontWeight: 'bold', fontSize: 20 },
  slider: { width: '100%', height: 40 },
  sliderHint: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 8 },

  errorContainer: { marginTop: 16, padding: 16, backgroundColor: '#7f1d1d30', borderRadius: 12, borderWidth: 1, borderColor: '#7f1d1d' },
  errorText: { color: '#fca5a5', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  skipButton: { backgroundColor: '#334155', borderRadius: 8, padding: 10, alignItems: 'center' },
  skipButtonText: { color: '#f8fafc', fontSize: 14, fontWeight: '500' },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 16 },
  toggleTextContainer: { flex: 1, paddingRight: 16 },
  toggleLabel: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  toggleSub: { color: '#94a3b8', fontSize: 12, marginTop: 4 },

  timePickerContainer: { marginTop: 16, backgroundColor: '#1e293b', padding: 16, borderRadius: 12 },
  timePickerTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  timePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeAdjustButton: { backgroundColor: '#334155', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  timeAdjustText: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold' },
  timeDisplay: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold' },
  ampmContainer: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 8, padding: 2, gap: 2 },
  ampmButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  ampmButtonActive: { backgroundColor: '#0ea5e9' },
  ampmText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  ampmTextActive: { color: '#f8fafc' },

  summaryCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: '#334155' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  summaryLabel: { color: '#94a3b8', fontSize: 14 },
  summaryValue: { color: '#f8fafc', fontSize: 14, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 16 },

  footer: { padding: 24, backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#1e293b' },  
  primaryButton: { backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%', height: 52, justifyContent: 'center' },  
  primaryButtonText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },  
  backButton: { alignItems: 'center', paddingVertical: 12, marginBottom: 8 },  
  backButtonText: { color: '#94a3b8', fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },  
});  
