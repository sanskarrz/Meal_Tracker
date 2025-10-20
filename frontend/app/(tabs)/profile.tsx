import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  
  // Modal states
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [faqModalVisible, setFaqModalVisible] = useState(false);
  const [howToModalVisible, setHowToModalVisible] = useState(false);

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };
  
  const confirmLogout = async () => {
    await logout();
    setLogoutModalVisible(false);
    router.replace('/(auth)/login');
  };
  
  const showFAQ = () => {
    setFaqModalVisible(true);
  };
  
  const showHowTo = () => {
    setHowToModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#36B37E', '#403294']} style={styles.header}>
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={48} color="white" />
          </View>
          <Text style={styles.name}>{user?.username}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daily Goal</Text>
          <View style={styles.goalRow}>
            <View style={styles.goalInfo}>
              <Ionicons name="flame" size={32} color="#36B37E" />
              <View style={styles.goalText}>
                <Text style={styles.goalValue}>{user?.daily_calorie_goal || 2000}</Text>
                <Text style={styles.goalLabel}>Calories/day</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <TouchableOpacity style={styles.menuItem} onPress={showHowTo}>
            <Ionicons name="information-circle-outline" size={24} color="#36B37E" />
            <Text style={styles.menuText}>How to use</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={showFAQ}>
            <Ionicons name="help-circle-outline" size={24} color="#36B37E" />
            <Text style={styles.menuText}>FAQ</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#FF5252" />
            <Text style={[styles.menuText, styles.logoutText]}>Logout</Text>
            <Ionicons name="chevron-forward" size={20} color="#FF5252" />
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Healthism Calorie Tracker</Text>
          <Text style={styles.footerSubtext}>Version 1.0.0</Text>
        </View>
      </ScrollView>
      
      {/* Logout Confirmation Modal */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <Ionicons name="log-out" size={48} color="#FF5252" />
            </View>
            <Text style={styles.modalTitle}>Logout?</Text>
            <Text style={styles.modalText}>
              Are you sure you want to logout? You'll need to sign in again to access your account.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={confirmLogout}
              >
                <Text style={styles.confirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* FAQ Modal */}
      <Modal
        visible={faqModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFaqModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.infoModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.infoModalTitle}>Frequently Asked Questions</Text>
              <TouchableOpacity onPress={() => setFaqModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.infoScroll}>
              <View style={styles.faqItem}>
                <Text style={styles.faqQuestion}>Q: How accurate is the calorie tracking?</Text>
                <Text style={styles.faqAnswer}>
                  Our AI uses Google Gemini Vision to analyze food images with 95%+ accuracy. For manual entries, we use comprehensive nutritional databases.
                </Text>
              </View>
              <View style={styles.faqItem}>
                <Text style={styles.faqQuestion}>Q: Can I edit serving sizes?</Text>
                <Text style={styles.faqAnswer}>
                  Yes! Click the edit icon (pencil) next to any meal to adjust the serving size.
                </Text>
              </View>
              <View style={styles.faqItem}>
                <Text style={styles.faqQuestion}>Q: How do I scan food?</Text>
                <Text style={styles.faqAnswer}>
                  Go to the Scan tab, point your camera at food, or choose from your gallery. The AI will analyze and calculate calories automatically.
                </Text>
              </View>
              <View style={styles.faqItem}>
                <Text style={styles.faqQuestion}>Q: Can I track recipes?</Text>
                <Text style={styles.faqAnswer}>
                  Absolutely! Go to Add tab, switch to Recipe mode, and paste your recipe. The app will calculate total nutrition.
                </Text>
              </View>
              <View style={styles.faqItem}>
                <Text style={styles.faqQuestion}>Q: Is my data saved?</Text>
                <Text style={styles.faqAnswer}>
                  Yes! All your meals are saved securely and synced to your account. You can view history anytime.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      
      {/* How To Use Modal */}
      <Modal
        visible={howToModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHowToModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.infoModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.infoModalTitle}>How to Use</Text>
              <TouchableOpacity onPress={() => setHowToModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.infoScroll}>
              <View style={styles.howToStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Scan Your Food</Text>
                  <Text style={styles.stepText}>
                    Use the Scan tab to take a photo of your meal or select from gallery. AI will recognize and calculate calories.
                  </Text>
                </View>
              </View>
              <View style={styles.howToStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Manual Entry</Text>
                  <Text style={styles.stepText}>
                    Go to Add tab to manually enter food names or entire recipes. Adjust serving sizes as needed.
                  </Text>
                </View>
              </View>
              <View style={styles.howToStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Quick Search</Text>
                  <Text style={styles.stepText}>
                    Use the search bar on Home screen for quick calorie checks. Click camera icon for instant scanning.
                  </Text>
                </View>
              </View>
              <View style={styles.howToStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>4</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Track & Edit</Text>
                  <Text style={styles.stepText}>
                    View daily progress on Home. Edit (pencil icon) or delete (trash icon) any entry. Check history for past days.
                  </Text>
                </View>
              </View>
            </ScrollView>
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
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  profileSection: {
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  email: {
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
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  goalText: {
    flex: 1,
  },
  goalValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#36B37E',
  },
  goalLabel: {
    fontSize: 14,
    color: '#999',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    padding: 16,
    paddingBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 16,
  },
  logoutText: {
    color: '#FF5252',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
  },
});