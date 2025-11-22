from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import uvicorn
from fishaudio import FishAudio
from fishaudio.exceptions import APIError

app = FastAPI()

# Add CORS middleware to allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Fish Audio client
api_key = os.getenv("FISH_AUDIO_API_KEY")
if not api_key:
    print("Warning: FISH_AUDIO_API_KEY environment variable not set.")
    print("Set it with: $env:FISH_AUDIO_API_KEY='your_api_key' (PowerShell)")
    print("or: set FISH_AUDIO_API_KEY=your_api_key (CMD)")
    client = None
else:
    try:
        client = FishAudio(api_key=api_key)
        print("Fish Audio client initialized successfully")
    except Exception as e:
        print(f"Error initializing Fish Audio client: {e}")
        client = None

# Pydantic model for the incoming request
class SpeechRequest(BaseModel):
    text: str
    emotion: str

@app.post("/generate_speech")
async def generate_speech(request: SpeechRequest):
    # Get text and emotion from request
    text = request.text
    emotion = request.emotion
    
    # Create prompt_text using Text Tag logic
    if emotion.lower() == "neutral":
        prompt_text = text
    else:
        prompt_text = f"({emotion.lower()}) {text}"
    
    print(f"Generating speech with prompt: {prompt_text}")
    
    # Check if Fish Audio client is available
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="Fish Audio client not initialized. Please set FISH_AUDIO_API_KEY environment variable."
        )
    
    try:
        # Call Fish Audio API to generate speech
        audio_bytes = client.tts.convert(
            text=prompt_text,
            format='mp3'
        )
        
        # Return audio as response
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=output.mp3"
            }
        )
        
    except APIError as e:
        error_message = str(e)
        print(f"Fish Audio API Error: {error_message}")
        
        if "402" in error_message or "Invalid api key" in error_message or "insufficient balance" in error_message:
            detail = (
                "Fish Audio API Error: Invalid API key or insufficient balance. "
                "Please check your API key and account balance at https://fish.audio"
            )
        else:
            detail = f"Fish Audio API Error: {error_message}"
        
        raise HTTPException(
            status_code=402 if "402" in error_message else 500,
            detail=detail
        )
        
    except Exception as e:
        print(f"Error generating speech: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate speech: {str(e)}"
        )

@app.get("/")
async def root():
    return {"message": "Expressive AAC Board API is running"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)

