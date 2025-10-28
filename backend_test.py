#!/usr/bin/env python3
"""
FOCUSED Backend Testing for Camera Scanning with OpenAI Vision API
Testing the critical camera scanning functionality that was switched from emergentintegrations to OpenAI SDK
"""

import requests
import json
import base64
import time
from datetime import datetime, timedelta
import sys
import subprocess

# Configuration
BASE_URL = "https://nutritrack-plus-1.preview.emergentagent.com/api"
TEST_USER = {
    "username": f"cameratest_{int(time.time())}",
    "email": f"cameratest_{int(time.time())}@example.com", 
    "password": "SecurePass123!",
    "daily_calorie_goal": 2200
}

# Test results storage
test_results = {
    "authentication": {},
    "food_analysis": {},
    "food_history": {},
    "food_management": {},
    "gemini_integration": {},
    "overall_status": "UNKNOWN"
}

def log_test(category, test_name, status, details=""):
    """Log test results"""
    if category not in test_results:
        test_results[category] = {}
    test_results[category][test_name] = {
        "status": status,
        "details": details,
        "timestamp": datetime.now().isoformat()
    }
    print(f"[{status}] {category} - {test_name}: {details}")

def make_request(method, endpoint, data=None, headers=None, timeout=30):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=timeout)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=timeout)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, timeout=timeout)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response
    except requests.exceptions.RequestException as e:
        return None, str(e)

def test_health_check():
    """Test basic health endpoint"""
    print("\n=== Testing Health Check ===")
    response = make_request("GET", "/health")
    
    if response is None:
        log_test("basic", "health_check", "FAIL", "Cannot connect to backend server")
        return False
    
    if response.status_code == 200:
        data = response.json()
        if data.get("status") == "healthy":
            log_test("basic", "health_check", "PASS", "Backend server is healthy")
            return True
        else:
            log_test("basic", "health_check", "FAIL", f"Unexpected health response: {data}")
            return False
    else:
        log_test("basic", "health_check", "FAIL", f"Health check failed with status {response.status_code}")
        return False

def test_authentication():
    """Test complete authentication flow"""
    print("\n=== Testing Authentication Flow ===")
    
    # Test user registration
    print("Testing user registration...")
    response = make_request("POST", "/auth/register", TEST_USER)
    
    if response is None:
        log_test("authentication", "register", "FAIL", "Cannot connect to registration endpoint")
        return None
    
    if response.status_code == 200:
        data = response.json()
        if "access_token" in data and "token_type" in data:
            log_test("authentication", "register", "PASS", "User registration successful")
            token = data["access_token"]
        else:
            log_test("authentication", "register", "FAIL", f"Invalid registration response: {data}")
            return None
    elif response.status_code == 400 and "already registered" in response.text:
        log_test("authentication", "register", "PASS", "User already exists (expected)")
        # Try login instead
        response = make_request("POST", "/auth/login", {
            "username": TEST_USER["username"],
            "password": TEST_USER["password"]
        })
        if response and response.status_code == 200:
            token = response.json()["access_token"]
        else:
            log_test("authentication", "login_fallback", "FAIL", "Cannot login with existing user")
            return None
    else:
        log_test("authentication", "register", "FAIL", f"Registration failed: {response.status_code} - {response.text}")
        return None
    
    # Test login
    print("Testing user login...")
    login_data = {
        "username": TEST_USER["username"],
        "password": TEST_USER["password"]
    }
    response = make_request("POST", "/auth/login", login_data)
    
    if response and response.status_code == 200:
        data = response.json()
        if "access_token" in data:
            log_test("authentication", "login", "PASS", "Login successful")
            token = data["access_token"]
        else:
            log_test("authentication", "login", "FAIL", f"Invalid login response: {data}")
            return None
    else:
        log_test("authentication", "login", "FAIL", f"Login failed: {response.status_code if response else 'No response'}")
        return None
    
    # Test token validation
    print("Testing token validation...")
    headers = {"Authorization": f"Bearer {token}"}
    response = make_request("GET", "/auth/me", headers=headers)
    
    if response and response.status_code == 200:
        data = response.json()
        if data.get("username") == TEST_USER["username"]:
            log_test("authentication", "token_validation", "PASS", "Token validation successful")
        else:
            log_test("authentication", "token_validation", "FAIL", f"Token validation returned wrong user: {data}")
    else:
        log_test("authentication", "token_validation", "FAIL", f"Token validation failed: {response.status_code if response else 'No response'}")
        return None
    
    # Test protected endpoint access
    print("Testing protected endpoint access...")
    response = make_request("GET", "/food/today", headers=headers)
    
    if response and response.status_code == 200:
        log_test("authentication", "protected_access", "PASS", "Protected endpoint accessible with valid token")
    else:
        log_test("authentication", "protected_access", "FAIL", f"Cannot access protected endpoint: {response.status_code if response else 'No response'}")
    
    return token

