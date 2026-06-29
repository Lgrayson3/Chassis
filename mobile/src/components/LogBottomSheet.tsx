import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, Switch, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import mealsData from '../data/meals.json';
import { trackEvent } from '../lib/analytics';

interface LogBottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onLogged: () => void;
  defaultTab?: 'protein' | 'hydration';
}

const MEALS_LIBRARY = mealsData as any[];

const QUICK_ITEMS = [
  { name: "Chicken breast 4oz", grams: 35 },
  { name: "Greek yogurt", grams: 20 },
  { name: "Protein shake", grams: 25 },
  { name: "2 eggs", grams: 12 },
  { name: "Cottage cheese ½c", grams: 14 },
  { name: "Tuna pouch", grams: 20 },
  { name: "Shrimp 4oz", grams: 24 },
  { name: "Beef 3oz", grams: 22 },
  { name: "Turkey slice 3oz", grams: 18 },
  { name: "Edamame ½c", grams: 9 },
  { name: "Lentils ½c", grams: 9 },
  { name: "Tofu 4oz", grams: 10 },
];

export default function LogBottomSheet({ visible, onDismiss, onLogged, defaultTab = 'protein' }: LogBottomSheetProps) {
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'protein' | 'hydration'>(defaultTab);
  const [proteinMode, setProteinMode] = useState<'meals' | 'quick' | 'custom'>('meals');
  const [customGrams, setCustomGrams] = useState('');
  
  // Selections list
  const [selectedMeals, setSelectedMeals] = useState<any[]>([]);
  const [loggedMealIds, setLoggedMealIds] = useState<string[]>([]);
  const [hydrationToday, setHydrationToday] = useState(0);
  const [loading, setLoading] = useState(false);

  // Micro-animation flash states
  const [flashingMealIds, setFlashingMealIds] = useState<Record<string, boolean>>({});
  const [flashingQuickIndex, setFlashingQuickIndex] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (visible) {
      setActiveTab(defaultTab);
      loadSelectionsAndLogs();
      loadHydrationToday();
    }
  }, [visible, defaultTab]);

  function getWeekStart(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  async function loadSelectionsAndLogs() {
    if (!user) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekStart = getWeekStart();

      // 1. Fetch weekly meal selections
      const { data: selectionData } = await supabase
        .from('meal_selections')
        .select('selections')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .maybeSingle();

      const rawSelections = selectionData?.selections || [];
      const mapped = rawSelections.map((item: any) => {
        // Handle both simple IDs and structured { meal_id, meal_type } objects
        const mealId = typeof item === 'object' ? (item.meal_id || item.id) : item;
        const mealType = typeof item === 'object' ? (item.meal_type || item.type) : null;
        
        const mealDetails = MEALS_LIBRARY.find(m => m.id === mealId || m.id === String(mealId));
        if (!mealDetails) return null;
        
        return {
          ...mealDetails,
          timeSlot: mealType || (mealDetails.meal_types && mealDetails.meal_types[0]) || 'snack'
        };
      }).filter(Boolean);

      setSelectedMeals(mapped);

      // 2. Fetch logged meals for today to show checkmarks
      const { data: logData } = await supabase
        .from('protein_logs')
        .select('meal_id')
        .eq('user_id', user.id)
        .gte('logged_at', today);

      const loggedIds = (logData || []).map(l => String(l.meal_id)).filter(Boolean);
      setLoggedMealIds(loggedIds);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadHydrationToday() {
    if (!user) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('hydration_logs')
        .select('amount_oz')
        .eq('user_id', user.id)
        .gte('logged_at', today);
      
      const total = (data || []).reduce((sum, item) => sum + item.amount_oz, 0);
      setHydrationToday(total);
    } catch (err) {
      console.error(err);
    }
  }

  async function insertProteinLog(grams: number, mealId?: string, source: 'meals' | 'quick' | 'custom' = 'meals') {
    if (!user) return;
    
    // Trigger visual flash
    if (mealId) {
      setFlashingMealIds(prev => ({ ...prev, [mealId]: true }));
      setTimeout(() => {
        setFlashingMealIds(prev => ({ ...prev, [mealId]: false }));
      }, 300);
    }

    try {
      // Find the meal type for logging, if available
      let mealType = 'emergency';
      if (mealId) {
        const matchingSelection = selectedMeals.find(m => String(m.id) === String(mealId));
        if (matchingSelection) {
          mealType = matchingSelection.timeSlot;
        }
      }

      const { error } = await supabase.from('protein_logs').insert({
        user_id: user.id,
        amount_g: grams,
        meal_id: mealId ? String(mealId) : null,
        source: source,
        meal_type: mealType,
        logged_at: new Date().toISOString(),
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      // Track analytics event
      await trackEvent('protein_logged', {
        grams,
        source,
        meal_id: mealId ? String(mealId) : null
      });

      // Mark the latest pending nudge as resolved!
      const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
      try {
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
      } catch (err) {
        console.warn('Failed to update nudge on log:', err);
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Update checkmark state if it was a selection meal
      if (mealId) {
        setLoggedMealIds(prev => [...prev, String(mealId)]);
      }

      onLogged(); // Refresh TodayScreen
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save log.');
    }
  }

  async function handleQuickSelect(grams: number, index: number) {
    // Trigger quick grid visual flash
    setFlashingQuickIndex(prev => ({ ...prev, [index]: true }));
    setTimeout(() => {
      setFlashingQuickIndex(prev => ({ ...prev, [index]: false }));
    }, 300);

    await insertProteinLog(grams, undefined, 'quick');
  }

  async function handleCustomSubmit() {
    const grams = parseFloat(customGrams);
    if (isNaN(grams) || grams <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid gram amount.');
      return;
    }

    await insertProteinLog(grams, undefined, 'custom');
    setCustomGrams('');
  }

  async function handleHydrationLog(oz: number) {
    if (!user) return;
    try {
      const { error } = await supabase.from('hydration_logs').insert({
        user_id: user.id,
        amount_oz: oz,
        logged_at: new Date().toISOString(),
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      // Track analytics event
      await trackEvent('hydration_logged', {
        oz
      });

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onLogged();
      loadHydrationToday();

      // Auto-dismiss after 600ms
      setTimeout(() => {
        onDismiss();
      }, 600);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save hydration.');
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.pillContainer}>
            <TouchableOpacity 
              style={[styles.pillButton, activeTab === 'protein' && styles.pillButtonActive]} 
              onPress={() => setActiveTab('protein')}
            >
              <Text style={[styles.pillText, activeTab === 'protein' && styles.pillTextActive]}>Protein</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.pillButton, activeTab === 'hydration' && styles.pillButtonActive]} 
              onPress={() => setActiveTab('hydration')}
            >
              <Text style={[styles.pillText, activeTab === 'hydration' && styles.pillTextActive]}>Hydration</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onDismiss}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Content Body */}
        {activeTab === 'protein' ? (
          <View style={styles.content}>
            {/* Segmented Sub-modes */}
            <View style={styles.segmentedContainer}>
              {(['meals', 'quick', 'custom'] as const).map(mode => (
                <TouchableOpacity 
                  key={mode} 
                  style={[styles.segmentedButton, proteinMode === mode && styles.segmentedButtonActive]} 
                  onPress={() => setProteinMode(mode)}
                >
                  <Text style={[styles.segmentedText, proteinMode === mode && styles.segmentedTextActive]}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Protein Modes Content */}
            {proteinMode === 'meals' && (
              <View style={{ flex: 1 }}>
                {loading ? (
                  <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#0ea5e9" />
                  </View>
                ) : selectedMeals.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No meals selected for this week.</Text>
                    <Text style={styles.emptySub}>Set up your meal plan in the Meals tab first.</Text>
                  </View>
                ) : (
                  <ScrollView contentContainerStyle={styles.scrollContent}>
                    {selectedMeals.map(meal => {
                      const isFlashing = !!flashingMealIds[meal.id];
                      const isLogged = loggedMealIds.includes(String(meal.id));
                      return (
                        <TouchableOpacity
                          key={`${meal.id}-${meal.timeSlot}`}
                          style={[
                            styles.mealCard, 
                            isFlashing && styles.mealCardFlash,
                            isLogged && styles.mealCardLoggedBorder
                          ]}
                          onPress={() => insertProteinLog(meal.protein_g, meal.id, 'meals')}
                        >
                          <View style={styles.mealCardLeft}>
                            <Text style={styles.mealName}>{meal.name}</Text>
                            <Text style={styles.mealSlot}>{meal.timeSlot.toUpperCase()}</Text>
                          </View>
                          <View style={styles.mealCardRight}>
                            <Text style={styles.mealProtein}>{meal.protein_g}g</Text>
                            {isLogged && (
                              <View style={styles.checkBadge}>
                                <Text style={styles.checkText}>✓</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {proteinMode === 'quick' && (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.grid}>
                  {QUICK_ITEMS.map((item, index) => {
                    const isFlashing = !!flashingQuickIndex[index];
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[styles.gridItem, isFlashing && styles.gridItemFlash]}
                        onPress={() => handleQuickSelect(item.grams, index)}
                      >
                        <Text style={styles.gridItemName} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.gridItemGrams}>{item.grams}g</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {proteinMode === 'custom' && (
              <View style={styles.customContainer}>
                <Text style={styles.customLabel}>Enter protein amount</Text>
                <TextInput
                  style={styles.customInput}
                  placeholder="0g"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  value={customGrams}
                  onChangeText={setCustomGrams}
                  autoFocus
                />
                <TouchableOpacity style={styles.customSubmit} onPress={handleCustomSubmit}>
                  <Text style={styles.customSubmitText}>Log Protein</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          /* Hydration Content */
          <View style={styles.content}>
            <Text style={styles.hydrationLabel}>How much did you drink?</Text>
            
            <View style={styles.hydrationGrid}>
              {[8, 16, 24, 32].map(oz => (
                <TouchableOpacity 
                  key={oz} 
                  style={styles.hydrationCard}
                  onPress={() => handleHydrationLog(oz)}
                >
                  <Text style={styles.hydrationVolume}>{oz}</Text>
                  <Text style={styles.hydrationUnit}>oz</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.hydrationFooter}>
              <Text style={styles.hydrationTotalText}>
                You've logged <Text style={styles.hydrationTotalValue}>{hydrationToday} oz</Text> today
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  
  pillContainer: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 20, padding: 3, width: 220 },
  pillButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 18 },
  pillButtonActive: { backgroundColor: '#0ea5e9' },
  pillText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: '#f8fafc' },
  
  closeButton: { padding: 8 },
  closeText: { color: '#94a3b8', fontSize: 20, fontWeight: 'bold' },
  
  content: { flex: 1, padding: 20 },
  
  segmentedContainer: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 10, padding: 4, marginBottom: 20 },
  segmentedButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 7 },
  segmentedButtonActive: { backgroundColor: '#334155' },
  segmentedText: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  segmentedTextActive: { color: '#f8fafc' },
  
  scrollContent: { paddingBottom: 30 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#f8fafc', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  
  mealCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1.5, borderColor: '#334155' },
  mealCardLoggedBorder: { borderColor: '#10b981' },
  mealCardFlash: { backgroundColor: '#052e16', borderColor: '#10b981' },
  mealCardLeft: { flex: 1 },
  mealName: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  mealSlot: { color: '#0ea5e9', fontSize: 11, fontWeight: '700', marginTop: 4 },
  mealCardRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealProtein: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  checkBadge: { backgroundColor: '#10b981', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  checkText: { color: '#f8fafc', fontWeight: 'bold', fontSize: 13 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { backgroundColor: '#1e293b', width: '30%', minHeight: 90, borderRadius: 12, padding: 12, justifyContent: 'space-between', borderWidth: 1.5, borderColor: '#334155' },
  gridItemFlash: { backgroundColor: '#052e16', borderColor: '#10b981' },
  gridItemName: { color: '#94a3b8', fontSize: 12, lineHeight: 16 },
  gridItemGrams: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginTop: 8 },
  
  customContainer: { flex: 1, paddingTop: 20 },
  customLabel: { color: '#f8fafc', fontSize: 16, fontWeight: '500', marginBottom: 12 },
  customInput: { backgroundColor: '#1e293b', borderRadius: 12, padding: 18, color: '#f8fafc', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, borderWidth: 1.5, borderColor: '#334155' },
  customSubmit: { backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center' },
  customSubmitText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  
  hydrationLabel: { color: '#f8fafc', fontSize: 18, fontWeight: '600', marginBottom: 24, textAlign: 'center' },
  hydrationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: 40 },
  hydrationCard: { backgroundColor: '#1e293b', width: '42%', paddingVertical: 32, borderRadius: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#334155' },
  hydrationVolume: { color: '#f8fafc', fontSize: 32, fontWeight: 'bold' },
  hydrationUnit: { color: '#0ea5e9', fontSize: 14, fontWeight: '600', marginTop: 4 },
  
  hydrationFooter: { alignItems: 'center', marginTop: 20 },
  hydrationTotalText: { color: '#94a3b8', fontSize: 16 },
  hydrationTotalValue: { color: '#10b981', fontWeight: 'bold', fontSize: 18 },
});
