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
        print(f"Request error for {method} {url}: {str(e)}")
        return None

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

def create_test_food_image_base64():
    """Create a realistic food image in base64 format for testing camera scanning"""
    # Create a minimal valid JPEG image (1x1 pixel) that represents food
    jpeg_bytes = bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
        0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
        0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
        0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0xB2, 0xC0,
        0x07, 0xFF, 0xD9
    ])
    return base64.b64encode(jpeg_bytes).decode('utf-8')

def test_camera_scanning_critical(token):
    """🚨 CRITICAL TEST: Camera Scanning with OpenAI Vision API"""
    print("\n=== 🚨 CRITICAL: Camera Scanning with OpenAI Vision API ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test the CRITICAL endpoint: POST /api/food/analyze-image
    print("🔍 Testing POST /api/food/analyze-image (CRITICAL CAMERA SCANNING ENDPOINT)...")
    
    # Create test image in the exact format expected by OpenAI Vision API
    test_image_b64 = create_test_food_image_base64()
    
    image_data = {"image_base64": test_image_b64}
    response = make_request("POST", "/food/analyze-image", image_data, headers, timeout=60)
    
    print(f"📊 Response Status: {response.status_code if response else 'No Response'}")
    print(f"📊 Response Headers: {dict(response.headers) if response else 'No Headers'}")
    
    if response and response.status_code == 200:
        data = response.json()
        print(f"📊 Full Response Data: {json.dumps(data, indent=2)}")
        
        # Verify CRITICAL fields for camera scanning
        critical_fields = ["food_name", "calories", "protein", "carbs", "fats", "confidence"]
        missing_fields = [field for field in critical_fields if field not in data]
        
        if missing_fields:
            log_test("camera_scanning", "critical_fields", "FAIL", f"❌ CRITICAL: Missing required fields: {missing_fields}")
            return None
        
        # Verify data types and reasonable values
        if not isinstance(data["calories"], (int, float)) or data["calories"] < 0:
            log_test("camera_scanning", "calories_validation", "FAIL", f"❌ CRITICAL: Invalid calories value: {data['calories']}")
            return None
        
        if data.get("confidence") not in ["high", "medium", "low"]:
            log_test("camera_scanning", "confidence_validation", "WARN", f"⚠️ Unexpected confidence value: {data.get('confidence')}")
        
        log_test("camera_scanning", "openai_vision_api", "PASS", f"✅ CRITICAL SUCCESS: Camera scanning working! Detected: {data['food_name']} ({data['calories']} cal, confidence: {data.get('confidence', 'unknown')})")
        
        # Check if entry was saved to database
        if "id" in data:
            log_test("camera_scanning", "database_save", "PASS", f"✅ Food entry saved to database with ID: {data['id']}")
            return data["id"]
        else:
            log_test("camera_scanning", "database_save", "FAIL", "❌ Food entry not saved to database")
            return None
            
    elif response and response.status_code == 500:
        error_text = response.text
        print(f"🚨 CRITICAL ERROR Response: {error_text}")
        
        if "OpenAI" in error_text or "API" in error_text:
            log_test("camera_scanning", "openai_api_error", "FAIL", f"❌ CRITICAL: OpenAI API Error: {error_text}")
        else:
            log_test("camera_scanning", "server_error", "FAIL", f"❌ CRITICAL: Server Error: {error_text}")
        return None
        
    else:
        log_test("camera_scanning", "endpoint_failure", "FAIL", f"❌ CRITICAL: Camera scanning endpoint failed: {response.status_code if response else 'No response'}")
        if response:
            print(f"🚨 Error Response Body: {response.text}")
        return None

def test_openai_integration_verification(token):
    """Verify OpenAI integration is working across all endpoints that use it"""
    print("\n=== 🔍 OpenAI Integration Verification ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: Text-only analysis (POST /api/food/search)
    print("Testing OpenAI integration via /api/food/search...")
    search_data = {"query": "grilled chicken breast"}
    response = make_request("POST", "/food/search", search_data, headers)
    
    if response and response.status_code == 200:
        data = response.json()
        if "food_name" in data and "calories" in data:
            log_test("openai_integration", "text_analysis", "PASS", f"✅ OpenAI text analysis working: {data['food_name']} - {data['calories']} cal")
        else:
            log_test("openai_integration", "text_analysis", "FAIL", f"❌ Invalid response structure: {data}")
    else:
        log_test("openai_integration", "text_analysis", "FAIL", f"❌ Text analysis failed: {response.status_code if response else 'No response'}")
    
    # Test 2: Manual food entry (POST /api/food/manual) 
    print("Testing OpenAI integration via /api/food/manual...")
    manual_data = {"food_name": "banana", "serving_size": "1 medium"}
    response = make_request("POST", "/food/manual", manual_data, headers)
    
    if response and response.status_code == 200:
        data = response.json()
        if "food_name" in data and "calories" in data:
            log_test("openai_integration", "manual_entry", "PASS", f"✅ OpenAI manual entry working: {data['food_name']} - {data['calories']} cal")
            return data["id"]
        else:
            log_test("openai_integration", "manual_entry", "FAIL", f"❌ Invalid manual entry response: {data}")
    else:
        log_test("openai_integration", "manual_entry", "FAIL", f"❌ Manual entry failed: {response.status_code if response else 'No response'}")
    
    return None

def test_error_handling_camera_scanning(token):
    """Test error handling for camera scanning edge cases"""
    print("\n=== 🔍 Camera Scanning Error Handling ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: Invalid base64 data
    print("Testing invalid base64 handling...")
    invalid_data = {"image_base64": "invalid_base64_data_not_an_image"}
    response = make_request("POST", "/food/analyze-image", invalid_data, headers)
    
    if response and response.status_code >= 400:
        log_test("error_handling", "invalid_base64", "PASS", f"✅ Invalid base64 properly rejected: {response.status_code}")
    else:
        log_test("error_handling", "invalid_base64", "FAIL", f"❌ Invalid base64 not properly handled: {response.status_code if response else 'No response'}")
    
    # Test 2: Empty image data
    print("Testing empty image data handling...")
    empty_data = {"image_base64": ""}
    response = make_request("POST", "/food/analyze-image", empty_data, headers)
    
    if response and response.status_code >= 400:
        log_test("error_handling", "empty_image", "PASS", f"✅ Empty image properly rejected: {response.status_code}")
    else:
        log_test("error_handling", "empty_image", "FAIL", f"❌ Empty image not properly handled: {response.status_code if response else 'No response'}")
    
    # Test 3: Missing image_base64 field
    print("Testing missing image field handling...")
    missing_field_data = {"wrong_field": "some_data"}
    response = make_request("POST", "/food/analyze-image", missing_field_data, headers)
    
    if response and response.status_code >= 400:
        log_test("error_handling", "missing_field", "PASS", f"✅ Missing field properly rejected: {response.status_code}")
    else:
        log_test("error_handling", "missing_field", "FAIL", f"❌ Missing field not properly handled: {response.status_code if response else 'No response'}")

def check_backend_logs_for_openai():
    """Check backend logs for OpenAI debug messages and errors"""
    print("\n=== 🔍 Backend Logs Analysis ===")
    
    try:
        # Check backend output logs
        result = subprocess.run(
            ["tail", "-n", "100", "/var/log/supervisor/backend.out.log"],
            capture_output=True, text=True, timeout=10
        )
        
        if result.returncode == 0:
            logs = result.stdout
            if "OpenAI Response:" in logs:
                log_test("backend_logs", "openai_debug_messages", "PASS", "✅ Found OpenAI debug messages in backend logs")
            else:
                log_test("backend_logs", "openai_debug_messages", "WARN", "⚠️ No OpenAI debug messages found in recent logs")
        
        # Check backend error logs
        result = subprocess.run(
            ["tail", "-n", "100", "/var/log/supervisor/backend.err.log"],
            capture_output=True, text=True, timeout=10
        )
        
        if result.returncode == 0:
            error_logs = result.stdout
            if "OpenAI" in error_logs or "API" in error_logs:
                if "error" in error_logs.lower() or "fail" in error_logs.lower():
                    log_test("backend_logs", "openai_errors", "FAIL", f"❌ Found OpenAI errors in logs: {error_logs[-200:]}")
                else:
                    log_test("backend_logs", "openai_activity", "PASS", "✅ Found OpenAI activity in logs")
            else:
                log_test("backend_logs", "no_openai_errors", "PASS", "✅ No OpenAI errors found in error logs")
                
    except Exception as e:
        log_test("backend_logs", "log_check_error", "WARN", f"⚠️ Could not check logs: {str(e)}")

def test_authentication_enforcement_camera(token):
    """Test that camera scanning properly requires authentication"""
    print("\n=== 🔍 Authentication Enforcement for Camera Scanning ===")
    
    # Test without authentication
    print("Testing camera scanning without authentication...")
    test_image_b64 = create_test_food_image_base64()
    image_data = {"image_base64": test_image_b64}
    
    # Make request without Authorization header
    response = make_request("POST", "/food/analyze-image", image_data, headers=None)
    
    if response and response.status_code == 401:
        log_test("authentication", "camera_auth_required", "PASS", "✅ Camera scanning properly requires authentication")
    elif response and response.status_code == 403:
        log_test("authentication", "camera_auth_required", "PASS", "✅ Camera scanning properly requires authentication (403)")
    else:
        log_test("authentication", "camera_auth_required", "FAIL", f"❌ Camera scanning should require auth, got: {response.status_code if response else 'No response'}")

def test_food_analysis(token):
    """Test camera scanning and related OpenAI-powered features"""
    print("\n=== 🚨 FOCUSED: Camera Scanning & OpenAI Integration Testing ===")
    
    # CRITICAL: Test camera scanning with OpenAI Vision API
    camera_entry_id = test_camera_scanning_critical(token)
    
    # Test OpenAI integration across endpoints
    manual_entry_id = test_openai_integration_verification(token)
    
    # Test error handling for camera scanning
    test_error_handling_camera_scanning(token)
    
    # Test authentication enforcement
    test_authentication_enforcement_camera(token)
    
    # Check backend logs for OpenAI activity
    check_backend_logs_for_openai()
    
    return camera_entry_id, manual_entry_id, None

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
    """Run FOCUSED camera scanning tests with OpenAI Vision API"""
    print("🚨 CRITICAL: Camera Scanning with OpenAI Vision API Testing")
    print("="*80)
    print("Focus: Testing the switch from emergentintegrations to official OpenAI SDK")
    print("Critical Endpoint: POST /api/food/analyze-image")
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
    
    print(f"✅ Authentication successful. Token obtained.")
    
    # MAIN FOCUS: Test camera scanning and OpenAI integration
    print("\n🎯 STARTING CRITICAL CAMERA SCANNING TESTS...")
    entry_ids = test_food_analysis(token)
    
    # Quick verification of other endpoints that also use OpenAI
    print("\n🔍 VERIFYING OTHER OPENAI-POWERED ENDPOINTS...")
    test_food_search_endpoint(token)
    
    # Print focused summary
    print_camera_scanning_summary()
    
    # Save results to file
    with open("/app/camera_test_results.json", "w") as f:
        json.dump(test_results, f, indent=2, default=str)
    
    print(f"\n📊 Camera scanning test results saved to: /app/camera_test_results.json")

def print_camera_scanning_summary():
    """Print focused summary for camera scanning tests"""
    print("\n" + "="*80)
    print("🚨 CAMERA SCANNING TEST RESULTS SUMMARY")
    print("="*80)
    
    # Focus on camera scanning results
    camera_tests = test_results.get("camera_scanning", {})
    openai_tests = test_results.get("openai_integration", {})
    error_tests = test_results.get("error_handling", {})
    auth_tests = test_results.get("authentication", {})
    log_tests = test_results.get("backend_logs", {})
    
    print("\n🎯 CRITICAL CAMERA SCANNING RESULTS:")
    print("-" * 50)
    
    critical_success = False
    for test_name, result in camera_tests.items():
        status = result["status"]
        details = result["details"]
        
        if status == "PASS":
            print(f"  ✅ {test_name}: {details}")
            if test_name == "openai_vision_api":
                critical_success = True
        elif status == "FAIL":
            print(f"  ❌ {test_name}: {details}")
        else:
            print(f"  ⚠️  {test_name}: {details}")
    
    print("\n🔍 OPENAI INTEGRATION RESULTS:")
    print("-" * 40)
    for test_name, result in openai_tests.items():
        status = result["status"]
        details = result["details"]
        
        if status == "PASS":
            print(f"  ✅ {test_name}: {details}")
        elif status == "FAIL":
            print(f"  ❌ {test_name}: {details}")
        else:
            print(f"  ⚠️  {test_name}: {details}")
    
    print("\n🛡️ ERROR HANDLING & SECURITY:")
    print("-" * 40)
    for test_name, result in {**error_tests, **auth_tests}.items():
        status = result["status"]
        details = result["details"]
        
        if status == "PASS":
            print(f"  ✅ {test_name}: {details}")
        elif status == "FAIL":
            print(f"  ❌ {test_name}: {details}")
        else:
            print(f"  ⚠️  {test_name}: {details}")
    
    print("\n📋 BACKEND LOGS:")
    print("-" * 20)
    for test_name, result in log_tests.items():
        status = result["status"]
        details = result["details"]
        
        if status == "PASS":
            print(f"  ✅ {test_name}: {details}")
        elif status == "FAIL":
            print(f"  ❌ {test_name}: {details}")
        else:
            print(f"  ⚠️  {test_name}: {details}")
    
    print(f"\n{'='*80}")
    print("🎯 FINAL VERDICT:")
    
    if critical_success:
        print("🎉 ✅ CAMERA SCANNING WITH OPENAI VISION API IS WORKING!")
        print("✅ The switch from emergentintegrations to OpenAI SDK was successful!")
        test_results["overall_status"] = "CAMERA_SCANNING_SUCCESS"
    else:
        print("🚨 ❌ CAMERA SCANNING WITH OPENAI VISION API IS NOT WORKING!")
        print("❌ The camera scanning functionality needs further investigation!")
        test_results["overall_status"] = "CAMERA_SCANNING_FAILED"
    
    print("="*80)

if __name__ == "__main__":
    main()