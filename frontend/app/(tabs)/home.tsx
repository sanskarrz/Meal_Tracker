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
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API_URL = '';

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
  serving_size?: string;
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

interface QuickSearchResult {
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  serving_size?: string;
}

export default function HomeScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Quick search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<QuickSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

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

  const quickSearchFood = async () => {
    if (!searchQuery.trim()) {
      setShowDropdown(false);
      return;
    }
    
    setSearching(true);
    setShowDropdown(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/food/search`,
        { query: searchQuery },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Convert single result to array for dropdown
      setSearchResults([response.data]);
    } catch (error) {
      Alert.alert('Error', 'Failed to search food');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addToLog = async (result: QuickSearchResult) => {
    setSearching(true);
    try {
      await axios.post(
        `${API_URL}/api/food/manual`,
        { 
          food_name: result.food_name,
          serving_size: result.serving_size || '1 serving'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      Alert.alert('Success!', 'Food added to your daily log');
      setShowDropdown(false);
      setSearchQuery('');
      setSearchResults([]);
      loadData(); // Refresh the list
    } catch (error) {
      Alert.alert('Error', 'Failed to add food to log');
    } finally {
      setSearching(false);
    }
  };

  const handleCameraPress = () => {
    router.push('/(tabs)/scan');
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
        
        {/* Quick Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Quick check calories..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={quickSearchFood}
              placeholderTextColor="#999"
            />
            {searching ? (
              <ActivityIndicator size="small" color="#36B37E" />
            ) : (
              <TouchableOpacity onPress={quickSearchFood}>
                <Ionicons name="arrow-forward-circle" size={24} color="#36B37E" />
              </TouchableOpacity>
            )}
          </View>
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
                  {entry.serving_size && (
                    <Text style={styles.servingSize}>{entry.serving_size}</Text>
                  )}
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

      {/* Quick Search Result Modal */}
      <Modal
        visible={showSearchModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nutrition Info</Text>
              <TouchableOpacity onPress={() => setShowSearchModal(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            
            {searchResult && (
              <View style={styles.resultContainer}>
                <Text style={styles.resultFoodName}>{searchResult.food_name}</Text>
                {searchResult.serving_size && (
                  <Text style={styles.resultServing}>{searchResult.serving_size}</Text>
                )}
                
                <View style={styles.resultCalories}>
                  <Text style={styles.resultCaloriesValue}>{searchResult.calories}</Text>
                  <Text style={styles.resultCaloriesLabel}>calories</Text>
                </View>
                
                <View style={styles.resultMacros}>
                  <View style={styles.resultMacroItem}>
                    <Text style={styles.resultMacroValue}>{searchResult.protein}g</Text>
                    <Text style={styles.resultMacroLabel}>Protein</Text>
                  </View>
                  <View style={styles.resultMacroItem}>
                    <Text style={styles.resultMacroValue}>{searchResult.carbs}g</Text>
                    <Text style={styles.resultMacroLabel}>Carbs</Text>
                  </View>
                  <View style={styles.resultMacroItem}>
                    <Text style={styles.resultMacroValue}>{searchResult.fats}g</Text>
                    <Text style={styles.resultMacroLabel}>Fats</Text>
                  </View>
                </View>
                
                <TouchableOpacity
                  style={styles.addToLogButton}
                  onPress={addSearchResultToLog}
                  disabled={searching}
                >
                  <LinearGradient
                    colors={['#36B37E', '#2A9D68']}
                    style={styles.addToLogGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {searching ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <>
                        <Ionicons name="add-circle" size={20} color="white" />
                        <Text style={styles.addToLogText}>Add to Daily Log</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                
                <Text style={styles.resultNote}>Tap to add this food to today's calories</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
    marginBottom: 16,
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
  searchContainer: {
    marginTop: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
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
    marginBottom: 2,
  },
  servingSize: {
    fontSize: 12,
    color: '#36B37E',
    fontWeight: '500',
    marginBottom: 2,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  resultContainer: {
    alignItems: 'center',
  },
  resultFoodName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  resultServing: {
    fontSize: 16,
    color: '#36B37E',
    fontWeight: '500',
    marginBottom: 16,
  },
  resultCalories: {
    alignItems: 'center',
    marginBottom: 24,
  },
  resultCaloriesValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  resultCaloriesLabel: {
    fontSize: 16,
    color: '#999',
  },
  resultMacros: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 24,
  },
  resultMacroItem: {
    alignItems: 'center',
  },
  resultMacroValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  resultMacroLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  resultNote: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 12,
  },
  addToLogButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  addToLogGradient: {
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addToLogText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});