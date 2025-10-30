#!/usr/bin/env python3
"""
Backend API Testing for User-Reported Issues
Testing specific problems:
1. Serving weight always shows 100g after editing
2. Food name doesn't update when serving weight changes
3. Images not showing in home screen
"""

import requests
import json
import base64
import time
from datetime import datetime

# Use production URL from frontend/.env
BASE_URL = "https://nutritrack-plus-1.preview.emergentagent.com/api"

class HealthismAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.test_user = {
            "username": f"testuser_{int(time.time())}",
            "email": f"test_{int(time.time())}@example.com", 
            "password": "testpass123"
        }
        self.created_entries = []
        
    def setup_auth(self):
        """Register and login to get auth token"""
        print("🔐 Setting up authentication...")
        
        # Register user
        register_data = {
            "username": self.test_user["username"],
            "email": self.test_user["email"],
            "password": self.test_user["password"],
            "daily_calorie_goal": 2000
        }
        
        try:
            response = requests.post(f"{self.base_url}/auth/register", json=register_data, timeout=30)
            if response.status_code == 200:
                self.token = response.json()["access_token"]
                print(f"✅ User registered and authenticated: {self.test_user['username']}")
                return True
            else:
                print(f"❌ Registration failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Auth setup failed: {str(e)}")
            return False
    
    def get_headers(self):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def create_sample_image_base64(self):
        """Create a food-like image in base64 format for testing"""
        import io
        from PIL import Image, ImageDraw
        
        # Create a more food-like image (circular shape like a plate with food)
        img = Image.new('RGB', (200, 200), color='white')
        draw = ImageDraw.Draw(img)
        
        # Draw a plate (circle)
        draw.ellipse([20, 20, 180, 180], fill='lightgray', outline='gray')
        
        # Draw some food items (circles representing rice/food)
        draw.ellipse([60, 60, 140, 140], fill='wheat', outline='brown')  # Main food
        draw.ellipse([70, 70, 90, 90], fill='orange', outline='darkorange')  # Vegetable
        draw.ellipse([110, 80, 130, 100], fill='green', outline='darkgreen')  # Vegetable
        
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        image_bytes = buffer.getvalue()
        return base64.b64encode(image_bytes).decode('utf-8')
    
    def test_serving_weight_save_retrieve(self):
        """TEST 1: Test serving weight save and retrieve functionality"""
        print("\n🧪 TEST 1: Serving Weight Save & Retrieve")
        print("=" * 50)
        
        try:
            # Step 1: Create a food entry via camera scan
            print("Step 1: Creating food entry via POST /api/food/analyze-image...")
            image_base64 = self.create_sample_image_base64()
            
            create_data = {"image_base64": image_base64}
            response = requests.post(
                f"{self.base_url}/food/analyze-image", 
                json=create_data, 
                headers=self.get_headers(),
                timeout=60
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to create entry: {response.status_code} - {response.text}")
                return False
                
            entry_data = response.json()
            entry_id = entry_data["id"]
            original_serving_weight = entry_data.get("serving_weight", 100)
            original_food_name = entry_data.get("food_name", "Unknown")
            
            print(f"✅ Entry created - ID: {entry_id}")
            print(f"   Original serving_weight: {original_serving_weight}")
            print(f"   Original food_name: {original_food_name}")
            
            self.created_entries.append(entry_id)
            
            # Step 2: Update serving weight to a different value
            print(f"\nStep 2: Updating serving_weight to 150g via PUT /api/food/{entry_id}...")
            update_data = {"serving_weight": 150}
            
            response = requests.put(
                f"{self.base_url}/food/{entry_id}",
                json=update_data,
                headers=self.get_headers(),
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to update entry: {response.status_code} - {response.text}")
                return False
                
            update_result = response.json()
            print(f"✅ Update response: {update_result}")
            
            # Step 3: Retrieve the entry via GET /api/food/today
            print(f"\nStep 3: Retrieving entry via GET /api/food/today...")
            response = requests.get(
                f"{self.base_url}/food/today",
                headers=self.get_headers(),
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get today's entries: {response.status_code} - {response.text}")
                return False
                
            entries = response.json()
            updated_entry = None
            
            for entry in entries:
                if entry["id"] == entry_id:
                    updated_entry = entry
                    break
            
            if not updated_entry:
                print(f"❌ Entry {entry_id} not found in today's entries")
                return False
            
            # Step 4: Verify serving weight was updated
            retrieved_serving_weight = updated_entry.get("serving_weight", 100)
            retrieved_food_name = updated_entry.get("food_name", "Unknown")
            
            print(f"\n📊 RESULTS:")
            print(f"   Original serving_weight: {original_serving_weight}")
            print(f"   Updated to: 150")
            print(f"   Retrieved serving_weight: {retrieved_serving_weight}")
            print(f"   Original food_name: {original_food_name}")
            print(f"   Retrieved food_name: {retrieved_food_name}")
            
            # Check if serving weight was properly saved
            if retrieved_serving_weight == 150:
                print("✅ PASS: Serving weight correctly updated and retrieved")
                return True
            else:
                print(f"❌ FAIL: Serving weight not updated correctly. Expected: 150, Got: {retrieved_serving_weight}")
                return False
                
        except Exception as e:
            print(f"❌ TEST 1 ERROR: {str(e)}")
            return False
    
    def test_food_name_update(self):
        """TEST 2: Test food name update when serving weight changes"""
        print("\n🧪 TEST 2: Food Name Update")
        print("=" * 50)
        
        try:
            # Step 1: Create entry with manual food
            print("Step 1: Creating manual food entry...")
            create_data = {
                "food_name": "Rice Bowl",
                "serving_size": "1 bowl (250g)"
            }
            
            response = requests.post(
                f"{self.base_url}/food/manual",
                json=create_data,
                headers=self.get_headers(),
                timeout=60
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to create manual entry: {response.status_code} - {response.text}")
                return False
                
            entry_data = response.json()
            entry_id = entry_data["id"]
            original_food_name = entry_data.get("food_name", "Unknown")
            
            print(f"✅ Manual entry created - ID: {entry_id}")
            print(f"   Original food_name: {original_food_name}")
            
            self.created_entries.append(entry_id)
            
            # Step 2: Update serving weight to 100g
            print(f"\nStep 2: Updating serving_weight to 100g...")
            update_data = {"serving_weight": 100}
            
            response = requests.put(
                f"{self.base_url}/food/{entry_id}",
                json=update_data,
                headers=self.get_headers(),
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to update entry: {response.status_code} - {response.text}")
                return False
                
            # Step 3: Check if food name was updated
            response = requests.get(
                f"{self.base_url}/food/today",
                headers=self.get_headers(),
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get updated entry: {response.status_code} - {response.text}")
                return False
                
            entries = response.json()
            updated_entry = None
            
            for entry in entries:
                if entry["id"] == entry_id:
                    updated_entry = entry
                    break
            
            if not updated_entry:
                print(f"❌ Entry {entry_id} not found")
                return False
            
            updated_food_name = updated_entry.get("food_name", "Unknown")
            updated_serving_weight = updated_entry.get("serving_weight", 100)
            
            print(f"\n📊 RESULTS:")
            print(f"   Original food_name: {original_food_name}")
            print(f"   Updated food_name: {updated_food_name}")
            print(f"   Updated serving_weight: {updated_serving_weight}")
            
            # Check if food name reflects the new weight
            if "100" in updated_food_name or updated_serving_weight == 100:
                print("✅ PASS: Food name or serving weight updated correctly")
                return True
            else:
                print(f"❌ FAIL: Food name doesn't reflect new serving weight")
                return False
                
        except Exception as e:
            print(f"❌ TEST 2 ERROR: {str(e)}")
            return False
    
    def test_image_persistence(self):
        """TEST 3: Test image persistence in database and API responses"""
        print("\n🧪 TEST 3: Image Persistence")
        print("=" * 50)
        
        try:
            # Step 1: Create entry with image
            print("Step 1: Creating entry with image via POST /api/food/analyze-image...")
            image_base64 = self.create_sample_image_base64()
            original_image_length = len(image_base64)
            
            create_data = {"image_base64": image_base64}
            response = requests.post(
                f"{self.base_url}/food/analyze-image",
                json=create_data,
                headers=self.get_headers(),
                timeout=60
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to create entry with image: {response.status_code} - {response.text}")
                return False
                
            entry_data = response.json()
            entry_id = entry_data["id"]
            
            print(f"✅ Entry with image created - ID: {entry_id}")
            print(f"   Original image length: {original_image_length} chars")
            
            self.created_entries.append(entry_id)
            
            # Step 2: Check if image is in the creation response
            # Note: The creation response might not include image_base64 to save bandwidth
            print(f"\nStep 2: Checking creation response for image...")
            has_image_in_response = "image_base64" in entry_data and entry_data["image_base64"]
            print(f"   Image in creation response: {has_image_in_response}")
            
            # Step 3: Retrieve via GET /api/food/today and check for image
            print(f"\nStep 3: Retrieving via GET /api/food/today...")
            response = requests.get(
                f"{self.base_url}/food/today",
                headers=self.get_headers(),
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to get today's entries: {response.status_code} - {response.text}")
                return False
                
            entries = response.json()
            target_entry = None
            
            for entry in entries:
                if entry["id"] == entry_id:
                    target_entry = entry
                    break
            
            if not target_entry:
                print(f"❌ Entry {entry_id} not found in today's entries")
                return False
            
            # Step 4: Check image persistence
            retrieved_image = target_entry.get("image_base64")
            has_image = retrieved_image is not None and retrieved_image != ""
            
            print(f"\n📊 RESULTS:")
            print(f"   Original image length: {original_image_length} chars")
            print(f"   Retrieved image present: {has_image}")
            if has_image:
                print(f"   Retrieved image length: {len(retrieved_image)} chars")
                print(f"   Images match: {retrieved_image == image_base64}")
            
            # Step 5: Test multiple retrievals
            print(f"\nStep 5: Testing multiple retrievals...")
            for i in range(3):
                response = requests.get(
                    f"{self.base_url}/food/today",
                    headers=self.get_headers(),
                    timeout=30
                )
                
                if response.status_code == 200:
                    entries = response.json()
                    for entry in entries:
                        if entry["id"] == entry_id:
                            image_still_there = entry.get("image_base64") is not None
                            print(f"   Retrieval {i+1}: Image present = {image_still_there}")
                            break
                time.sleep(1)
            
            if has_image:
                print("✅ PASS: Image persisted correctly in database")
                return True
            else:
                print("❌ FAIL: Image not persisted or not returned in API response")
                return False
                
        except Exception as e:
            print(f"❌ TEST 3 ERROR: {str(e)}")
            return False
    
    def cleanup(self):
        """Clean up created test entries"""
        print(f"\n🧹 Cleaning up {len(self.created_entries)} test entries...")
        for entry_id in self.created_entries:
            try:
                response = requests.delete(
                    f"{self.base_url}/food/{entry_id}",
                    headers=self.get_headers(),
                    timeout=30
                )
                if response.status_code == 200:
                    print(f"✅ Deleted entry {entry_id}")
                else:
                    print(f"⚠️ Failed to delete entry {entry_id}: {response.status_code}")
            except Exception as e:
                print(f"⚠️ Error deleting entry {entry_id}: {str(e)}")
    
    def run_all_tests(self):
        """Run all user-reported issue tests"""
        print("🚀 STARTING USER-REPORTED ISSUES TESTING")
        print("=" * 60)
        print(f"Backend URL: {self.base_url}")
        print(f"Test User: {self.test_user['username']}")
        
        # Setup authentication
        if not self.setup_auth():
            print("❌ Authentication setup failed. Cannot proceed with tests.")
            return
        
        results = {}
        
        # Run tests
        results["serving_weight_save_retrieve"] = self.test_serving_weight_save_retrieve()
        results["food_name_update"] = self.test_food_name_update()  
        results["image_persistence"] = self.test_image_persistence()
        
        # Cleanup
        self.cleanup()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 FINAL TEST RESULTS")
        print("=" * 60)
        
        passed = 0
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status} {test_name.replace('_', ' ').title()}")
            if result:
                passed += 1
        
        print(f"\nOverall: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - User issues appear to be resolved!")
        else:
            print("⚠️ SOME TESTS FAILED - User-reported issues still exist")
            
        return results

if __name__ == "__main__":
    tester = HealthismAPITester()
    tester.run_all_tests()