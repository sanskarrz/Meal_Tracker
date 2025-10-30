#!/usr/bin/env python3
"""
Debug the food name update issue
"""

import requests
import json
import time

BASE_URL = "https://nutritrack-plus-1.preview.emergentagent.com/api"

class FoodNameDebugger:
    def __init__(self):
        self.token = None
        self.test_user = {
            "username": f"debugtest_{int(time.time())}",
            "email": f"debugtest_{int(time.time())}@example.com", 
            "password": "testpass123"
        }
        
    def setup_auth(self):
        """Register and login to get auth token"""
        register_data = {
            "username": self.test_user["username"],
            "email": self.test_user["email"],
            "password": self.test_user["password"],
            "daily_calorie_goal": 2000
        }
        
        try:
            response = requests.post(f"{BASE_URL}/auth/register", json=register_data, timeout=30)
            if response.status_code == 200:
                self.token = response.json()["access_token"]
                print(f"✅ User registered: {self.test_user['username']}")
                return True
            else:
                print(f"❌ Registration failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Auth setup failed: {str(e)}")
            return False
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def debug_food_name_issue(self):
        """Debug the exact food name update issue"""
        print("🔍 DEBUGGING FOOD NAME UPDATE ISSUE")
        print("=" * 50)
        
        try:
            # Step 1: Create entry
            print("Step 1: Creating Rice Bowl entry...")
            create_data = {
                "food_name": "Rice Bowl",
                "serving_size": "1 large bowl (250g)"
            }
            
            response = requests.post(f"{BASE_URL}/food/manual", json=create_data, headers=self.get_headers(), timeout=60)
            
            if response.status_code != 200:
                print(f"❌ Failed to create entry: {response.status_code} - {response.text}")
                return False
                
            entry_data = response.json()
            entry_id = entry_data["id"]
            
            print(f"✅ Entry created - ID: {entry_id}")
            print(f"   food_name: '{entry_data.get('food_name', 'N/A')}'")
            print(f"   serving_size: '{entry_data.get('serving_size', 'N/A')}'")
            print(f"   serving_weight: {entry_data.get('serving_weight', 'N/A')}")
            
            # Step 2: Get the entry to see current state
            print(f"\nStep 2: Getting current entry state...")
            response = requests.get(f"{BASE_URL}/food/today", headers=self.get_headers(), timeout=30)
            
            if response.status_code == 200:
                entries = response.json()
                for entry in entries:
                    if entry["id"] == entry_id:
                        print(f"   Current food_name: '{entry.get('food_name', 'N/A')}'")
                        print(f"   Current serving_size: '{entry.get('serving_size', 'N/A')}'")
                        print(f"   Current serving_weight: {entry.get('serving_weight', 'N/A')}")
                        break
            
            # Step 3: Update ONLY serving_weight (this is where the bug occurs)
            print(f"\nStep 3: Updating ONLY serving_weight to 100...")
            update_data = {"serving_weight": 100}
            
            response = requests.put(f"{BASE_URL}/food/{entry_id}", json=update_data, headers=self.get_headers(), timeout=30)
            
            if response.status_code != 200:
                print(f"❌ Failed to update: {response.status_code} - {response.text}")
                return False
                
            update_result = response.json()
            print(f"✅ Update response:")
            print(json.dumps(update_result, indent=2))
            
            # Step 4: Check the updated entry
            print(f"\nStep 4: Checking updated entry...")
            response = requests.get(f"{BASE_URL}/food/today", headers=self.get_headers(), timeout=30)
            
            if response.status_code == 200:
                entries = response.json()
                for entry in entries:
                    if entry["id"] == entry_id:
                        print(f"📊 FINAL STATE:")
                        print(f"   food_name: '{entry.get('food_name', 'N/A')}'")
                        print(f"   serving_size: '{entry.get('serving_size', 'N/A')}'")
                        print(f"   serving_weight: {entry.get('serving_weight', 'N/A')}")
                        
                        # Analyze the issue
                        food_name = entry.get('food_name', '')
                        serving_size = entry.get('serving_size', '')
                        serving_weight = entry.get('serving_weight', 0)
                        
                        print(f"\n🔍 ISSUE ANALYSIS:")
                        print(f"   Food name contains '250': {'250' in food_name}")
                        print(f"   Food name contains '100': {'100' in food_name}")
                        print(f"   Serving size contains '250': {'250' in serving_size}")
                        print(f"   Serving size contains '100': {'100' in serving_size}")
                        print(f"   Actual serving_weight: {serving_weight}")
                        
                        if '250' in food_name and serving_weight == 100:
                            print(f"\n❌ BUG CONFIRMED: Food name still shows 250g but serving_weight is 100g")
                            print(f"   Root cause: When only serving_weight is updated, the code uses")
                            print(f"   the existing serving_size ('{serving_size}') which still contains 250g")
                            return False
                        else:
                            print(f"\n✅ Issue resolved or not reproduced")
                            return True
                        break
            
            # Cleanup
            requests.delete(f"{BASE_URL}/food/{entry_id}", headers=self.get_headers(), timeout=30)
            
        except Exception as e:
            print(f"❌ DEBUG ERROR: {str(e)}")
            return False

if __name__ == "__main__":
    debugger = FoodNameDebugger()
    if debugger.setup_auth():
        debugger.debug_food_name_issue()