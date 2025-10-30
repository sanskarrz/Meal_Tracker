from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, date
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId
import os
from dotenv import load_dotenv
import base64
import asyncio

load_dotenv()

app = FastAPI(title="Healthism Calorie Tracker API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017/healthism_calorie_tracker")
client = MongoClient(MONGO_URL)
db = client.get_database()

# Collections
users_collection = db["users"]
food_entries_collection = db["food_entries"]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "43200"))

security = HTTPBearer()

# LLM Configuration
EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Pydantic Models
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    daily_calorie_goal: Optional[int] = 2000

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class FoodAnalysisRequest(BaseModel):
    image_base64: str

class ManualFoodRequest(BaseModel):
    food_name: str
    serving_size: Optional[str] = "1 serving"

class RecipeAnalysisRequest(BaseModel):
    recipe_text: str

class QuickSearchRequest(BaseModel):
    query: str

class FoodEntryResponse(BaseModel):
    id: str
    food_name: str
    calories: float
    protein: Optional[float] = 0
    carbs: Optional[float] = 0
    fats: Optional[float] = 0
    image_base64: Optional[str] = None
    entry_type: str
    timestamp: datetime
    date: str

class DailyStatsResponse(BaseModel):
    date: str
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fats: float
    entries_count: int
    daily_goal: int
    remaining_calories: float

# Helper Functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = users_collection.find_one({"username": username})
    if user is None:
        raise credentials_exception
    return user

