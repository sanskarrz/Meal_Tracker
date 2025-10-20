import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
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
  date: string;
  serving_size?: string;
}

export default function HistoryScreen() {
  const { token } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<any>(null);
  
  // Edit modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [editServingSize, setEditServingSize] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const [entriesRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/food/history?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/stats/daily?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setEntries(entriesRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const openEditModal = (entry: FoodEntry) => {
    setEditingEntry(entry);
    setEditServingSize(entry.serving_size || '1 serving');
    setEditModalVisible(true);
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    
    setLoading(true);
    try {
      await axios.put(
        `${API_URL}/api/food/${editingEntry.id}`,
        { serving_size: editServingSize },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      Alert.alert('Success!', 'Meal updated successfully');
      setEditModalVisible(false);
      setEditingEntry(null);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to update meal');
    } finally {
      setLoading(false);
    }
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

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#36B37E', '#403294']} style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        <Text style={styles.headerSubtitle}>View your past meals</Text>
      </LinearGradient>

      <View style={styles.dateSelector}>
        <TouchableOpacity style={styles.dateButton} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={24} color="#36B37E" />
        </TouchableOpacity>
        <View style={styles.dateDisplay}>
          <Text style={styles.dateText}>
            {isToday ? 'Today' : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.dateButton, isToday && styles.dateButtonDisabled]}
          onPress={() => changeDate(1)}
          disabled={isToday}
        >
          <Ionicons name="chevron-forward" size={24} color={isToday ? '#ccc' : '#36B37E'} />
        </TouchableOpacity>
      </View>

      {stats && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{stats.total_calories.toFixed(0)}</Text>
              <Text style={styles.summaryLabel}>Calories</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{stats.total_protein.toFixed(0)}g</Text>
              <Text style={styles.summaryLabel}>Protein</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{stats.total_carbs.toFixed(0)}g</Text>
              <Text style={styles.summaryLabel}>Carbs</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{stats.total_fats.toFixed(0)}g</Text>
              <Text style={styles.summaryLabel}>Fats</Text>
            </View>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#36B37E']} />}
      >
        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No entries for this date</Text>
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
                  <Text style={styles.entryTime}>
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
                  <TouchableOpacity onPress={() => deleteEntry(entry.id)} style={styles.deleteButton}>
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
            
            {editingEntry && (
              <View style={styles.editContainer}>
                <Text style={styles.editFoodName}>{editingEntry.food_name}</Text>
                
                <View style={styles.editInfoCard}>
                  <View style={styles.editInfoRow}>
                    <Text style={styles.editLabel}>Calories:</Text>
                    <Text style={styles.editValue}>{editingEntry.calories} cal</Text>
                  </View>
                  <View style={styles.editInfoRow}>
                    <Text style={styles.editLabel}>Protein:</Text>
                    <Text style={styles.editValue}>{editingEntry.protein}g</Text>
                  </View>
                  <View style={styles.editInfoRow}>
                    <Text style={styles.editLabel}>Carbs:</Text>
                    <Text style={styles.editValue}>{editingEntry.carbs}g</Text>
                  </View>
                  <View style={styles.editInfoRow}>
                    <Text style={styles.editLabel}>Fats:</Text>
                    <Text style={styles.editValue}>{editingEntry.fats}g</Text>
                  </View>
                </View>
                
                <View style={styles.inputContainer}>
                  <Ionicons name="scale-outline" size={20} color="#36B37E" />
                  <TextInput
                    style={styles.editInput}
                    placeholder="Serving size (e.g., '1 cup', '100g')"
                    value={editServingSize}
                    onChangeText={setEditServingSize}
                    placeholderTextColor="#999"
                  />
                </View>
                
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={saveEdit}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#36B37E', '#2A9D68']}
                    style={styles.saveButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {loading ? (
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
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  dateSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
  },
  dateButton: {
    padding: 8,
  },
  dateButtonDisabled: {
    opacity: 0.3,
  },
  dateDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  summaryCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
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
  entryTime: {
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
    justifyContent: 'center',
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
  servingSize: {
    fontSize: 12,
    color: '#36B37E',
    fontWeight: '500',
    marginBottom: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  editButton: {
    padding: 4,
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
  saveButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
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
});