def test_food_search_endpoint(token):
    """Test food search endpoint for quick search feature"""
    print("\n=== Testing Food Search Endpoint (Quick Search Feature) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test search with "apple"
    print("Testing food search with 'apple'...")
    search_data = {"query": "apple"}
    response = make_request("POST", "/food/search", search_data, headers)
    
    if response and response.status_code == 200:
        data = response.json()
        required_fields = ["food_name", "calories", "protein", "carbs", "fats"]
        if all(field in data for field in required_fields):
            log_test("food_search", "apple_search", "PASS", f"Apple search: {data['food_name']} - {data['calories']} cal, P:{data['protein']}g, C:{data['carbs']}g, F:{data['fats']}g")
        else:
            missing = [f for f in required_fields if f not in data]
            log_test("food_search", "apple_search", "FAIL", f"Missing fields: {missing}")
    else:
        log_test("food_search", "apple_search", "FAIL", f"Apple search failed: {response.status_code if response else 'No response'}")
    
    # Test search with "chicken breast"
    print("Testing food search with 'chicken breast'...")
    search_data = {"query": "chicken breast"}
    response = make_request("POST", "/food/search", search_data, headers)
    
    if response and response.status_code == 200:
        data = response.json()
        required_fields = ["food_name", "calories", "protein", "carbs", "fats"]
        if all(field in data for field in required_fields):
            log_test("food_search", "chicken_search", "PASS", f"Chicken search: {data['food_name']} - {data['calories']} cal, P:{data['protein']}g, C:{data['carbs']}g, F:{data['fats']}g")
        else:
            missing = [f for f in required_fields if f not in data]
            log_test("food_search", "chicken_search", "FAIL", f"Missing fields: {missing}")
    else:
        log_test("food_search", "chicken_search", "FAIL", f"Chicken search failed: {response.status_code if response else 'No response'}")
    
    # Test search with empty query
    print("Testing food search with empty query...")
    search_data = {"query": ""}
    response = make_request("POST", "/food/search", search_data, headers)
    
    if response:
        if response.status_code in [200, 400]:
            log_test("food_search", "empty_query", "PASS", f"Empty query handled gracefully: {response.status_code}")
        else:
            log_test("food_search", "empty_query", "FAIL", f"Unexpected status for empty query: {response.status_code}")
    else:
        log_test("food_search", "empty_query", "FAIL", "No response for empty query")
    
    # Test authentication requirement
    print("Testing food search without authentication...")
    response = make_request("POST", "/food/search", {"query": "banana"})
    
    if response and response.status_code == 401:
        log_test("food_search", "auth_required", "PASS", "Correctly requires authentication")
    else:
        log_test("food_search", "auth_required", "FAIL", f"Should require auth, got: {response.status_code if response else 'No response'}")

def test_food_analysis(token):
    """Test food analysis features"""
    print("\n=== Testing Food Analysis Features ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test manual food entry
    print("Testing manual food entry...")
    manual_food_data = {"food_name": "grilled chicken breast", "serving_size": "150g"}
    response = make_request("POST", "/food/manual", manual_food_data, headers)
    
    if response and response.status_code == 200:
        data = response.json()
        if "id" in data and "calories" in data and "food_name" in data:
            log_test("food_analysis", "manual_entry", "PASS", f"Manual food entry successful: {data['food_name']} - {data['calories']} calories")
            manual_entry_id = data["id"]
        else:
            log_test("food_analysis", "manual_entry", "FAIL", f"Invalid manual entry response: {data}")
            manual_entry_id = None
    else:
        log_test("food_analysis", "manual_entry", "FAIL", f"Manual food entry failed: {response.status_code if response else 'No response'}")
        manual_entry_id = None
    
    # Test recipe analysis
    print("Testing recipe analysis...")
    recipe_data = {
        "recipe_text": "2 cups cooked quinoa, 1 cup black beans, 1 avocado diced, 2 tbsp olive oil, salt and pepper to taste"
    }
    response = make_request("POST", "/food/analyze-recipe", recipe_data, headers)
    
    if response and response.status_code == 200:
        data = response.json()
        if "id" in data and "calories" in data:
            log_test("food_analysis", "recipe_analysis", "PASS", f"Recipe analysis successful: {data.get('food_name', 'Recipe')} - {data['calories']} calories")
            recipe_entry_id = data["id"]
        else:
            log_test("food_analysis", "recipe_analysis", "FAIL", f"Invalid recipe analysis response: {data}")
            recipe_entry_id = None
    else:
        log_test("food_analysis", "recipe_analysis", "FAIL", f"Recipe analysis failed: {response.status_code if response else 'No response'}")
        recipe_entry_id = None
    
    # Test image analysis (with sample base64 image)
    print("Testing image analysis...")
    # Create a small sample base64 image (1x1 pixel PNG)
    sample_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    
    image_data = {"image_base64": sample_image_b64}
    response = make_request("POST", "/food/analyze-image", image_data, headers)
    
    if response and response.status_code == 200:
        data = response.json()
        if "id" in data and "calories" in data:
            log_test("food_analysis", "image_analysis", "PASS", f"Image analysis successful: {data.get('food_name', 'Unknown')} - {data['calories']} calories")
            image_entry_id = data["id"]
        else:
            log_test("food_analysis", "image_analysis", "FAIL", f"Invalid image analysis response: {data}")
            image_entry_id = None
    else:
        log_test("food_analysis", "image_analysis", "FAIL", f"Image analysis failed: {response.status_code if response else 'No response'}")
        image_entry_id = None
    
    return manual_entry_id, recipe_entry_id, image_entry_id

def test_food_history(token):
    """Test food history and stats endpoints"""
    print("\n=== Testing Food History & Stats ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test getting today's entries
    print("Testing today's entries...")
    response = make_request("GET", "/food/today", headers=headers)
    
    if response and response.status_code == 200:
        data = response.json()
        if isinstance(data, list):
            log_test("food_history", "today_entries", "PASS", f"Retrieved {len(data)} entries for today")
            today_entries = data
        else:
            log_test("food_history", "today_entries", "FAIL", f"Invalid today entries response: {data}")
            today_entries = []
    else:
        log_test("food_history", "today_entries", "FAIL", f"Failed to get today's entries: {response.status_code if response else 'No response'}")
        today_entries = []
    
    # Test daily stats
    print("Testing daily stats...")
    response = make_request("GET", "/stats/daily", headers=headers)
    
    if response and response.status_code == 200:
        data = response.json()
        required_fields = ["date", "total_calories", "total_protein", "total_carbs", "total_fats", "entries_count", "daily_goal"]
        if all(field in data for field in required_fields):
            log_test("food_history", "daily_stats", "PASS", f"Daily stats: {data['total_calories']} calories, {data['entries_count']} entries")
        else:
            log_test("food_history", "daily_stats", "FAIL", f"Missing fields in daily stats: {data}")
    else:
        log_test("food_history", "daily_stats", "FAIL", f"Failed to get daily stats: {response.status_code if response else 'No response'}")
    
    # Test history for specific date
    print("Testing history for specific date...")
    test_date = datetime.now().strftime("%Y-%m-%d")
    response = make_request("GET", f"/food/history?date={test_date}", headers=headers)
    
    if response and response.status_code == 200:
        data = response.json()
        if isinstance(data, list):
            log_test("food_history", "date_history", "PASS", f"Retrieved {len(data)} entries for {test_date}")
        else:
            log_test("food_history", "date_history", "FAIL", f"Invalid date history response: {data}")
    else:
        log_test("food_history", "date_history", "FAIL", f"Failed to get date history: {response.status_code if response else 'No response'}")
    
    return today_entries

def test_food_management(token, entry_ids):
    """Test food entry management (delete)"""
    print("\n=== Testing Food Entry Management ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test deleting a food entry
    valid_entry_id = None
    for entry_id in entry_ids:
        if entry_id:
            valid_entry_id = entry_id
            break
    
    if valid_entry_id:
        print(f"Testing delete food entry: {valid_entry_id}")
        response = make_request("DELETE", f"/food/{valid_entry_id}", headers=headers)
        
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data:
                log_test("food_management", "delete_entry", "PASS", f"Successfully deleted entry: {data['message']}")
            else:
                log_test("food_management", "delete_entry", "PASS", "Entry deleted successfully")
        else:
            log_test("food_management", "delete_entry", "FAIL", f"Failed to delete entry: {response.status_code if response else 'No response'}")
    else:
        log_test("food_management", "delete_entry", "SKIP", "No valid entry ID available for deletion test")

def test_gemini_integration(token):
    """Test Gemini AI integration quality"""
    print("\n=== Testing Gemini AI Integration ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test with a well-known food
    print("Testing Gemini AI with well-known food...")
    test_foods = [
        {"name": "banana", "expected_calories_range": (80, 120)},
        {"name": "apple", "expected_calories_range": (70, 100)},
        {"name": "100g cooked rice", "expected_calories_range": (120, 150)}
    ]
    
    gemini_working = True
    for food in test_foods:
        food_data = {"food_name": food["name"]}
        response = make_request("POST", "/food/manual", food_data, headers)
        
        if response and response.status_code == 200:
            data = response.json()
            calories = data.get("calories", 0)
            min_cal, max_cal = food["expected_calories_range"]
            
            if min_cal <= calories <= max_cal:
                log_test("gemini_integration", f"nutrition_accuracy_{food['name']}", "PASS", 
                        f"{food['name']}: {calories} calories (within expected range {min_cal}-{max_cal})")
            else:
                log_test("gemini_integration", f"nutrition_accuracy_{food['name']}", "WARN", 
                        f"{food['name']}: {calories} calories (outside expected range {min_cal}-{max_cal})")
            
            # Check if nutrition data is provided
            if data.get("protein", 0) > 0 or data.get("carbs", 0) > 0 or data.get("fats", 0) > 0:
                log_test("gemini_integration", f"nutrition_completeness_{food['name']}", "PASS", 
                        f"Complete nutrition data: P:{data.get('protein', 0)}g C:{data.get('carbs', 0)}g F:{data.get('fats', 0)}g")
            else:
                log_test("gemini_integration", f"nutrition_completeness_{food['name']}", "WARN", 
                        "Missing detailed nutrition data")
        else:
            gemini_working = False
            log_test("gemini_integration", f"api_call_{food['name']}", "FAIL", 
                    f"Failed to analyze {food['name']}: {response.status_code if response else 'No response'}")
    
    if gemini_working:
        log_test("gemini_integration", "overall_status", "PASS", "Gemini AI integration is working")
    else:
        log_test("gemini_integration", "overall_status", "FAIL", "Gemini AI integration has issues")

def print_summary():
    """Print comprehensive test summary"""
    print("\n" + "="*80)
    print("COMPREHENSIVE TEST SUMMARY")
    print("="*80)
    
    total_tests = 0
    passed_tests = 0
    failed_tests = 0
    warnings = 0
    
    for category, tests in test_results.items():
        if category == "overall_status":
            continue
            
        print(f"\n{category.upper().replace('_', ' ')}:")
        print("-" * 40)
        
        for test_name, result in tests.items():
            status = result["status"]
            details = result["details"]
            
            total_tests += 1
            if status == "PASS":
                passed_tests += 1
                print(f"  ✅ {test_name}: {details}")
            elif status == "FAIL":
                failed_tests += 1
                print(f"  ❌ {test_name}: {details}")
            elif status == "WARN":
                warnings += 1
                print(f"  ⚠️  {test_name}: {details}")
            else:
                print(f"  ⏭️  {test_name}: {details}")
    
    print(f"\n{'='*80}")
    print(f"OVERALL RESULTS:")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {failed_tests}")
    print(f"Warnings: {warnings}")
    
    if failed_tests == 0:
        if warnings == 0:
            test_results["overall_status"] = "ALL_PASS"
            print(f"🎉 ALL TESTS PASSED!")
        else:
            test_results["overall_status"] = "PASS_WITH_WARNINGS"
            print(f"✅ TESTS PASSED WITH {warnings} WARNINGS")
    else:
        test_results["overall_status"] = "FAILED"
        print(f"❌ {failed_tests} TESTS FAILED")
    
    print("="*80)

def main():
    """Run all tests"""
    print("Starting Comprehensive Backend API Testing for Healthism Calorie Tracker")
    print("="*80)
    
    # Test health check first
    if not test_health_check():
        print("❌ Backend server is not accessible. Stopping tests.")
        return
    
    # Test authentication
    token = test_authentication()
    if not token:
        print("❌ Authentication failed. Cannot proceed with protected endpoint tests.")
        return
    
    # Test food search endpoint (focus of this testing session)
    test_food_search_endpoint(token)
    
    # Test food analysis features
    entry_ids = test_food_analysis(token)
    
    # Test food history and stats
    today_entries = test_food_history(token)
    
    # Test food management
    test_food_management(token, entry_ids)
    
    # Test Gemini AI integration
    test_gemini_integration(token)
    
    # Print comprehensive summary
    print_summary()
    
    # Save results to file
    with open("/app/test_results_detailed.json", "w") as f:
        json.dump(test_results, f, indent=2, default=str)
    
    print(f"\nDetailed results saved to: /app/test_results_detailed.json")

if __name__ == "__main__":
    main()