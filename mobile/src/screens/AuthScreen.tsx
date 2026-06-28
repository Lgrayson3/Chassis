import React, { useState } from 'react';  
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';  
import { useAuth } from '../hooks/useAuth';

export default function AuthScreen() {  
  const [email, setEmail] = useState('');  
  const [password, setPassword] = useState('');  
  const [isSignUp, setIsSignUp] = useState(false);  
  const { signIn, signUp } = useAuth();

  const handleSubmit = async () => {  
    try {  
      if (isSignUp) {  
        await signUp(email, password);  
        Alert.alert('Check your email', 'Confirm your email address to continue.');  
      } else {  
        await signIn(email, password);  
      }  
    } catch (err: any) {  
      Alert.alert('Error', err.message);  
    }  
  };

  return (  
    <View style={styles.container}>  
      <Text style={styles.title}>Chassis</Text>  
      <Text style={styles.subtitle}>Built to keep GLP-1 patients eating, moving, and accountable.</Text>  
      <TextInput  
        style={styles.input}  
        placeholder="Email"  
        placeholderTextColor="#64748b"  
        value={email}  
        onChangeText={setEmail}  
        autoCapitalize="none"  
        keyboardType="email-address"  
      />  
      <TextInput  
        style={styles.input}  
        placeholder="Password"  
        placeholderTextColor="#64748b"  
        value={password}  
        onChangeText={setPassword}  
        secureTextEntry  
      />  
      <TouchableOpacity style={styles.button} onPress={handleSubmit}>  
        <Text style={styles.buttonText}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>  
      </TouchableOpacity>  
      <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>  
        <Text style={styles.link}>  
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}  
        </Text>  
      </TouchableOpacity>  
    </View>  
  );  
}

const styles = StyleSheet.create({  
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' },  
  title: { fontSize: 36, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8, fontFamily: 'PlayfairDisplay' },  
  subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 32 },  
  input: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, color: '#f8fafc', marginBottom: 12, fontSize: 16 },  
  button: { backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },  
  buttonText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },  
  link: { color: '#0ea5e9', textAlign: 'center', marginTop: 20, fontSize: 14 },  
});  
