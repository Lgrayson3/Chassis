import React, { useState, useEffect } from 'react';  
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';  
import { supabase } from '../lib/supabase';  
import { useAuth } from '../hooks/useAuth';  
import mealsData from '../data/meals.json';

const MEALS = mealsData as any[];

export default function MealsScreen() {  
  const { user } = useAuth();  
  const [textureFilter, setTextureFilter] = useState<string>('all');  
  const [mealTypeFilter, setMealTypeFilter] = useState<string>('all');  
  const [search, setSearch] = useState('');  
  const [selections, setSelections] = useState<any[]>([]);

  useEffect(() => {  
    loadSelections();  
  }, []);

  async function loadSelections() {  
    const today = new Date().toISOString().split('T')[0];  
    const { data } = await supabase.from('meal_selections').select('selections').eq('user_id', user!.id).eq('week_start', today).single();  
    if (data) setSelections(data.selections);  
  }

  const filteredMeals = MEALS.filter(m => {  
    if (textureFilter !== 'all' && !m.texture.includes(textureFilter)) return false;  
    if (mealTypeFilter !== 'all' && !m.meal_types.includes(mealTypeFilter)) return false;  
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;  
    return true;  
  });

  return (  
    <ScrollView style={styles.container}>  
      <Text style={styles.header}>Meal Library</Text>  
      <TextInput style={styles.search} placeholder="Search meals..." placeholderTextColor="#64748b" value={search} onChangeText={setSearch} />  
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>  
        {['all', 'liquid', 'soft', 'standard'].map(t => (  
          <TouchableOpacity key={t} style={[styles.filterChip, textureFilter === t && styles.filterActive]} onPress={() => setTextureFilter(t)}>  
            <Text style={styles.filterText}>{t}</Text>  
          </TouchableOpacity>  
        ))}  
      </ScrollView>  
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>  
        {['all', 'breakfast', 'lunch', 'dinner', 'snack'].map(t => (  
          <TouchableOpacity key={t} style={[styles.filterChip, mealTypeFilter === t && styles.filterActive]} onPress={() => setMealTypeFilter(t)}>  
            <Text style={styles.filterText}>{t}</Text>  
          </TouchableOpacity>  
        ))}  
      </ScrollView>  
      {filteredMeals.map(meal => (  
        <View key={meal.id} style={styles.mealCard}>  
          <Text style={styles.mealName}>{meal.name}</Text>  
          <View style={styles.mealMeta}>  
            <Text style={styles.mealMetaText}>{meal.protein_g}g protein</Text>  
            <Text style={styles.mealMetaText}>{meal.calories} cal</Text>  
            <Text style={styles.mealMetaText}>{meal.prep_time_min} min</Text>  
          </View>  
          <View style={styles.textureRow}>  
            {meal.texture.map((t: string) => (  
              <View key={t} style={styles.badge}><Text style={styles.badgeText}>{t}</Text></View>  
            ))}  
          </View>  
        </View>  
      ))}  
    </ScrollView>  
  );  
}

const styles = StyleSheet.create({  
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24 },  
  header: { fontSize: 28, fontWeight: 'bold', color: '#f8fafc', marginBottom: 16 },  
  search: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, color: '#f8fafc', fontSize: 16, marginBottom: 12 },  
  filters: { marginBottom: 12 },  
  filterChip: { backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 },  
  filterActive: { backgroundColor: '#0ea5e9' },  
  filterText: { color: '#f8fafc', fontSize: 13 },  
  mealCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 12 },  
  mealName: { fontSize: 16, fontWeight: '600', color: '#f8fafc', marginBottom: 8 },  
  mealMeta: { flexDirection: 'row', gap: 16, marginBottom: 8 },  
  mealMetaText: { fontSize: 13, color: '#94a3b8' },  
  textureRow: { flexDirection: 'row', gap: 8 },  
  badge: { backgroundColor: '#0f172a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },  
  badgeText: { fontSize: 11, color: '#0ea5e9' },  
});  
