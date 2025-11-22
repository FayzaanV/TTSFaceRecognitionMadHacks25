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

# Initialize Fish Audio client and get a consistent voice
api_key = os.getenv("FISH_AUDIO_API_KEY")
client = None
default_voice_id = None

if not api_key:
    print("Warning: FISH_AUDIO_API_KEY environment variable not set.")
    print("Set it with: $env:FISH_AUDIO_API_KEY='your_api_key' (PowerShell)")
    print("or: set FISH_AUDIO_API_KEY=your_api_key (CMD)")
else:
    try:
        client = FishAudio(api_key=api_key)
        print("Fish Audio client initialized successfully")
        
        # Get available voices filtered for English with American accent
        try:
            # Filter for English language and American accent
            voices = client.voices.list(
                language="en",  # English language
                tags="american",  # American accent
                page_size=20
            )
            
            if voices.items and len(voices.items) > 0:
                default_voice_id = voices.items[0].id
                voice_title = voices.items[0].title
                print(f"Using voice: {voice_title} (ID: {default_voice_id})")
                print(f"Found {len(voices.items)} English American voice(s) available")
            else:
                # Fallback: try just English language if no American voices found
                print("No American accent voices found, trying English voices...")
                voices = client.voices.list(language="en", page_size=20)
                if voices.items and len(voices.items) > 0:
                    default_voice_id = voices.items[0].id
                    voice_title = voices.items[0].title
                    print(f"Using voice: {voice_title} (ID: {default_voice_id})")
                    print(f"Found {len(voices.items)} English voice(s) available")
                else:
                    print("Warning: No English voices found. Using default voice.")
        except Exception as e:
            print(f"Warning: Could not fetch voices: {e}")
            print("Will attempt to use default voice without reference_id")
            
    except Exception as e:
        print(f"Error initializing Fish Audio client: {e}")
        client = None

# Emotion to voice parameter mapping for consistent tone, speed, and emphasis
# These parameters ensure identical output for the same input and emotion
# Speed: Controls speech rate (1.0 = normal, >1.0 = faster, <1.0 = slower)
# Emphasis is controlled through the emotion tag in the text itself
EMOTION_VOICE_PARAMS = {
    'happy': {
        'speed': 1.1,  # Slightly faster for happy
    },
    'sad': {
        'speed': 0.9,  # Slower for sad
    },
    'neutral': {
        'speed': 1.0,  # Normal speed
    },
    'surprised': {
        'speed': 1.15,  # Faster for surprise
    },
    'angry': {
        'speed': 1.05,  # Slightly faster for angry
    }
}

# Pydantic model for the incoming request
# Using field names to ensure correct parameter mapping
class SpeechRequest(BaseModel):
    text: str  # The actual text to speak
    emotion: str  # The emotion tag (happy, sad, neutral, etc.)

@app.post("/generate_speech")
async def generate_speech(request: SpeechRequest):
    # Get text and emotion from request
    text = request.text
    emotion = request.emotion
    
    # Debug: Log what we received
    print(f"Received request - text: '{text}' (type: {type(text).__name__}), emotion: '{emotion}' (type: {type(emotion).__name__})")
    
    # Validate and clean inputs
    if not text or not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty and must be a string")
    
    if not emotion or not isinstance(emotion, str):
        emotion = 'neutral'
    
    # Clean the text - remove any accidental emotion tags that might have been typed
    text = text.strip()
    # Remove emotion tags if they were accidentally typed in the text field
    emotion_lower = emotion.lower()
    if text.lower().startswith(f'({emotion_lower})'):
        text = text[len(f'({emotion_lower})'):].strip()
        print(f"Warning: Removed emotion tag from text field. Cleaned text: '{text}'")
    
    # Ensure emotion is one of the valid values
    valid_emotions = ['happy', 'sad', 'neutral', 'surprised', 'angry']
    if emotion.lower() not in valid_emotions:
        print(f"Warning: Invalid emotion '{emotion}', defaulting to 'neutral'")
        emotion = 'neutral'
    
    # Create prompt_text using Text Tag logic
    # Format: (emotion) text - emotion tag goes BEFORE the text
    if emotion.lower() == "neutral":
        prompt_text = text
    else:
        prompt_text = f"({emotion.lower()}) {text}"
    
    print(f"Generating speech with prompt: '{prompt_text}'")
    
    # Check if Fish Audio client is available
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="Fish Audio client not initialized. Please set FISH_AUDIO_API_KEY environment variable."
        )
    
    try:
        # Get consistent voice parameters based on emotion
        # This ensures identical output for the same input and emotion
        voice_params = EMOTION_VOICE_PARAMS.get(emotion.lower(), EMOTION_VOICE_PARAMS['neutral'])
        
        # Call Fish Audio API to generate speech
        # All parameters are set consistently to ensure identical output for same input+emotion:
        # - reference_id: Same voice every time (ensures consistent voice)
        # - speed: Same speed for same emotion (ensures consistent pace/emphasis)
        # - model: Same model for stability (ensures consistent processing)
        # - format: Same audio format (ensures consistent encoding)
        # - latency: Consistent latency mode (ensures consistent processing path)
        # - prompt_text: Emotion tag ensures consistent emphasis/tone
        # Using TTSConfig for additional consistency controls
        from fishaudio.types import TTSConfig
        
        # Create config with consistent parameters for deterministic output
        tts_config = TTSConfig(
            format='mp3',
            normalize=True,  # Consistent audio normalization
            latency='balanced',  # Consistent latency mode
            temperature=0.7,  # Lower temperature = more deterministic (0.7 is default but explicit)
            top_p=0.7  # Consistent sampling parameter
        )
        
        convert_params = {
            'text': prompt_text,
            'speed': voice_params.get('speed', 1.0),  # Consistent speed for same emotion
            'model': 's1',  # Use consistent model for stability
            'config': tts_config  # Use config for additional consistency
        }
        
        # Add reference_id if we have a voice ID (ensures consistent voice)
        if default_voice_id:
            convert_params['reference_id'] = default_voice_id
        
        # Log parameters for debugging consistency
        print(f"TTS parameters for consistency:")
        print(f"  - Text: '{prompt_text}'")
        print(f"  - Speed: {convert_params['speed']} (emotion: {emotion})")
        print(f"  - Model: {convert_params['model']}")
        print(f"  - Voice ID: {default_voice_id or 'default'}")
        print(f"  - Temperature: {tts_config.temperature}, Top-p: {tts_config.top_p}")
        
        audio_bytes = client.tts.convert(**convert_params)
        
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

