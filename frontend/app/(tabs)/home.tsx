import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface FoodEntry {
  id: string;
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  image_base64?: string;
  entry_type: string;
  timestamp: string;
}

interface DailyStats {
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  daily_goal: number;
  remaining_calories: number;
  percentage: number;
  entries_count: number;
}

export default function HomeScreen() {
  const { user, token } = useAuth();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, entriesRes] = await Promise.all([
        axios.get(`${API_URL}/api/stats/daily`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/food/today`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setStats(statsRes.data);
      setEntries(entriesRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const deleteEntry = async (entryId: string) => {
    Alert.alert('Delete Entry', 'Are you sure you want to delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/api/food/${entryId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            loadData();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete entry');
          }
        },
      },
    ]);
  };

  const progressPercentage = stats ? Math.min((stats.total_calories / stats.daily_goal) * 100, 100) : 0;
  const isOverGoal = stats && stats.total_calories > stats.daily_goal;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#36B37E', '#403294']} style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.username}!</Text>
            <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          </View>
          <Ionicons name="fitness" size={32} color="white" />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#36B37E']} />}
      >
        {/* Calorie Progress Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today's Calories</Text>
          <View style={styles.progressContainer}>
            <View style={styles.progressCircle}>
              <Text style={[styles.calorieNumber, isOverGoal && styles.overGoal]}>
                {stats?.total_calories.toFixed(0) || 0}
              </Text>
              <Text style={styles.calorieLabel}>/{stats?.daily_goal || 2000}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressPercentage}%`, backgroundColor: isOverGoal ? '#FF5252' : '#36B37E' }]} />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="flame" size={20} color="#FF6B6B" />
              <Text style={styles.statValue}>{stats?.total_protein.toFixed(0) || 0}g</Text>
              <Text style={styles.statLabel}>Protein</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="leaf" size={20} color="#4ECDC4" />
              <Text style={styles.statValue}>{stats?.total_carbs.toFixed(0) || 0}g</Text>
              <Text style={styles.statLabel}>Carbs</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="water" size={20} color="#FFD93D" />
              <Text style={styles.statValue}>{stats?.total_fats.toFixed(0) || 0}g</Text>
              <Text style={styles.statLabel}>Fats</Text>
            </View>
          </View>
        </View>

        {/* Recent Entries */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Meals</Text>
          <Text style={styles.sectionCount}>{entries.length} entries</Text>
        </View>

        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No meals logged yet</Text>
            <Text style={styles.emptySubtext}>Start tracking your calories!</Text>
          </View>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryLeft}>
                {entry.image_base64 ? (
                  <Image source={{ uri: `data:image/jpeg;base64,${entry.image_base64}` }} style={styles.entryImage} />
                ) : (
                  <View style={[styles.entryImage, styles.entryImagePlaceholder]}>
                    <Ionicons name="fast-food" size={24} color="#36B37E" />
                  </View>
                )}
                <View style={styles.entryInfo}>
                  <Text style={styles.entryName}>{entry.food_name}</Text>
                  <Text style={styles.entryDetails}>
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <View style={styles.entryMacros}>
                    <Text style={styles.macroText}>P: {entry.protein}g</Text>
                    <Text style={styles.macroText}>C: {entry.carbs}g</Text>
                    <Text style={styles.macroText}>F: {entry.fats}g</Text>
                  </View>
                </View>
              </View>
              <View style={styles.entryRight}>
                <Text style={styles.entryCalories}>{entry.calories}</Text>
                <Text style={styles.entryCaloriesLabel}>cal</Text>
                <TouchableOpacity onPress={() => deleteEntry(entry.id)} style={styles.deleteButton}>
                  <Ionicons name="trash-outline" size={20} color="#FF5252" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  date: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  progressCircle: {
    alignItems: 'center',
    marginBottom: 16,
  },
  calorieNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  overGoal: {
    color: '#FF5252',
  },
  calorieLabel: {
    fontSize: 16,
    color: '#999',
    marginTop: 4,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  sectionCount: {
    fontSize: 14,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
  },
  entryCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  entryLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  entryImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  entryImagePlaceholder: {
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  entryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  entryDetails: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  entryMacros: {
    flexDirection: 'row',
    gap: 8,
  },
  macroText: {
    fontSize: 11,
    color: '#666',
  },
  entryRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  entryCalories: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  entryCaloriesLabel: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    padding: 4,
  },
});
