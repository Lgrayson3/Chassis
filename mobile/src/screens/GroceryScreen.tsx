import React, { useState, useEffect, useCallback } from 'react';  
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';  
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import mealsData from '../data/meals.json';

const MEALS_LIBRARY = mealsData as any[];

interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
}

export default function GroceryScreen() {  
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [mealsCount, setMealsCount] = useState(0);
  const [groupedIngredients, setGroupedIngredients] = useState<Record<string, GroceryItem[]>>({});
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const categories = ['Proteins', 'Produce', 'Dairy & Eggs', 'Pantry', 'Other'];
  const weekStart = getWeekStart();

  useFocusEffect(
    useCallback(() => {
      loadGroceryList();
    }, [])
  );

  function getWeekStart(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  async function loadGroceryList() {
    if (!user) return;
    try {
      // 1. Load checked state from AsyncStorage
      const storageKey = `${user.id}_${weekStart}_grocery`;
      const storedChecked = await AsyncStorage.getItem(storageKey);
      if (storedChecked) {
        setCheckedItems(JSON.parse(storedChecked));
      } else {
        setCheckedItems({});
      }

      // 2. Fetch meal selections for the current week
      const { data: selectionData } = await supabase
        .from('meal_selections')
        .select('selections')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .maybeSingle();

      const rawSelections = selectionData?.selections || [];
      setMealsCount(rawSelections.length);

      const selectedMeals = rawSelections.map((item: any) => {
        const mealId = typeof item === 'object' ? (item.meal_id || item.id) : item;
        return MEALS_LIBRARY.find(m => m.id === mealId || m.id === String(mealId));
      }).filter(Boolean);

      // 3. Aggregate ingredients
      const aggList: Record<string, GroceryItem> = {};
      for (const meal of selectedMeals) {
        for (const ing of meal.ingredients || []) {
          // Key by ingredient name and unit to keep different units separate
          const key = `${ing.name.toLowerCase()}_${ing.unit.toLowerCase()}`;
          if (aggList[key]) {
            aggList[key].quantity += ing.quantity;
          } else {
            aggList[key] = {
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              category: meal.grocery_category || 'Other'
            };
          }
        }
      }

      // 4. Group by category
      const grouped: Record<string, GroceryItem[]> = {};
      for (const cat of categories) {
        grouped[cat] = [];
      }

      for (const item of Object.values(aggList)) {
        const cat = categories.includes(item.category) ? item.category : 'Other';
        grouped[cat].push(item);
      }

      setGroupedIngredients(grouped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const toggleChecked = async (item: GroceryItem) => {
    const itemKey = `${item.name}_${item.unit}`;
    const updated = { ...checkedItems, [itemKey]: !checkedItems[itemKey] };
    setCheckedItems(updated);
    
    if (user) {
      const storageKey = `${user.id}_${weekStart}_grocery`;
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const getSortedItems = (catItems: GroceryItem[]) => {
    return [...catItems].sort((a, b) => {
      const keyA = `${a.name}_${a.unit}`;
      const keyB = `${b.name}_${b.unit}`;
      const isCheckedA = !!checkedItems[keyA];
      const isCheckedB = !!checkedItems[keyB];
      if (isCheckedA === isCheckedB) return a.name.localeCompare(b.name);
      return isCheckedA ? 1 : -1; // Checked items go to bottom
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGroceryList();
    setRefreshing(false);
  };

  const hasIngredients = Object.values(groupedIngredients).some(list => list.length > 0);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#94a3b8' }}>Loading groceries...</Text>
      </View>
    );
  }

  return (  
    <View style={styles.wrapper}>
      {hasIngredients ? (
        <ScrollView 
          style={styles.container}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
        >
          {/* Header Row */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>This Week's Groceries</Text>
              <Text style={styles.subtitle}>Based on your {mealsCount} selected meals</Text>
            </View>
            <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
              <Text style={styles.refreshIcon}>⟳</Text>
            </TouchableOpacity>
          </View>

          {/* Grouped Lists */}
          {categories.map(cat => {
            const list = groupedIngredients[cat] || [];
            if (list.length === 0) return null;
            
            const sortedList = getSortedItems(list);

            return (
              <View key={cat} style={styles.section}>
                <Text style={styles.sectionHeader}>{cat}</Text>
                <View style={styles.card}>
                  {sortedList.map((item, index) => {
                    const itemKey = `${item.name}_${item.unit}`;
                    const isChecked = !!checkedItems[itemKey];

                    return (
                      <TouchableOpacity 
                        key={index} 
                        style={[
                          styles.row, 
                          index < sortedList.length - 1 && styles.rowBorder
                        ]}
                        onPress={() => toggleChecked(item)}
                      >
                        <View style={styles.itemLeft}>
                          <Text style={[
                            styles.itemName, 
                            isChecked && styles.itemNameChecked
                          ]}>
                            {item.name}
                          </Text>
                        </View>
                        
                        <View style={styles.itemRight}>
                          <Text style={[
                            styles.itemQty, 
                            isChecked && styles.itemQtyChecked
                          ]}>
                            {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)} {item.unit}
                          </Text>
                          
                          <View style={[
                            styles.checkbox, 
                            isChecked && styles.checkboxChecked
                          ]}>
                            {isChecked && <Text style={styles.checkText}>✓</Text>}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        /* Empty State */
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>Select your meals first</Text>
          <Text style={styles.emptyBody}>
            Your grocery list is empty. Go to the Meals tab and choose your weekly menu to auto-generate shopping items.
          </Text>
          <TouchableOpacity 
            style={styles.emptyButton} 
            onPress={() => navigation.navigate('Main', { screen: 'Meals' })}
          >
            <Text style={styles.emptyButtonText}>Browse Meals</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );  
}

const styles = StyleSheet.create({  
  wrapper: { flex: 1, backgroundColor: '#0f172a' },
  container: { flex: 1 },  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 48 },  
  headerLeft: { flex: 1 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#f8fafc' },  
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 4 },  
  refreshButton: { padding: 8 },
  refreshIcon: { fontSize: 24, color: '#0ea5e9', fontWeight: 'bold' },

  section: { marginHorizontal: 24, marginBottom: 20 },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: '#0ea5e9', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#334155' },
  
  itemLeft: { flex: 1, marginRight: 16 },
  itemName: { color: '#f8fafc', fontSize: 15, fontWeight: '500' },
  itemNameChecked: { color: '#64748b', textDecorationLine: 'line-through' },
  
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemQty: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  itemQtyChecked: { color: '#64748b' },

  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#475569', justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#10b981', borderColor: '#10b981' },
  checkText: { color: '#f8fafc', fontSize: 12, fontWeight: 'bold' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },  
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#f8fafc', marginBottom: 12 },
  emptyBody: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyButton: { backgroundColor: '#0ea5e9', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  emptyButtonText: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
});  
