import React, { useState, useEffect, useCallback } from 'react';
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
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';
import axios from 'axios';
import SkeletonPlaceholder from 'react-native-skeleton-placeholder';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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
  serving_weight?: number;
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
  image_url?: string;
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
  
  // Edit modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [editServingSize, setEditServingSize] = useState('');
  const [editServingWeight, setEditServingWeight] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Delete confirmation modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<FoodEntry | null>(null);
  
  // Animation
  const fadeAnim = useState(new Animated.Value(0))[0];
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  const loadData = async () => {
    if (!token) return;
    
    try {
      setError(null);
      const [statsResponse, entriesResponse] = await Promise.all([
        axios.get(`${API_URL}/api/stats/daily`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/food/today`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setStats(statsResponse.data);
      setEntries(entriesResponse.data);
    } catch (error: any) {
      console.error('Error loading data:', error);
      const errorMessage = error.response?.status === 401 
        ? 'Session expired. Please log in again.'
        : error.response?.data?.detail || 'Failed to load data. Please try again.';
      setError(errorMessage);
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
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
      
      // Fetch food image from Unsplash
      const imageUrl = await getFoodImage(searchQuery);
      
      // Convert single result to array for dropdown with image
      setSearchResults([{ ...response.data, image_url: imageUrl }]);
    } catch (error: any) {
      console.error('Search error:', error);
      if (error.code === 'ECONNABORTED') {
        Alert.alert('Timeout', 'Search took too long. Please try again.');
      } else if (error.response?.status === 401) {
        Alert.alert('Session Expired', 'Please log in again.');
      } else {
        Alert.alert('Error', error.response?.data?.detail || 'Failed to search food. Please try again.');
      }
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const getFoodImage = async (foodName: string): Promise<string> => {
    try {
      // Using Unsplash's public image URLs (no API key needed for basic use)
      const query = encodeURIComponent(foodName + ' food');
      const response = await fetch(
        `https://source.unsplash.com/400x300/?${query}`
      );
      return response.url;
    } catch (error) {
      // Fallback to a placeholder if image fetch fails
      return `https://source.unsplash.com/400x300/?food`;
    }
  };

  const getStockFoodImage = (foodName: string): string => {
    // Generate a consistent stock food image URL based on food name
    return `https://source.unsplash.com/150x150/?${encodeURIComponent(foodName)},food`;
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
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
      
      Alert.alert('Success!', `${result.food_name} added to your daily log`);
      setShowDropdown(false);
      setSearchQuery('');
      setSearchResults([]);
      loadData();
    } catch (error: any) {
      console.error('Add to log error:', error);
      const errorMsg = error.response?.status === 401 
        ? 'Session expired. Please log in again.'
        : error.response?.data?.detail || 'Failed to add food. Please try again.';
      Alert.alert('Error', errorMsg);
    } finally {
      setSearching(false);
    }
  };

  const handleCameraPress = () => {
    router.push('/(tabs)/scan');
  };

  const openEditModal = (entry: FoodEntry) => {
    setEditingEntry(entry);
    setEditServingSize(entry.serving_size || '1 serving');
    setEditServingWeight(entry.serving_weight?.toString() || '100');
    setEditModalVisible(true);
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    
    if (!editServingSize.trim()) {
      Alert.alert('Validation Error', 'Please enter a serving size');
      return;
    }
    
    if (!editServingWeight.trim()) {
      Alert.alert('Validation Error', 'Please enter serving weight in grams');
      return;
    }
    
    setSavingEdit(true);
    try {
      await axios.put(
        `${API_URL}/api/food/${editingEntry.id}`,
        { 
          serving_size: editServingSize,
          serving_weight: parseInt(editServingWeight)
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
      
      Alert.alert('Success!', `${editingEntry.food_name} updated successfully`);
      setEditModalVisible(false);
      setEditingEntry(null);
      loadData();
    } catch (error: any) {
      console.error('Edit error:', error);
      const errorMsg = error.response?.status === 401 
        ? 'Session expired. Please log in again.'
        : error.response?.status === 404
        ? 'Meal not found. It may have been deleted.'
        : error.response?.data?.detail || 'Failed to update meal. Please try again.';
      Alert.alert('Error', errorMsg);
    } finally {
      setSavingEdit(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const deleteEntry = (entry: FoodEntry) => {
    console.log('Delete button clicked for entry:', entry.id);
    setDeletingEntry(entry);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!deletingEntry) return;
    
    console.log('Delete confirmed, calling API for:', deletingEntry.id);
    setLoading(true);
    try {
      const url = `${API_URL}/api/food/${deletingEntry.id}`;
      console.log('Deleting from URL:', url);
      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      console.log('Delete successful');
      setDeleteModalVisible(false);
      setDeletingEntry(null);
      Alert.alert('Success', 'Meal deleted successfully');
      loadData();
    } catch (error: any) {
      console.error('Delete error:', error);
      console.error('Error response:', error.response);
      const errorMsg = error.response?.status === 401 
        ? 'Session expired. Please log in again.'
        : error.response?.status === 404
        ? 'Meal not found. It may have been already deleted.'
        : error.response?.data?.detail || 'Failed to delete meal. Please try again.';
      Alert.alert('Error', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = stats ? Math.min((stats.total_calories / stats.daily_goal) * 100, 100) : 0;
  const isOverGoal = stats && stats.total_calories > stats.daily_goal;

  return (
    <View style={styles.container}>
      {loading ? (
        // Loading State
        <View style={styles.container}>
          <LinearGradient colors={['#36B37E', '#403294']} style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.loadingPlaceholder}>
                <ActivityIndicator size="large" color="white" />
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            </View>
          </LinearGradient>
          
          <ScrollView style={styles.content}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#36B37E" />
              <Text style={styles.loadingCardText}>Loading your data...</Text>
            </View>
          </ScrollView>
        </View>
      ) : (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
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
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Quick check calories..."
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (!text.trim()) {
                  setShowDropdown(false);
                  setSearchResults([]);
                }
              }}
              onSubmitEditing={quickSearchFood}
              placeholderTextColor="#999"
            />
            {searching ? (
              <ActivityIndicator size="small" color="#36B37E" style={styles.searchIconRight} />
            ) : (
              <>
                <TouchableOpacity onPress={handleCameraPress} style={styles.cameraButtonIntegrated}>
                  <Ionicons name="camera" size={22} color="#36B37E" />
                </TouchableOpacity>
                <TouchableOpacity onPress={quickSearchFood} style={styles.searchButtonIntegrated}>
                  <Ionicons name="arrow-forward-circle" size={24} color="#36B37E" />
                </TouchableOpacity>
              </>
            )}
          </View>
          
          {/* Dropdown Search Results */}
          {showDropdown && searchResults.length > 0 && (
            <View style={styles.dropdown}>
              {searchResults.map((result, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.dropdownItem}
                  onPress={() => addToLog(result)}
                >
                  <View style={styles.dropdownLeft}>
                    {result.image_url ? (
                      <Image 
                        source={{ uri: result.image_url }} 
                        style={styles.dropdownFoodImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.foodIconPlaceholder}>
                        <Ionicons name="fast-food" size={24} color="#36B37E" />
                      </View>
                    )}
                    <View style={styles.dropdownInfo}>
                      <Text style={styles.dropdownFoodName}>{result.food_name}</Text>
                      {result.serving_size && (
                        <Text style={styles.dropdownServing}>{result.serving_size}</Text>
                      )}
                      <View style={styles.dropdownMacros}>
                        <Text style={styles.dropdownMacroText}>P: {result.protein}g</Text>
                        <Text style={styles.dropdownMacroText}>C: {result.carbs}g</Text>
                        <Text style={styles.dropdownMacroText}>F: {result.fats}g</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.dropdownRight}>
                    <Text style={styles.dropdownCalories}>{result.calories}</Text>
                    <Text style={styles.dropdownCaloriesLabel}>cal</Text>
                    <Ionicons name="add-circle" size={24} color="#36B37E" style={styles.addIcon} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Empty State while searching */}
          {showDropdown && !searching && searchResults.length === 0 && searchQuery.trim() && (
            <View style={styles.dropdown}>
              <View style={styles.dropdownEmpty}>
                <Ionicons name="search-outline" size={32} color="#ccc" />
                <Text style={styles.dropdownEmptyText}>No results found</Text>
                <Text style={styles.dropdownEmptySubtext}>Try a different search term</Text>
              </View>
            </View>
          )}
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
                  <Image 
                    source={{ uri: getStockFoodImage(entry.food_name) }} 
                    style={styles.entryImage}
                  />
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
                <View style={styles.actionButtons}>
                  <TouchableOpacity onPress={() => openEditModal(entry)} style={styles.editButton}>
                    <Ionicons name="pencil-outline" size={20} color="#36B37E" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteEntry(entry)} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={20} color="#FF5252" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Meal</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.modalScrollView} 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
            >
              {editingEntry && (
                <View style={styles.editContainer}>
                  {/* Food Name with Current Serving - Updates as you type */}
                  <View style={styles.foodNameSection}>
                    <Text style={styles.editSectionLabel}>Food Item</Text>
                    <View style={styles.readOnlyBox}>
                      <Ionicons name="restaurant-outline" size={20} color="#666" />
                      <Text style={styles.readOnlyText}>
                        {editingEntry.food_name.split('(')[0].trim()} ({editServingSize})
                      </Text>
                    </View>
                  </View>
                  
                  {/* Current Nutrition Display */}
                  <View style={styles.nutritionInfoCard}>
                    <Text style={styles.nutritionCardTitle}>Current Nutrition</Text>
                    <View style={styles.nutritionRow}>
                      <View style={styles.nutritionCol}>
                        <Text style={styles.nutritionBigValue}>{editingEntry.calories}</Text>
                        <Text style={styles.nutritionSmallLabel}>Calories</Text>
                      </View>
                      <View style={styles.nutritionCol}>
                        <Text style={styles.nutritionBigValue}>{editingEntry.protein}g</Text>
                        <Text style={styles.nutritionSmallLabel}>Protein</Text>
                      </View>
                      <View style={styles.nutritionCol}>
                        <Text style={styles.nutritionBigValue}>{editingEntry.carbs}g</Text>
                        <Text style={styles.nutritionSmallLabel}>Carbs</Text>
                      </View>
                      <View style={styles.nutritionCol}>
                        <Text style={styles.nutritionBigValue}>{editingEntry.fats}g</Text>
                        <Text style={styles.nutritionSmallLabel}>Fats</Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* Serving Size - EDITABLE ONLY */}
                  <View style={styles.servingSizeSection}>
                    <Text style={styles.editSectionLabel}>Change Serving Size</Text>
                    <View style={styles.largeEditBox}>
                      <Ionicons name="pizza-outline" size={24} color="#36B37E" />
                      <TextInput
                        style={styles.largeEditInput}
                        value={editServingSize}
                        onChangeText={setEditServingSize}
                        placeholder="e.g., 2 rotis, Dairy Milk 45g, 1 cup"
                        placeholderTextColor="#999"
                        editable={!savingEdit}
                        autoCorrect={false}
                      />
                    </View>
                    <Text style={styles.editInstruction}>
                      💡 Describe the serving (e.g., "2 rotis", "45g Dairy Milk")
                    </Text>
                  </View>
                  
                  {/* Serving Weight (grams) - NEW */}
                  <View style={styles.servingSizeSection}>
                    <Text style={styles.editSectionLabel}>Serving Weight (grams)</Text>
                    <View style={styles.largeEditBox}>
                      <Ionicons name="scale-outline" size={24} color="#36B37E" />
                      <TextInput
                        style={styles.largeEditInput}
                        value={editServingWeight}
                        onChangeText={setEditServingWeight}
                        placeholder="e.g., 100, 45, 250"
                        keyboardType="numeric"
                        placeholderTextColor="#999"
                        editable={!savingEdit}
                        autoCorrect={false}
                      />
                      <Text style={styles.weightUnit}>g</Text>
                    </View>
                    <Text style={styles.editInstruction}>
                      ⚖️ Total weight in grams for easy tracking
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
            
            {/* Save Button - Fixed at bottom */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveEdit}
              disabled={savingEdit}
            >
              <LinearGradient
                colors={['#36B37E', '#2A9D68']}
                style={styles.saveButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {savingEdit ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="white" />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteModalIcon}>
              <Ionicons name="trash" size={48} color="#FF5252" />
            </View>
            
            <Text style={styles.deleteModalTitle}>Delete Meal?</Text>
            
            {deletingEntry && (
              <Text style={styles.deleteModalText}>
                Are you sure you want to delete "{deletingEntry.food_name}"? This action cannot be undone.
              </Text>
            )}
            
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.deleteConfirmButton}
                onPress={confirmDelete}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </Animated.View>
      )}
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
  searchIcon: {
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  searchIconRight: {
    marginLeft: 8,
  },
  searchButtonIntegrated: {
    padding: 4,
    marginLeft: 4,
  },
  cameraButtonIntegrated: {
    padding: 4,
    marginLeft: 4,
    borderLeftWidth: 1,
    borderLeftColor: '#E0E0E0',
    paddingLeft: 12,
  },
  dropdown: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    maxHeight: 300,
  },
  dropdownItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  foodIconPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dropdownFoodImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  dropdownInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  dropdownFoodName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  dropdownServing: {
    fontSize: 12,
    color: '#36B37E',
    fontWeight: '500',
    marginBottom: 4,
  },
  dropdownMacros: {
    flexDirection: 'row',
    gap: 8,
  },
  dropdownMacroText: {
    fontSize: 11,
    color: '#666',
  },
  dropdownRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  dropdownCalories: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  dropdownCaloriesLabel: {
    fontSize: 11,
    color: '#999',
  },
  addIcon: {
    marginTop: 4,
  },
  dropdownEmpty: {
    alignItems: 'center',
    padding: 32,
  },
  dropdownEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  dropdownEmptySubtext: {
    fontSize: 14,
    color: '#ccc',
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
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
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
    maxHeight: '85%',
    paddingTop: 24,
  },
  modalScrollView: {
    maxHeight: 500,
    paddingHorizontal: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  editContainer: {
    gap: 16,
  },
  editFoodName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  editInfoCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  editInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editLabel: {
    fontSize: 16,
    color: '#666',
  },
  editValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
  },
  editInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  editHint: {
    fontSize: 12,
    color: '#666',
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 4,
    fontStyle: 'italic',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  editHeaderSection: {
    marginBottom: 20,
  },
  foodNameSection: {
    marginBottom: 20,
  },
  servingSizeSection: {
    marginBottom: 20,
  },
  readOnlyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 12,
  },
  readOnlyText: {
    flex: 1,
    fontSize: 16,
    color: '#666',
  },
  editSectionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  largeEditBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#36B37E',
  },
  largeEditInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  weightUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: '#36B37E',
    marginLeft: 8,
  },
  editInstruction: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  nutritionInfoCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  nutritionCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  nutritionCol: {
    alignItems: 'center',
  },
  nutritionBigValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  nutritionSmallLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  saveButton: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  saveButtonGradient: {
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 12,
  },
  loadingCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 40,
    margin: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  loadingCardText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  deleteModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFE5E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  deleteModalText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: 'white',
    alignItems: 'center',
  },
  deleteCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  deleteConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF5252',
    alignItems: 'center',
  },
  deleteConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});