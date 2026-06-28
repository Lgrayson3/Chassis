import React, { useState } from 'react';  
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';  
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';

export default function OnboardingScreen() {  
  const { user } = useAuth();  
  const [step, setStep] = useState(0);  
  const [firstName, setFirstName] = useState('');  
  const [bodyWeight, setBodyWeight] = useState('');  
  const [tier, setTier] = useState<'glp1' | 'longevity'>('glp1');  
  const [proteinTarget, setProteinTarget] = useState('');  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const steps = [  
    'Welcome to Chassis',  
    'Your Profile',  
    'Program Selection',  
    'Protein Target',  
    'Notifications',  
    'All Set',  
  ];

  const handleNext = () => {  
    if (step === 1 && (!firstName || !bodyWeight)) {  
      Alert.alert('Required', 'Please fill in all fields');  
      return;  
    }  
    if (step === 3 && !proteinTarget) {  
      Alert.alert('Required', 'Please set a protein target');  
      return;  
    }  
    if (step < steps.length - 1) setStep(step + 1);  
    else completeOnboarding();  
  };

  const handleBack = () => {  
    if (step > 0) setStep(step - 1);  
  };

  const completeOnboarding = async () => {  
    const { error } = await supabase.from('profiles').upsert({  
      id: user!.id,  
      first_name: firstName,  
      body_weight_kg: parseFloat(bodyWeight),  
      tier,  
      protein_target_g: parseFloat(proteinTarget),  
      onboarding_complete: true,  
      notifications_enabled: notificationsEnabled,  
    });

    if (error) {  
      Alert.alert('Error', error.message);  
    } else {  
      await supabase.auth.updateUser({  
        data: { onboarding_complete: true }  
      });  
    }  
  };

  const renderStep = () => {  
    switch (step) {  
      case 0:  
        return (  
          <>  
            <Text style={styles.title}>Welcome to Chassis</Text>  
            <Text style={styles.subtitle}>Built to keep you eating, moving, and accountable on your GLP-1 journey.</Text>  
          </>  
        );  
      case 1:  
        return (  
          <>  
            <Text style={styles.title}>Your Profile</Text>  
            <TextInput style={styles.input} placeholder="First Name" placeholderTextColor="#64748b" value={firstName} onChangeText={setFirstName} />  
            <TextInput style={styles.input} placeholder="Body Weight (kg)" placeholderTextColor="#64748b" value={bodyWeight} onChangeText={setBodyWeight} keyboardType="numeric" />  
          </>  
        );  
      case 2:  
        return (  
          <>  
            <Text style={styles.title}>Program Selection</Text>  
            <TouchableOpacity style={[styles.option, tier === 'glp1' && styles.optionActive]} onPress={() => setTier('glp1')}>  
              <Text style={styles.optionText}>GLP-1 Recovery</Text>  
              <Text style={styles.optionSub}>Focus on muscle preservation & nutrition</Text>  
            </TouchableOpacity>  
            <TouchableOpacity style={[styles.option, tier === 'longevity' && styles.optionActive]} onPress={() => setTier('longevity')}>  
              <Text style={styles.optionText}>Longevity</Text>  
              <Text style={styles.optionSub}>Zone 2, strength, & metabolic health</Text>  
            </TouchableOpacity>  
          </>  
        );  
      case 3:  
        return (  
          <>  
            <Text style={styles.title}>Protein Target</Text>  
            <Text style={styles.subtitle}>Daily protein goal in grams</Text>  
            <TextInput style={styles.input} placeholder="e.g. 120" placeholderTextColor="#64748b" value={proteinTarget} onChangeText={setProteinTarget} keyboardType="numeric" />  
            <Text style={styles.hint}>Recommended: {Math.round(parseFloat(bodyWeight || '0') * 1.6)}g based on your weight</Text>  
          </>  
        );  
      case 4:  
        return (  
          <>  
            <Text style={styles.title}>Notifications</Text>  
            <Text style={styles.subtitle}>Get meal reminders and protein nudges</Text>  
            <TouchableOpacity style={[styles.option, notificationsEnabled && styles.optionActive]} onPress={() => setNotificationsEnabled(true)}>  
              <Text style={styles.optionText}>Enable Notifications</Text>  
            </TouchableOpacity>  
            <TouchableOpacity style={[styles.option, !notificationsEnabled && styles.optionActive]} onPress={() => setNotificationsEnabled(false)}>  
              <Text style={styles.optionText}>Skip for Now</Text>  
            </TouchableOpacity>  
          </>  
        );  
      case 5:  
        return (  
          <>  
            <Text style={styles.title}>All Set!</Text>  
            <Text style={styles.subtitle}>You're ready to start your journey with Chassis.</Text>  
          </>  
        );  
      default:  
        return null;  
    }  
  };

  return (  
    <ScrollView contentContainerStyle={styles.container}>  
      <View style={styles.progressBar}>  
        <View style={[styles.progressFill, { width: `${((step + 1) / steps.length) * 100}%` }]} />  
      </View>  
      <View style={styles.content}>  
        {renderStep()}  
      </View>  
      <View style={styles.buttonRow}>  
        {step > 0 && (  
          <TouchableOpacity style={styles.buttonOutline} onPress={handleBack}>  
            <Text style={styles.buttonOutlineText}>Back</Text>  
          </TouchableOpacity>  
        )}  
        <TouchableOpacity style={[styles.button, step === 0 && { flex: 1 }]} onPress={handleNext}>  
          <Text style={styles.buttonText}>{step === steps.length - 1 ? 'Get Started' : 'Next'}</Text>  
        </TouchableOpacity>  
      </View>  
    </ScrollView>  
  );  
}

const styles = StyleSheet.create({  
  container: { flexGrow: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' },  
  progressBar: { height: 4, backgroundColor: '#1e293b', borderRadius: 2, marginBottom: 40 },  
  progressFill: { height: 4, backgroundColor: '#0ea5e9', borderRadius: 2 },  
  content: { flex: 1, justifyContent: 'center' },  
  title: { fontSize: 28, fontWeight: 'bold', color: '#f8fafc', marginBottom: 12 },  
  subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 24 },  
  input: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, color: '#f8fafc', marginBottom: 12, fontSize: 16 },  
  option: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },  
  optionActive: { borderColor: '#0ea5e9', backgroundColor: '#0ea5e920' },  
  optionText: { fontSize: 16, fontWeight: '600', color: '#f8fafc' },  
  optionSub: { fontSize: 13, color: '#94a3b8', marginTop: 4 },  
  hint: { fontSize: 13, color: '#64748b', marginTop: 8 },  
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 24 },  
  button: { backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center', flex: 1 },  
  buttonText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },  
  buttonOutline: { borderWidth: 1, borderColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center', flex: 1 },  
  buttonOutlineText: { color: '#0ea5e9', fontSize: 16, fontWeight: '600' },  
});  
