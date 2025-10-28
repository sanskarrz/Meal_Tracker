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
        
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        
        # Sanitize base64 if provided
        if image_base64:
            # Remove any whitespace, newlines, and invalid characters
            image_base64 = re.sub(r'[^A-Za-z0-9+/=]', '', image_base64)
            
            # Ensure proper base64 padding
            missing_padding = len(image_base64) % 4
            if missing_padding:
                image_base64 += '=' * (4 - missing_padding)
            
            # Validate base64 by trying to decode it
            try:
                base64.b64decode(image_base64)
                print(f"✅ Base64 validation successful. Length: {len(image_base64)}")
            except Exception as e:
                print(f"❌ Base64 validation failed: {str(e)}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid base64 image data. Please try capturing the image again."
                )
        
        system_message = """You are a nutrition expert specializing in Indian and South Asian cuisine. 
        Provide SPECIFIC serving sizes using MEASURABLE units:
        - For packaged foods: Try to identify brand AND weight (e.g., "Kellogg's Corn Flakes 100g", "Cadbury 45g")
        - For home-cooked foods: Use specific Indian units (e.g., "2 medium rotis (60g each)", "1 katori dal (150ml)")
        - For fruits/vegetables: Use pieces with weight (e.g., "1 medium banana (120g)", "2 medium potatoes (200g)")
        - NEVER use vague terms like "1 serving" - always quantify
        
        Always provide your best estimate even if image quality is not perfect.
        Be VERY accurate with portion sizes and calorie counts for Indian market."""
        
        # Prepare messages based on input type
        messages = [{"role": "system", "content": system_message}]
        
        if image_base64 and text_query:
            # Image + text query
            prompt = f"""{text_query}. 
            Return ONLY valid JSON: 
            {{
                "food_name": "specific name with brand and weight if packaged",
                "calories": number,
                "protein": number in grams,
                "carbs": number in grams,
                "fats": number in grams,
                "serving_size": "specific measurement with weight/volume/pieces",
                "confidence": "high/medium/low"
            }}
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
            prompt = """Carefully identify this food item and provide nutritional information.
            
            Look at the image and identify:
            1. What type of food is visible
            2. Approximate portion size based on visual cues
            3. If it's packaged food, try to identify the brand and package size
            
            Provide your best estimate based on what you can see.
            
            Return ONLY valid JSON:
            {{
                "food_name": "specific name - include brand and weight if visible, otherwise best estimate",
                "calories": number,
                "protein": number in grams,
                "carbs": number in grams,
                "fats": number in grams,
                "serving_size": "specific measurement (grams, ml, pieces with weight)",
                "confidence": "high/medium/low"
            }}
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
            
        else:
            # Text only
            prompt = f"""Provide accurate nutritional information for: {text_query}
            
            Return ONLY valid JSON:
            {{
                "food_name": "specific name with brand and weight/variant",
                "calories": number,
                "protein": number in grams,
                "carbs": number in grams,
                "fats": number in grams,
                "serving_size": "specific measurement (grams, ml, pieces)",
                "confidence": "high/medium/low"
            }}
            """
            messages.append({"role": "user", "content": prompt})
        
        # Call OpenAI API directly with gpt-4o model
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=500,
            temperature=0.3
        )
        
        # Parse JSON response
        import json
        import re
        
        response_text = response.choices[0].message.content
        print(f"OpenAI Response: {response_text}")  # Debug log
        
        # Try to extract JSON from response
        json_match = re.search(r'\{(?:[^{}]|\{[^{}]*\})*\}', response_text)
        if json_match:
            nutrition_data = json.loads(json_match.group())
        else:
            # Fallback parsing if no JSON found
            nutrition_data = {
                "food_name": "Unknown Food (estimated)",
                "calories": 200,
                "protein": 10,
                "carbs": 20,
                "fats": 8,
                "serving_size": "1 serving (weight not specified)",
                "confidence": "low"
            }
        
        # Ensure serving_size is present and specific
        if "serving_size" not in nutrition_data or nutrition_data["serving_size"] == "1 serving":
            nutrition_data["serving_size"] = "1 serving (weight not specified)"
        
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
            "serving_size": entry.get("serving_size", "1 serving")
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
            "serving_size": entry.get("serving_size", "1 serving")
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
    """Update a food entry - recalculates nutrition based on new serving size"""
    try:
        # Get the existing entry
        entry = food_entries_collection.find_one({
            "_id": ObjectId(entry_id),
            "user_id": str(current_user["_id"])
        })
        
        if not entry:
            raise HTTPException(status_code=404, detail="Food entry not found")
        
        # Update serving size if provided
        new_serving_size = request.get("serving_size")
        if new_serving_size:
            # Get base food type (remove quantities and old serving)
            old_food_name = entry.get("food_name", "Unknown Food")
            
            # Extract just the food type (e.g., "roti", "dal", "apple") from old name
            # Remove common quantity words and parentheses content
            import re
            base_food_type = re.sub(r'\(.*?\)', '', old_food_name)  # Remove parentheses
            base_food_type = re.sub(r'^\d+\s+', '', base_food_type)  # Remove leading numbers
            base_food_type = re.sub(r'\s*(medium|small|large|big)\s*', ' ', base_food_type, flags=re.IGNORECASE)  # Remove size words
            base_food_type = base_food_type.strip()
            
            # The new serving size entered by user IS the new food name
            # Only append base food type if it's not already in the serving size
            if base_food_type.lower() in new_serving_size.lower():
                # User already included food type, use as is
                new_food_name = new_serving_size
            else:
                # User only entered quantity/size, append food type
                # e.g., "200g" + "dal" = "200g dal"
                new_food_name = f"{new_serving_size} {base_food_type}".strip()
            
            # Recalculate nutrition based on the new serving
            prompt = f"Provide accurate nutrition for {new_food_name} for Indian market."
            nutrition_data = await analyze_food_with_gemini(text_query=prompt)
            
            # Update the entry with new nutrition values AND new food name
            update_data = {
                "food_name": new_food_name,  # Smart food name based on serving
                "serving_size": new_serving_size,
                "calories": nutrition_data.get("calories", entry.get("calories", 0)),
                "protein": nutrition_data.get("protein", entry.get("protein", 0)),
                "carbs": nutrition_data.get("carbs", entry.get("carbs", 0)),
                "fats": nutrition_data.get("fats", entry.get("fats", 0))
            }
            
            result = food_entries_collection.update_one(
                {"_id": ObjectId(entry_id)},
                {"$set": update_data}
            )
            
            if result.modified_count == 0:
                raise HTTPException(status_code=400, detail="Failed to update entry")
            
            return {
                "message": "Food entry updated successfully",
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