async def analyze_food_with_gemini(image_base64: Optional[str] = None, text_query: Optional[str] = None) -> Dict[str, Any]:
    """Analyze food using OpenAI Vision API directly - optimized for Indian food items"""
    try:
        # Use OpenAI SDK directly with official API key
        from openai import AsyncOpenAI
        import re
        from PIL import Image
        import io
        
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        
        # Sanitize and validate base64 if provided
        if image_base64:
            print(f"📸 Received image base64. Original length: {len(image_base64)}")
            
            # Remove any data URI prefix if present
            if ',' in image_base64 and 'base64' in image_base64:
                image_base64 = image_base64.split(',')[1]
                print(f"   Removed data URI prefix. New length: {len(image_base64)}")
            
            # Remove any whitespace, newlines, and invalid characters
            cleaned_base64 = re.sub(r'[^A-Za-z0-9+/=]', '', image_base64)
            print(f"   After cleaning: {len(cleaned_base64)} chars")
            
            # Ensure proper base64 padding
            missing_padding = len(cleaned_base64) % 4
            if missing_padding:
                cleaned_base64 += '=' * (4 - missing_padding)
                print(f"   Added {4 - missing_padding} padding characters")
            
            # Validate base64 by trying to decode it and verify it's a valid image
            try:
                image_bytes = base64.b64decode(cleaned_base64)
                print(f"✅ Base64 decoded successfully. Image size: {len(image_bytes)} bytes")
                
                # Try to open the image with PIL to verify it's valid
                try:
                    img = Image.open(io.BytesIO(image_bytes))
                    print(f"✅ Valid image detected: {img.format} {img.size} {img.mode}")
                    
                    # Convert to JPEG if not already (OpenAI prefers JPEG)
                    if img.format != 'JPEG':
                        print(f"   Converting {img.format} to JPEG...")
                        buffer = io.BytesIO()
                        if img.mode in ('RGBA', 'LA', 'P'):
                            img = img.convert('RGB')
                        img.save(buffer, format='JPEG', quality=85)
                        image_bytes = buffer.getvalue()
                        cleaned_base64 = base64.b64encode(image_bytes).decode('utf-8')
                        print(f"   Converted to JPEG. New size: {len(image_bytes)} bytes")
                except Exception as img_error:
                    print(f"❌ Invalid image data: {str(img_error)}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid image format. Please try capturing the image again."
                    )
                    
            except Exception as e:
                print(f"❌ Base64 decode failed: {str(e)}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid base64 image data. Please try capturing the image again."
                )
            
            # Use the cleaned base64
            image_base64 = cleaned_base64
        
        system_message = """You are an ADVANCED nutrition AI expert specializing in Indian market products and South Asian cuisine.

🚫 CRITICAL FOOD VALIDATION (CHECK FIRST):
1. **ONLY analyze EDIBLE food items** - reject bottles, utensils, furniture, toys, electronics, etc.
2. **If image shows NON-FOOD item** - return error JSON: {"error": "not_food", "message": "This is not a food item"}
3. **Accept ONLY**: Packaged foods, cooked meals, fruits, vegetables, snacks, beverages (with calories)
4. **Reject**: Empty plates, water bottles, cooking utensils, phones, random objects

PRODUCT DETECTION INSTRUCTIONS:
1. **Read ALL visible text on packaging** - brand names, product names, weight/volume labels, MRP, nutritional panels
2. **Identify exact Indian market products** - Cadbury Dairy Milk 13g, Parle-G 100g, Britannia Marie 120g, etc.
3. **Extract serving size from packaging** - if you see "50g" or "250ml" printed, use that EXACT value
4. **Use Indian nutritional standards** - values must match what's sold in Indian market, not global variants
5. **Smart quantity detection** - analyze visual cues (plate size, hand reference, packaging size) to determine quantity

SERVING SIZE FORMAT (MANDATORY):
- Packaged foods: "Brand Product Name XXg" (e.g., "Cadbury Dairy Milk 45g", "Lay's Classic 52g")
- Multiple items: "X pieces (Yg each)" (e.g., "3 Parle-G biscuits (10g each)")
- Home-cooked: "X units (Yg/ml)" (e.g., "2 rotis (60g each)", "1 katori dal (150ml)")
- Fruits/vegetables: "1 medium item (Xg)" (e.g., "1 medium apple (150g)")

SERVING WEIGHT (MANDATORY):
Always provide total weight in grams as a separate field. This is the actual weight user is consuming.
Example: If "2 rotis (60g each)" → serving_weight = 120

NUTRITION VALUES:
- Must match Indian market standards (FSSAI approved values)
- For branded products, use values from Indian packaging
- For home-cooked food, use typical Indian recipes and ingredients
- Account for Indian cooking methods (ghee, oil quantities, spices)

Be EXTREMELY accurate with brand detection and serving sizes. Your goal is to be as precise as a nutrition label scanner."""
        
        # Prepare messages based on input type
        messages = [{"role": "system", "content": system_message}]
        
        if image_base64 and text_query:
            # Image + text query
            prompt = f"""{text_query}. 
            
            ANALYZE THE IMAGE CAREFULLY:
            - Read all text visible on packaging (brand, product name, weight, MRP)
            - Identify exact Indian market product if visible
            - Determine quantity from visual cues
            
            Return ONLY valid JSON: 
            {{
                "food_name": "Exact product name with brand and weight if packaged, otherwise descriptive name",
                "calories": number (as per Indian standards),
                "protein": number in grams,
                "carbs": number in grams,
                "fats": number in grams,
                "serving_size": "detailed serving description (e.g., 'Cadbury Dairy Milk 45g', '2 rotis (60g each)')",
                "serving_weight": number (total weight in grams),
                "confidence": "high/medium/low"
            }}
            
            Example:
            - Image shows 2 rotis → serving_weight: 120
            - Image shows Dairy Milk 45g → serving_weight: 45
            """
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            })
            
        elif image_base64:
            # Image only - camera scan
            prompt = """CAREFULLY ANALYZE THIS FOOD IMAGE:

STEP 1 - READ ALL TEXT:
- Look for brand names, product names, weight labels, MRP prices
- Check nutritional panels on packaging
- Identify any visible text that helps identify the exact product

STEP 2 - IDENTIFY PRODUCT:
- If packaged: Brand + Product + Exact Weight (e.g., "Cadbury Dairy Milk 45g", "Lay's Classic 52g")
- If home-cooked: Quantity + Item + Weight (e.g., "2 rotis (60g each)", "1 plate biryani (250g)")
- If fruits/vegetables: Quantity + Size + Weight (e.g., "1 medium apple (150g)")

STEP 3 - ESTIMATE QUANTITY:
- Look at visual cues: plate size, hand reference, packaging size
- Count visible items accurately
- Estimate weight based on standard Indian portions

STEP 4 - CALCULATE SERVING WEIGHT:
- Total weight in grams of what's visible
- If "2 rotis (60g each)" → serving_weight = 120
- If "Dairy Milk 45g" → serving_weight = 45

STEP 5 - PROVIDE INDIAN NUTRITION VALUES:
- Use FSSAI-approved values for branded products
- Use typical Indian recipes for home-cooked food
- Match values to what's sold in Indian market

Return ONLY valid JSON:
{{
    "food_name": "Exact product with brand and weight OR descriptive name with quantity",
    "calories": number (Indian standards),
    "protein": number in grams,
    "carbs": number in grams,
    "fats": number in grams,
    "serving_size": "detailed description (e.g., 'Cadbury Dairy Milk 45g', '2 rotis (60g each)', '1 bowl rice (150g)')",
    "serving_weight": number (total grams - MANDATORY),
    "confidence": "high/medium/low"
}}

CRITICAL: serving_weight must be the TOTAL weight in grams that the user is consuming."""
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            })
            
        else:
            # Text only
            prompt = f"""Provide accurate nutritional information for: {text_query}
            
            Use Indian market standards and FSSAI-approved values.
            
            Return ONLY valid JSON:
            {{
                "food_name": "specific name with brand and weight/variant if applicable",
                "calories": number (Indian standards),
                "protein": number in grams,
                "carbs": number in grams,
                "fats": number in grams,
                "serving_size": "specific measurement (e.g., '100g', '2 rotis (60g each)', '1 cup (150ml)')",
                "serving_weight": number (total weight in grams),
                "confidence": "high/medium/low"
            }}
            """
            messages.append({"role": "user", "content": prompt})
        
        # Call OpenAI API with gpt-4o (most reliable vision model)
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=500
        )
        
        # Parse JSON response
        import json
        import re
        
        response_text = response.choices[0].message.content
        print(f"OpenAI Response: {response_text}")  # Debug log
        
        if not response_text or response_text.strip() == "":
            print("❌ Empty response from OpenAI!")
            raise HTTPException(
                status_code=500,
                detail="AI returned empty response. Please try again."
            )
        
        # Try to extract JSON from response
        json_match = re.search(r'\{(?:[^{}]|\{[^{}]*\})*\}', response_text)
        if json_match:
            nutrition_data = json.loads(json_match.group())
            
            # Handle "not_food" error from OpenAI
            if nutrition_data.get("error") == "not_food":
                raise HTTPException(
                    status_code=400,
                    detail=nutrition_data.get("message", "This is not a food item. Please capture an image of food.")
                )
        else:
            # Fallback parsing if no JSON found
            nutrition_data = {
                "food_name": "Unknown Food (estimated)",
                "calories": 200,
                "protein": 10,
                "carbs": 20,
                "fats": 8,
                "serving_size": "1 serving (weight not specified)",
                "serving_weight": 100,
                "confidence": "low"
            }
        
        # Ensure serving_size is present and specific
        if "serving_size" not in nutrition_data or nutrition_data["serving_size"] == "1 serving":
            nutrition_data["serving_size"] = "1 serving (weight not specified)"
        
        # Ensure serving_weight is present (default to 100g if not provided)
        if "serving_weight" not in nutrition_data:
            # Try to extract from serving_size
            import re
            weight_match = re.search(r'(\d+)\s*g', nutrition_data.get("serving_size", ""))
            if weight_match:
                nutrition_data["serving_weight"] = int(weight_match.group(1))
            else:
                nutrition_data["serving_weight"] = 100  # Default
        
        # Add (estimated) tag for low confidence
        if image_base64 and nutrition_data.get("confidence") == "low":
            nutrition_data["food_name"] = f"{nutrition_data.get('food_name', 'Unknown Food')} (estimated)"
        
        return nutrition_data
        
    except Exception as e:
        print(f"Error in OpenAI analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze food item: {str(e)}"
        )

