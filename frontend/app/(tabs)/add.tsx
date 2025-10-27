import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Animated,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function AddScreen() {
  const { token } = useAuth();
  const router = useRouter();
  
  const [mode, setMode] = useState<'manual' | 'recipe'>('manual');
  const [foodName, setFoodName] = useState('');
  const [servingSize, setServingSize] = useState('1 serving');
  const [recipeText, setRecipeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  const addManualFood = async () => {
    if (!foodName.trim()) {
      Alert.alert('Validation Error', 'Please enter a food name');
      return;
    }
    
    if (!servingSize.trim()) {
      Alert.alert('Validation Error', 'Please enter a serving size');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/food/manual`,
        { food_name: foodName, serving_size: servingSize },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 12000
        }
      );

      setResult(response.data);
      setShowResultModal(true);
      
      // Trigger fade-in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

    } catch (error: any) {
      console.error('Error adding food:', error);
      let errorMessage = 'Failed to analyze food. Please try again.';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Analysis took too long. Please try again.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const addToLog = async () => {
    setShowResultModal(false);
    
    // Show success confirmation
    setTimeout(() => {
      Alert.alert(
        '✓ Food Added!', 
        `${result.food_name} has been added to your daily log`,
        [
          {
            text: 'View on Home',
            onPress: () => router.push('/(tabs)/home')
          },
          {
            text: 'Add More',
            style: 'cancel'
          }
        ]
      );
    }, 300);
    
    // Reset forms
    if (mode === 'manual') {
      setFoodName('');
      setServingSize('1 serving');
    } else {
      setRecipeText('');
    }
    setResult(null);
  };

  const closeResultModal = () => {
    setShowResultModal(false);
    
    // Show success message and navigate to home
    setTimeout(() => {
      Alert.alert(
        '✓ Food Added!', 
        `${result?.food_name || 'Food'} has been added to your daily log`,
        [
          {
            text: 'View on Home',
            onPress: () => router.push('/(tabs)/home')
          },
          {
            text: 'OK',
            style: 'cancel'
          }
        ]
      );
    }, 300);
    
    // Reset forms
    if (mode === 'manual') {
      setFoodName('');
      setServingSize('1 serving');
    } else {
      setRecipeText('');
    }
    setResult(null);
  };

  const analyzeRecipe = async () => {
    if (!recipeText.trim()) {
      Alert.alert('Error', 'Please enter a recipe');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/food/analyze-recipe`,
        { recipe_text: recipeText },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000
        }
      );

      setResult(response.data);
      setShowResultModal(true);
      
      // Trigger fade-in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

    } catch (error: any) {
      console.error('Error analyzing recipe:', error);
      let errorMessage = 'Failed to analyze recipe. Please try again.';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Analysis took too long. Please try again.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#36B37E', '#403294']} style={styles.header}>
        <Text style={styles.headerTitle}>Add Food</Text>
        <Text style={styles.headerSubtitle}>Manually enter food or analyze recipe</Text>
      </LinearGradient>

      <View style={styles.modeSelector}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
          onPress={() => setMode('manual')}
        >
          <Text style={[styles.modeText, mode === 'manual' && styles.modeTextActive]}>
            Manual Entry
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'recipe' && styles.modeButtonActive]}
          onPress={() => setMode('recipe')}
        >
          <Text style={[styles.modeText, mode === 'recipe' && styles.modeTextActive]}>
            Recipe Analysis
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {mode === 'manual' ? (
            <View style={styles.formContainer}>
              <View style={styles.infoCard}>
                <Ionicons name="information-circle" size={24} color="#36B37E" />
                <Text style={styles.infoText}>
                  Enter any food item and our AI will estimate its nutritional values
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="fast-food-outline" size={20} color="#36B37E" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter food name (e.g., 'Apple', 'Grilled Chicken')"
                  value={foodName}
                  onChangeText={setFoodName}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="scale-outline" size={20} color="#36B37E" />
                <TextInput
                  style={styles.input}
                  placeholder="Serving size (e.g., '45g', '2 rotis (120g)', '1 cup (150ml)')"
                  value={servingSize}
                  onChangeText={setServingSize}
                  placeholderTextColor="#999"
                />
              </View>
              <Text style={styles.servingHint}>
                💡 Be specific: Include weight (grams/ml), pieces, or measurements
              </Text>

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={addManualFood}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#36B37E', '#2A9D68']}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.buttonText}>Add Food</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formContainer}>
              <View style={styles.infoCard}>
                <Ionicons name="restaurant" size={24} color="#36B37E" />
                <Text style={styles.infoText}>
                  Paste your recipe with ingredients and our AI will calculate total nutrition
                </Text>
              </View>

              <View style={styles.textAreaContainer}>
                <TextInput
                  style={styles.textArea}
                  placeholder="Paste your recipe here...\n\nExample:\n- 2 eggs\n- 1 cup rice\n- 100g chicken breast\n- 1 tbsp olive oil"
                  value={recipeText}
                  onChangeText={setRecipeText}
                  multiline
                  numberOfLines={10}
                  textAlignVertical="top"
                  placeholderTextColor="#999"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={analyzeRecipe}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#36B37E', '#2A9D68']}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.buttonText}>Analyze Recipe</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Result Modal */}
      <Modal
        visible={showResultModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeResultModal}
      >
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalContent, { opacity: fadeAnim }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-circle" size={48} color="#36B37E" />
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeResultModal}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {result && (
              <>
                <Text style={styles.modalTitle}>{result.food_name}</Text>
                <Text style={styles.modalSubtitle}>Nutritional Information</Text>

                <View style={styles.nutritionGrid}>
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionLabel}>Calories</Text>
                    <Text style={styles.nutritionValue}>{result.calories}</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionLabel}>Protein</Text>
                    <Text style={styles.nutritionValue}>{result.protein}g</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionLabel}>Carbs</Text>
                    <Text style={styles.nutritionValue}>{result.carbs}g</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                    <Text style={styles.nutritionLabel}>Fats</Text>
                    <Text style={styles.nutritionValue}>{result.fats}g</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.modalButton} onPress={addToLog}>
                  <LinearGradient
                    colors={['#36B37E', '#2A9D68']}
                    style={styles.buttonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.buttonText}>Close</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
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
  modeSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#36B37E',
  },
  modeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modeTextActive: {
    color: 'white',
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  formContainer: {
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#2E7D32',
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    height: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#333',
  },
  servingHint: {
    fontSize: 12,
    color: '#666',
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 4,
    fontStyle: 'italic',
  },
  textAreaContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  textArea: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalCloseButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  nutritionItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nutritionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  modalButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
});