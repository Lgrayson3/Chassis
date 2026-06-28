import React from 'react';  
import { View, Text, StyleSheet } from 'react-native';

export default function GroceryScreen() {  
  return (  
    <View style={styles.container}>  
      <Text style={styles.header}>Grocery List</Text>  
      <Text style={styles.body}>Coming soon — auto-generated grocery lists based on your weekly meal plan.</Text>  
    </View>  
  );  
}

const styles = StyleSheet.create({  
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center', alignItems: 'center' },  
  header: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 12 },  
  body: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },  
});  
