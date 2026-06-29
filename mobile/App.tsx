import React from 'react';  
import { StatusBar } from 'expo-status-bar';  
import { AuthProvider } from './src/hooks/useAuth';  
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

export default function App() {  
  return (  
    <ErrorBoundary>
      <AuthProvider>  
        <AppNavigator />  
        <StatusBar style="light" />  
      </AuthProvider>  
    </ErrorBoundary>
  );  
}  
