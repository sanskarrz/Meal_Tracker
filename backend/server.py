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
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

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
    """Analyze food using Gemini Vision API"""
    try:
        # Create chat instance
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"food_analysis_{datetime.now().timestamp()}",
            system_message="You are a nutrition expert. Analyze food items and provide detailed nutritional information in JSON format."
        ).with_model("gemini", "gemini-2.0-flash")
        
        # Prepare prompt
        if image_base64 and text_query:
            prompt = f"{text_query}. Return ONLY a JSON object with: food_name (string), calories (number), protein (number in grams), carbs (number in grams), fats (number in grams), serving_size (string like '1 cup', '100g', '1 medium'), confidence (string: high/medium/low)."
            # Create image content
            image_content = ImageContent(image_base64=image_base64)
            message = UserMessage(
                text=prompt,
                file_contents=[image_content]
            )
        elif image_base64:
            prompt = "Identify this food item and provide nutritional information. Estimate the serving size shown in the image. Return ONLY a JSON object with: food_name (string), calories (number), protein (number in grams), carbs (number in grams), fats (number in grams), serving_size (string like '1 cup', '100g', '1 medium'), confidence (string: high/medium/low)."
            image_content = ImageContent(image_base64=image_base64)
            message = UserMessage(
                text=prompt,
                file_contents=[image_content]
            )
        else:
            prompt = f"Provide nutritional information for: {text_query}. Return ONLY a JSON object with: food_name (string), calories (number), protein (number in grams), carbs (number in grams), fats (number in grams), serving_size (string like '1 cup', '100g', '1 serving'), confidence (string: high/medium/low)."
            message = UserMessage(text=prompt)
        
        # Get response
        response = await chat.send_message(message)
        
        # Parse JSON response
        import json
        import re
        
        # Try to extract JSON from response
        json_match = re.search(r'\{[^{}]*\}', response)
        if json_match:
            nutrition_data = json.loads(json_match.group())
        else:
            # Fallback parsing
            nutrition_data = {
                "food_name": "Unknown Food",
                "calories": 200,
                "protein": 10,
                "carbs": 20,
                "fats": 8,
                "serving_size": "1 serving",
                "confidence": "low"
            }
        
        # Ensure serving_size is present
        if "serving_size" not in nutrition_data:
            nutrition_data["serving_size"] = "1 serving"
        
        return nutrition_data
    except Exception as e:
        print(f"Error in Gemini analysis: {str(e)}")
        # Return default values on error
        return {
            "food_name": "Unknown Food",
            "calories": 200,
            "protein": 10,
            "carbs": 20,
            "fats": 8,
            "serving_size": "1 serving",
            "confidence": "low",
            "error": str(e)
        }

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
    if not user or not verify_password(user_data.password, user["password_hash"]):
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
            "fats": nutrition_data.get("fats", 0)
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
    """Add food entry manually by name"""
    try:
        # Get nutritional info from Gemini
        nutrition_data = await analyze_food_with_gemini(text_query=request.food_name)
        
        # Save to database
        food_entry = {
            "user_id": str(current_user["_id"]),
            "food_name": nutrition_data["food_name"],
            "calories": nutrition_data["calories"],
            "protein": nutrition_data.get("protein", 0),
            "carbs": nutrition_data.get("carbs", 0),
            "fats": nutrition_data.get("fats", 0),
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
            "fats": nutrition_data.get("fats", 0)
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
            "date": entry["date"]
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
            "date": entry["date"]
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