# Routes
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Healthism Calorie Tracker API"}

# Authentication Routes
@app.post("/api/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    # Check if user exists
    if users_collection.find_one({"username": user_data.username}):
        raise HTTPException(status_code=400, detail="Username already registered")
    if users_collection.find_one({"email": user_data.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_doc = {
        "username": user_data.username,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "daily_calorie_goal": user_data.daily_calorie_goal,
        "created_at": datetime.utcnow()
    }
    users_collection.insert_one(user_doc)
    
    # Create token
    access_token = create_access_token(data={"sub": user_data.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user = users_collection.find_one({"username": user_data.username})
    # Support both 'password' and 'password_hash' field names for backwards compatibility
    password_field = user.get("password_hash") or user.get("password") if user else None
    if not user or not password_field or not verify_password(user_data.password, password_field):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    access_token = create_access_token(data={"sub": user_data.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me")
async def get_me(current_user = Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "email": current_user["email"],
        "daily_calorie_goal": current_user.get("daily_calorie_goal", 2000)
    }

@app.put("/api/auth/update-goal")
async def update_calorie_goal(request: dict, current_user = Depends(get_current_user)):
    """Update user's daily calorie goal"""
    try:
        new_goal = request.get("daily_calorie_goal")
        
        if not new_goal or not isinstance(new_goal, (int, float)):
            raise HTTPException(status_code=400, detail="Invalid calorie goal value")
        
        if new_goal < 500 or new_goal > 10000:
            raise HTTPException(status_code=400, detail="Calorie goal must be between 500 and 10000")
        
        # Update the user's goal
        result = users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"daily_calorie_goal": int(new_goal)}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="Failed to update goal")
        
        return {
            "message": "Daily calorie goal updated successfully",
            "daily_calorie_goal": int(new_goal)
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating goal: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating calorie goal: {str(e)}")

# Food Analysis Routes
@app.post("/api/food/search")
async def search_food(request: QuickSearchRequest, current_user = Depends(get_current_user)):
    """Quick search for food items - returns suggestions without saving"""
    try:
        # Use Gemini to get food suggestions
        nutrition_data = await analyze_food_with_gemini(text_query=request.query)
        
        # Return nutrition info without saving
        return {
            "food_name": nutrition_data["food_name"],
            "calories": nutrition_data["calories"],
            "protein": nutrition_data.get("protein", 0),
            "carbs": nutrition_data.get("carbs", 0),
            "fats": nutrition_data.get("fats", 0),
            "serving_size": nutrition_data.get("serving_size", "1 serving")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching food: {str(e)}")

@app.post("/api/food/analyze-image")
async def analyze_food_image(request: FoodAnalysisRequest, current_user = Depends(get_current_user)):
    """Analyze food from image using Gemini Vision"""
    try:
        # Analyze with Gemini
        nutrition_data = await analyze_food_with_gemini(image_base64=request.image_base64)
        
        # Save to database
        food_entry = {
            "user_id": str(current_user["_id"]),
            "food_name": nutrition_data["food_name"],
            "calories": nutrition_data["calories"],
            "protein": nutrition_data.get("protein", 0),
            "carbs": nutrition_data.get("carbs", 0),
            "fats": nutrition_data.get("fats", 0),
            "image_base64": request.image_base64,
            "serving_size": nutrition_data.get("serving_size", "1 serving"),
            "serving_weight": nutrition_data.get("serving_weight", 100),
            "entry_type": "camera",
            "timestamp": datetime.utcnow(),
            "date": datetime.utcnow().strftime("%Y-%m-%d")
        }
        result = food_entries_collection.insert_one(food_entry)
        
        return {
            "id": str(result.inserted_id),
            "food_name": nutrition_data["food_name"],
            "calories": nutrition_data["calories"],
            "protein": nutrition_data.get("protein", 0),
            "carbs": nutrition_data.get("carbs", 0),
            "fats": nutrition_data.get("fats", 0),
            "serving_size": nutrition_data.get("serving_size", "1 serving"),
            "serving_weight": nutrition_data.get("serving_weight", 100),
            "confidence": nutrition_data.get("confidence", "medium")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing image: {str(e)}")

@app.post("/api/food/analyze-recipe")
async def analyze_recipe(request: RecipeAnalysisRequest, current_user = Depends(get_current_user)):
    """Analyze recipe and calculate total calories"""
    try:
        # Analyze with Gemini
        nutrition_data = await analyze_food_with_gemini(text_query=f"Analyze this recipe and provide total nutritional information: {request.recipe_text}")
        
        # Save to database
        food_entry = {
            "user_id": str(current_user["_id"]),
            "food_name": nutrition_data["food_name"],
            "calories": nutrition_data["calories"],
            "protein": nutrition_data.get("protein", 0),
            "carbs": nutrition_data.get("carbs", 0),
            "fats": nutrition_data.get("fats", 0),
            "recipe_text": request.recipe_text,
            "entry_type": "recipe",
            "timestamp": datetime.utcnow(),
            "date": datetime.utcnow().strftime("%Y-%m-%d")
        }
        result = food_entries_collection.insert_one(food_entry)
        
        return {
            "id": str(result.inserted_id),
            "food_name": nutrition_data["food_name"],
            "calories": nutrition_data["calories"],
            "protein": nutrition_data.get("protein", 0),
            "carbs": nutrition_data.get("carbs", 0),
            "fats": nutrition_data.get("fats", 0)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing recipe: {str(e)}")

@app.post("/api/food/manual")
async def add_manual_food(request: ManualFoodRequest, current_user = Depends(get_current_user)):
    """Add food entry manually by name with serving size"""
    try:
        # Build query with serving size if provided
        query = request.food_name
        if request.serving_size:
            query = f"{request.food_name}, serving size: {request.serving_size}"
        
        # Get nutritional info from AI
        nutrition_data = await analyze_food_with_gemini(text_query=query)
        
        # Use serving size from request or from AI response
        serving_size = request.serving_size or nutrition_data.get("serving_size", "1 serving")
        
        # Save to database
        food_entry = {
            "user_id": str(current_user["_id"]),
            "food_name": nutrition_data["food_name"],
            "calories": nutrition_data["calories"],
            "protein": nutrition_data.get("protein", 0),
            "carbs": nutrition_data.get("carbs", 0),
            "fats": nutrition_data.get("fats", 0),
            "serving_size": serving_size,
            "entry_type": "manual",
            "timestamp": datetime.utcnow(),
            "date": datetime.utcnow().strftime("%Y-%m-%d")
        }
        result = food_entries_collection.insert_one(food_entry)
        
        return {
            "id": str(result.inserted_id),
            "food_name": nutrition_data["food_name"],
            "calories": nutrition_data["calories"],
            "protein": nutrition_data.get("protein", 0),
            "carbs": nutrition_data.get("carbs", 0),
            "fats": nutrition_data.get("fats", 0),
            "serving_size": serving_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding manual food: {str(e)}")

@app.get("/api/food/today")
async def get_today_entries(current_user = Depends(get_current_user)):
    """Get all food entries for today"""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    entries = list(food_entries_collection.find({
        "user_id": str(current_user["_id"]),
        "date": today
    }).sort("timestamp", -1))
    
    return [
        {
            "id": str(entry["_id"]),
            "food_name": entry["food_name"],
            "calories": entry["calories"],
            "protein": entry.get("protein", 0),
            "carbs": entry.get("carbs", 0),
            "fats": entry.get("fats", 0),
            "image_base64": entry.get("image_base64"),
            "entry_type": entry["entry_type"],
            "timestamp": entry["timestamp"].isoformat(),
            "date": entry["date"],
            "serving_size": entry.get("serving_size", "1 serving"),
            "serving_weight": entry.get("serving_weight", 100)
        }
        for entry in entries
    ]

@app.get("/api/food/history")
async def get_history(date: Optional[str] = None, current_user = Depends(get_current_user)):
    """Get food entries for a specific date"""
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    entries = list(food_entries_collection.find({
        "user_id": str(current_user["_id"]),
        "date": date
    }).sort("timestamp", -1))
    
    return [
        {
            "id": str(entry["_id"]),
            "food_name": entry["food_name"],
            "calories": entry["calories"],
            "protein": entry.get("protein", 0),
            "carbs": entry.get("carbs", 0),
            "fats": entry.get("fats", 0),
            "image_base64": entry.get("image_base64"),
            "entry_type": entry["entry_type"],
            "timestamp": entry["timestamp"].isoformat(),
            "date": entry["date"],
            "serving_size": entry.get("serving_size", "1 serving"),
            "serving_weight": entry.get("serving_weight", 100)
        }
        for entry in entries
    ]

@app.delete("/api/food/{entry_id}")
async def delete_food_entry(entry_id: str, current_user = Depends(get_current_user)):
    """Delete a food entry"""
    result = food_entries_collection.delete_one({
        "_id": ObjectId(entry_id),
        "user_id": str(current_user["_id"])
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Food entry not found")
    
    return {"message": "Food entry deleted successfully"}

@app.put("/api/food/{entry_id}")
async def update_food_entry(entry_id: str, request: dict, current_user = Depends(get_current_user)):
    """Update a food entry - recalculates nutrition if serving size or weight changes"""
    try:
        # Get the existing entry
        entry = food_entries_collection.find_one({
            "_id": ObjectId(entry_id),
            "user_id": str(current_user["_id"])
        })
        
        if not entry:
            raise HTTPException(status_code=404, detail="Food entry not found")
        
        update_data = {}
        should_recalculate = False
        
        # Check if serving size or weight changed
        new_serving_size = request.get("serving_size")
        new_serving_weight = request.get("serving_weight")
        
        if new_serving_size or new_serving_weight:
            should_recalculate = True
            
            # Get original food name (remove old serving info)
            food_name = entry.get("food_name", "Unknown Food")
            
            # Extract base food name by removing weight references
            import re
            # Remove patterns like "(250g)", "250g", "(approx. 250g)", etc.
            base_food_name = re.sub(r'\s*\(?(approx\.?\s*)?\d+g?\)?\s*', ' ', food_name)
            base_food_name = re.sub(r'\s+', ' ', base_food_name).strip()
            
            # Use the new serving size if provided, otherwise use existing
            serving_description = new_serving_size if new_serving_size else entry.get("serving_size", "1 serving")
            
            # Use the new weight if provided, otherwise use existing
            serving_weight_value = new_serving_weight if new_serving_weight else entry.get("serving_weight", 100)
            
            # Create updated food name with new weight
            # Format: "base_food_name (XXXg)" or use serving_description if it already has weight
            if re.search(r'\d+g', serving_description):
                # Serving description already has weight, use it
                updated_food_name = f"{base_food_name} {serving_description}"
            else:
                # Add weight to food name
                updated_food_name = f"{base_food_name} (approx. {serving_weight_value}g)"
            
            updated_food_name = re.sub(r'\s+', ' ', updated_food_name).strip()
            
            # Ask AI to recalculate nutrition based on new serving
            prompt = f"""Provide accurate nutritional information for: {base_food_name}
            
            Serving size: {serving_description}
            Serving weight: {serving_weight_value}g
            
            Calculate nutrition values for this EXACT serving size/weight.
            Use Indian market standards and FSSAI-approved values.
            
            Return ONLY valid JSON:
            {{
                "calories": number (for this serving),
                "protein": number in grams,
                "carbs": number in grams,
                "fats": number in grams
            }}
            """
            
            # Get recalculated nutrition from AI
            nutrition_data = await analyze_food_with_gemini(text_query=prompt)
            
            # Update with new values including the updated food name
            update_data = {
                "food_name": updated_food_name,
                "serving_size": serving_description,
                "serving_weight": int(serving_weight_value),
                "calories": nutrition_data.get("calories", entry.get("calories", 0)),
                "protein": nutrition_data.get("protein", entry.get("protein", 0)),
                "carbs": nutrition_data.get("carbs", entry.get("carbs", 0)),
                "fats": nutrition_data.get("fats", entry.get("fats", 0))
            }
        
        # If we have updates, save them
        if update_data:
            result = food_entries_collection.update_one(
                {"_id": ObjectId(entry_id)},
                {"$set": update_data}
            )
            
            if result.modified_count == 0 and result.matched_count == 0:
                raise HTTPException(status_code=400, detail="Failed to update entry")
            
            return {
                "message": "Food entry updated successfully with recalculated nutrition",
                "updated_values": update_data
            }
        
        return {"message": "No updates provided"}
    except Exception as e:
        print(f"Error updating entry: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating food entry: {str(e)}")


@app.get("/api/stats/daily")
async def get_daily_stats(date: Optional[str] = None, current_user = Depends(get_current_user)):
    """Get daily calorie statistics"""
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    entries = list(food_entries_collection.find({
        "user_id": str(current_user["_id"]),
        "date": date
    }))
    
    total_calories = sum(entry["calories"] for entry in entries)
    total_protein = sum(entry.get("protein", 0) for entry in entries)
    total_carbs = sum(entry.get("carbs", 0) for entry in entries)
    total_fats = sum(entry.get("fats", 0) for entry in entries)
    daily_goal = current_user.get("daily_calorie_goal", 2000)
    
    return {
        "date": date,
        "total_calories": total_calories,
        "total_protein": total_protein,
        "total_carbs": total_carbs,
        "total_fats": total_fats,
        "entries_count": len(entries),
        "daily_goal": daily_goal,
        "remaining_calories": daily_goal - total_calories,
        "percentage": (total_calories / daily_goal * 100) if daily_goal > 0 else 0
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
