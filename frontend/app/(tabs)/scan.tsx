import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Animated,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import SkeletonPlaceholder from 'react-native-skeleton-placeholder';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ScanScreen() {
  const router = useRouter();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [servingSize, setServingSize] = useState('');
  const [servingWeight, setServingWeight] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const { token } = useAuth();
  const cameraRef = useRef<any>(null);
  const analysisTimerRef = useRef<any>(null);
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    return () => {
      if (analysisTimerRef.current) {
        clearTimeout(analysisTimerRef.current);
      }
    };
  }, []);

  if (!permission) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#36B37E" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#36B37E" />
        <Text style={styles.permissionText}>Camera Permission Required</Text>
        <Text style={styles.permissionSubtext}>
          We need access to your camera to scan food items
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <LinearGradient
            colors={['#36B37E', '#2A9D68']}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current && !isAnalyzing) {
      try {
        setIsAnalyzing(true);
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.7,
          base64: true,
        });
        
        setCapturedImage(photo.uri);
        await analyzeImage(photo.base64);
      } catch (error) {
        console.error('Error taking picture:', error);
        Alert.alert('Error', 'Failed to take picture');
        setIsAnalyzing(false);
      }
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setIsAnalyzing(true);
        setCapturedImage(result.assets[0].uri);
        await analyzeImage(result.assets[0].base64);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const analyzeImage = async (base64Image: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/api/food/analyze-image`,
        { image_base64: base64Image },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000 
        }
      );

      setLastResult(response.data);
      setServingSize(response.data.serving_size || '1 serving');
      setServingWeight(response.data.serving_weight?.toString() || '100');
      setShowAddModal(true);
      
      // Trigger fade-in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
      
    } catch (error: any) {
      console.error('Error analyzing image:', error);
      let errorMessage = 'Failed to analyze image. Please try again.';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Analysis took too long. Please try again with a clearer photo.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      
      Alert.alert('Analysis Error', errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addToLog = async () => {
    if (!lastResult || !lastResult.id) return;
    
    if (!servingSize.trim()) {
      Alert.alert('Validation Error', 'Please enter a serving size');
      return;
    }
    
    if (!servingWeight.trim()) {
      Alert.alert('Validation Error', 'Please enter serving weight in grams');
      return;
    }
    
    setIsAnalyzing(true);
    try {
      // Update the already-saved entry with the confirmed serving size and weight
      await axios.put(
        `${API_URL}/api/food/${lastResult.id}`,
        { 
          serving_size: servingSize,
          serving_weight: parseInt(servingWeight)
        },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );
      
      Alert.alert('Success!', `${lastResult.food_name} added to your daily log`);
      setShowAddModal(false);
      setLastResult(null);
      setCapturedImage(null);
      setServingSize('');
      setServingWeight('');
      
      // Navigate to home to see the entry
      router.push('/(tabs)/home');
    } catch (error: any) {
      console.error('Add to log error:', error);
      const errorMsg = error.response?.status === 401 
        ? 'Session expired. Please log in again.'
        : error.response?.data?.detail || 'Failed to add food. Please try again.';
      Alert.alert('Error', errorMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#36B37E', '#403294']} style={styles.header}>
        <Text style={styles.headerTitle}>Scan Food</Text>
        <Text style={styles.headerSubtitle}>Point camera at food or select from gallery</Text>
      </LinearGradient>

      <View style={styles.cameraContainer}>
        {capturedImage ? (
          <View style={styles.imagePreview}>
            <Image source={{ uri: capturedImage }} style={styles.previewImage} />
            {isAnalyzing && (
              <View style={styles.analyzingOverlay}>
                <ActivityIndicator size="large" color="white" />
                <Text style={styles.analyzingText}>Analyzing food...</Text>
              </View>
            )}
          </View>
        ) : (
          <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
            <View style={styles.cameraOverlay}>
              <View style={styles.scanFrame} />
              <Text style={styles.instructionText}>
                Position food within the frame
              </Text>
            </View>
          </CameraView>
        )}
      </View>

      <View style={styles.controls}>
        {!capturedImage && (
          <>
            <TouchableOpacity style={styles.controlButton} onPress={pickImage}>
              <Ionicons name="images" size={32} color="#36B37E" />
              <Text style={styles.controlLabel}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.captureButton, isAnalyzing && styles.captureButtonDisabled]}
              onPress={takePicture}
              disabled={isAnalyzing}
            >
              <LinearGradient
                colors={['#36B37E', '#2A9D68']}
                style={styles.captureGradient}
              >
                <Ionicons name="camera" size={32} color="white" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={toggleCameraFacing}>
              <Ionicons name="camera-reverse" size={32} color="#36B37E" />
              <Text style={styles.controlLabel}>Flip</Text>
            </TouchableOpacity>
          </>
        )}

        {capturedImage && !isAnalyzing && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setCapturedImage(null);
              setLastResult(null);
            }}
          >
            <Text style={styles.retryText}>Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {/* Result Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalContent, { opacity: fadeAnim }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Food Detected!</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {lastResult && (
                <View style={styles.resultContainer}>
                  {/* Section 1: Food Name - Large and Clear */}
                  <Text style={styles.confirmLabel}>Food Name</Text>
                  <View style={styles.largeInputBox}>
                    <TextInput
                      style={styles.largeInput}
                      value={lastResult.food_name}
                      onChangeText={(text) => setLastResult({...lastResult, food_name: text})}
                      placeholderTextColor="#999"
                      placeholder="Enter food name"
                    />
                    <Ionicons name="create-outline" size={24} color="#36B37E" />
                  </View>
                  
                  {/* Section 2: Nutrition Info - Big Display */}
                  <View style={styles.nutritionDisplayCard}>
                    <View style={styles.caloriesBig}>
                      <Text style={styles.caloriesBigValue}>{lastResult.calories}</Text>
                      <Text style={styles.caloriesBigLabel}>Calories</Text>
                    </View>
                    <View style={styles.macrosRow}>
                      <View style={styles.macroBox}>
                        <Text style={styles.macroBoxValue}>{lastResult.protein}g</Text>
                        <Text style={styles.macroBoxLabel}>Protein</Text>
                      </View>
                      <View style={styles.macroBox}>
                        <Text style={styles.macroBoxValue}>{lastResult.carbs}g</Text>
                        <Text style={styles.macroBoxLabel}>Carbs</Text>
                      </View>
                      <View style={styles.macroBox}>
                        <Text style={styles.macroBoxValue}>{lastResult.fats}g</Text>
                        <Text style={styles.macroBoxLabel}>Fats</Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* Section 3: Serving Size - Large and Clear */}
                  <Text style={styles.confirmLabel}>Serving Size</Text>
                  <View style={styles.largeInputBox}>
                    <TextInput
                      style={styles.largeInput}
                      placeholder="e.g., '2 rotis (60g each)', 'Dairy Milk 45g'"
                      value={servingSize}
                      onChangeText={setServingSize}
                      placeholderTextColor="#999"
                    />
                    <Ionicons name="create-outline" size={24} color="#36B37E" />
                  </View>
                  
                  {/* Section 4: Serving Weight (NEW) - Quick Edit in Grams */}
                  <Text style={styles.confirmLabel}>Serving Weight (grams)</Text>
                  <View style={styles.largeInputBox}>
                    <Ionicons name="scale-outline" size={24} color="#36B37E" style={{marginRight: 12}} />
                    <TextInput
                      style={styles.largeInput}
                      placeholder="e.g., '100', '45', '250'"
                      value={servingWeight}
                      onChangeText={setServingWeight}
                      keyboardType="numeric"
                      placeholderTextColor="#999"
                    />
                    <Text style={styles.weightUnit}>g</Text>
                  </View>
                  
                  <Text style={styles.confirmHint}>
                    ✏️ Edit serving size or weight above before adding to your log
                  </Text>
                  
                  {/* Large Confirm Button */}
                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={addToLog}
                    disabled={isAnalyzing}
                  >
                    <LinearGradient
                      colors={['#36B37E', '#2A9D68']}
                      style={styles.confirmGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {isAnalyzing ? (
                        <ActivityIndicator color="white" size="large" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={28} color="white" />
                          <Text style={styles.confirmButtonText}>Confirm & Add to Log</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F5F5F5',
  },
  permissionText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  permissionSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  permissionButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
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
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 280,
    height: 280,
    borderWidth: 3,
    borderColor: '#36B37E',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    marginTop: 24,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  imagePreview: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingText: {
    color: 'white',
    fontSize: 18,
    marginTop: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: 'white',
  },
  controlButton: {
    alignItems: 'center',
    padding: 8,
  },
  controlLabel: {
    fontSize: 12,
    color: '#36B37E',
    marginTop: 4,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    flex: 1,
    backgroundColor: '#36B37E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
    paddingTop: 24,
    paddingHorizontal: 24,
    maxHeight: '80%',
  },
  modalScroll: {
    maxHeight: '100%',
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
    paddingBottom: 24,
  },
  resultFoodName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  foodNameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  servingInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  editHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  confirmLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  largeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  largeInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  nutritionDisplayCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
  },
  caloriesBig: {
    alignItems: 'center',
    marginBottom: 16,
  },
  caloriesBigValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  caloriesBigLabel: {
    fontSize: 18,
    color: '#666',
    marginTop: 4,
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  macroBox: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  macroBoxValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  macroBoxLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  confirmHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  confirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  confirmGradient: {
    flexDirection: 'row',
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  addToLogButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
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
