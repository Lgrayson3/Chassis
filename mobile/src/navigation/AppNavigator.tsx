import React from 'react';  
import { NavigationContainer } from '@react-navigation/native';  
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';  
import { createNativeStackNavigator } from '@react-navigation/native-stack';  
import { Ionicons } from '@expo/vector-icons';  
import { useAuth } from '../hooks/useAuth';  
import { usePushNotifications } from '../hooks/usePushNotifications';

import TodayScreen from '../screens/TodayScreen';  
import MealsScreen from '../screens/MealsScreen';  
import GroceryScreen from '../screens/GroceryScreen';  
import TrainScreen from '../screens/TrainScreen';  
import SettingsScreen from '../screens/SettingsScreen';  
import OnboardingScreen from '../screens/OnboardingScreen';  
import AuthScreen from '../screens/AuthScreen';

const Tab = createBottomTabNavigator();  
const Stack = createNativeStackNavigator();

function MainTabs() {  
  return (  
    <Tab.Navigator  
      screenOptions={({ route }) => ({  
        tabBarActiveTintColor: '#0ea5e9',  
        tabBarInactiveTintColor: '#64748b',  
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b' },  
        headerStyle: { backgroundColor: '#0f172a' },  
        headerTintColor: '#f8fafc',  
        tabBarIcon: ({ color, size }) => {  
          let iconName: any = 'home';  
          if (route.name === 'Today') iconName = 'home';  
          else if (route.name === 'Meals') iconName = 'restaurant';  
          else if (route.name === 'Grocery') iconName = 'cart';  
          else if (route.name === 'Train') iconName = 'barbell';  
          return <Ionicons name={iconName} size={size} color={color} />;  
        },  
      })}  
    >  
      <Tab.Screen name="Today" component={TodayScreen} />  
      <Tab.Screen name="Meals" component={MealsScreen} />  
      <Tab.Screen name="Grocery" component={GroceryScreen} />  
      <Tab.Screen name="Train" component={TrainScreen} />  
    </Tab.Navigator>  
  );  
}

export default function AppNavigator() {  
  const { session, user, loading } = useAuth();  
  usePushNotifications();

  if (loading) return null;

  return (  
    <NavigationContainer>  
      <Stack.Navigator screenOptions={{ headerShown: false }}>  
        {!session ? (  
          <Stack.Screen name="Auth" component={AuthScreen} />  
        ) : !user?.user_metadata?.onboarding_complete ? (  
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />  
        ) : (  
          <>  
            <Stack.Screen name="Main" component={MainTabs} />  
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: 'Settings' }} />  
          </>  
        )}  
      </Stack.Navigator>  
    </NavigationContainer>  
  );  
}  
