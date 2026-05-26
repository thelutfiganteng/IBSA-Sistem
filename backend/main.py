import os
import io
import json
import numpy as np
import face_recognition
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Sumsel Agro Sense - Face Recognition AI Engine")

# CORS setup for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Need service role for bypassing RLS during face auth

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
         raise HTTPException(status_code=500, detail="Supabase environment variables are missing")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def extract_face_embedding(image_bytes: bytes) -> list[float]:
    """Extracts 128-dimensional face embedding from image bytes using face_recognition (dlib)."""
    try:
        # Load image from bytes
        image = face_recognition.load_image_file(io.BytesIO(image_bytes))
        
        # Find all face encodings in the image
        face_encodings = face_recognition.face_encodings(image)
        
        if len(face_encodings) == 0:
            raise ValueError("No face detected in the image")
        if len(face_encodings) > 1:
            raise ValueError("Multiple faces detected. Please ensure only one face is visible.")
            
        # Return the first face encoding as a list of floats
        return face_encodings[0].tolist()
    except Exception as e:
        raise ValueError(f"Error processing image: {str(e)}")

@app.post("/face/register")
async def register_face(
    user_id: str = Form(...),
    file: UploadFile = File(...),
    supabase: Client = Depends(get_supabase)
):
    """
    Registers a face embedding for a user.
    """
    try:
        contents = await file.read()
        embedding = extract_face_embedding(contents)
        
        # Format the embedding for pgvector: '[0.1, 0.2, ...]'
        embedding_str = f"[{','.join(map(str, embedding))}]"
        
        # Update the user's profile with the new embedding
        response = supabase.table("profiles").update({"face_embedding": embedding_str}).eq("id", user_id).execute()
        
        if len(response.data) == 0:
            raise HTTPException(status_code=404, detail="User profile not found")
            
        return {"status": "success", "message": "Face registered successfully."}
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/face/verify")
async def verify_face(
    file: UploadFile = File(...),
    supabase: Client = Depends(get_supabase)
):
    """
    Verifies a face against the database.
    Returns the user data if a match is found with similarity > threshold.
    """
    try:
        contents = await file.read()
        embedding = extract_face_embedding(contents)
        
        # Format the embedding for pgvector
        embedding_str = f"[{','.join(map(str, embedding))}]"
        
        # Call the Supabase RPC function 'match_face'
        # Adjust threshold as needed. 0.92 is usually good for cosine similarity with dlib.
        rpc_response = supabase.rpc(
            "match_face", 
            {"query_embedding": embedding_str, "match_threshold": 0.92, "match_count": 1}
        ).execute()
        
        matches = rpc_response.data
        if not matches or len(matches) == 0:
            raise HTTPException(status_code=401, detail="Face not recognized or no match found")
            
        best_match = matches[0]
        return {
            "status": "success",
            "message": "Face verified successfully",
            "user": best_match
        }
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/health")
def health_check():
    return {"status": "healthy", "engine": "FastAPI + dlib (face_recognition)"}
