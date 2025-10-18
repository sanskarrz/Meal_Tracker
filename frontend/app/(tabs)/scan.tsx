import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export default function ScanScreen() {
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const { token } = useAuth();
  const cameraRef = useRef<any>(null);
  const analysisTimerRef = useRef<any>(null);

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
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setLastResult(response.data);
      Alert.alert(
        'Food Detected!',
        `${response.data.food_name}\nCalories: ${response.data.calories}\nProtein: ${response.data.protein}g\nCarbs: ${response.data.carbs}g\nFats: ${response.data.fats}g`,
        [
          {
            text: 'OK',
            onPress: () => {
              setCapturedImage(null);
              setLastResult(null);
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error analyzing image:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to analyze image');
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

      {lastResult && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>{lastResult.food_name}</Text>
          <View style={styles.resultRow}>
            <View style={styles.resultItem}>
              <Text style={styles.resultValue}>{lastResult.calories}</Text>
              <Text style={styles.resultLabel}>Calories</Text>
            </View>
            <View style={styles.resultItem}>
              <Text style={styles.resultValue}>{lastResult.protein}g</Text>
              <Text style={styles.resultLabel}>Protein</Text>
            </View>
            <View style={styles.resultItem}>
              <Text style={styles.resultValue}>{lastResult.carbs}g</Text>
              <Text style={styles.resultLabel}>Carbs</Text>
            </View>
            <View style={styles.resultItem}>
              <Text style={styles.resultValue}>{lastResult.fats}g</Text>
              <Text style={styles.resultLabel}>Fats</Text>
            </View>
          </View>
        </View>
      )}
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
  resultCard: {
    position: 'absolute',
    bottom: 120,
    left: 16,
    right: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  resultItem: {
    alignItems: 'center',
  },
  resultValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  resultLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});
