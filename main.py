from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import uvicorn
from fishaudio import FishAudio
from fishaudio.exceptions import APIError
from fishaudio.types import TTSConfig
from typing import Optional
import time

app = FastAPI()

# Add CORS middleware to allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Emotion to voice parameter mapping for consistent tone, speed, and emphasis
EMOTION_VOICE_PARAMS = {
    'happy': {
        'speed': 1.1,
    },
    'sad': {
        'speed': 0.9,
    },
    'neutral': {
        'speed': 1.0,
    },
    'surprised': {
        'speed': 1.15,
    },
    'angry': {
        'speed': 1.05,
    }
}

# Storage for voice IDs (simple JSON file-based storage)
# In production, replace with Firestore or a proper database
VOICE_STORAGE_FILE = "voice_storage.json"

def load_voice_storage():
    """Load voice IDs from storage file"""
    if os.path.exists(VOICE_STORAGE_FILE):
        try:
            with open(VOICE_STORAGE_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading voice storage: {e}")
            return {}
    return {}

def save_voice_storage(data):
    """Save voice IDs to storage file"""
    try:
        with open(VOICE_STORAGE_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving voice storage: {e}")
        return False

def get_user_voice_id(user_id: str = "default") -> Optional[str]:
    """Get stored voice ID for a user"""
    storage = load_voice_storage()
    return storage.get(user_id)

def save_user_voice_id(user_id: str, voice_id: str):
    """Save voice ID for a user"""
    storage = load_voice_storage()
    storage[user_id] = voice_id
    save_voice_storage(storage)

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
            voices = client.voices.list(
                language="en",
                tags="american",
                page_size=20
            )
            
            if voices.items and len(voices.items) > 0:
                default_voice_id = voices.items[0].id
                voice_title = voices.items[0].title
                print(f"Using voice: {voice_title} (ID: {default_voice_id})")
                print(f"Found {len(voices.items)} English American voice(s) available")
            else:
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

# Pydantic models
class SpeechRequest(BaseModel):
    text: str
    emotion: str
    user_id: Optional[str] = "default"  # For retrieving stored voice ID

class VoiceStatusResponse(BaseModel):
    has_voice: bool
    voice_id: Optional[str] = None
    status: str

# ========== PHASE 1: VOICE CLONING ENDPOINT ==========
@app.post("/api/create-voice")
async def create_voice(
    audio_file: UploadFile = File(...),
    user_id: str = Form("default")
):
    """
    Create a voice model from a 30-second audio recording.
    Returns the voice_id (reference_id) for persistent use.
    """
    print(f"\n=== VOICE CLONING REQUEST ===")
    print(f"User ID: {user_id}")
    print(f"Audio file: {audio_file.filename}, Content-Type: {audio_file.content_type}")
    
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="Fish Audio client not initialized. Please set FISH_AUDIO_API_KEY environment variable."
        )
    
    try:
        # Read audio file
        audio_bytes = await audio_file.read()
        print(f"Audio file size: {len(audio_bytes)} bytes")
        
        # Validate file size (30 seconds of audio should be reasonable)
        # Assuming ~128kbps MP3 or WAV, 30 seconds ≈ 500KB-2MB
        if len(audio_bytes) > 10 * 1024 * 1024:  # 10MB max
            raise HTTPException(status_code=400, detail="Audio file too large (max 10MB)")
        if len(audio_bytes) < 1000:  # 1KB min
            raise HTTPException(status_code=400, detail="Audio file too small")
        
        # Create voice model using Fish Audio API
        # The SDK method doesn't seem to support direct file upload
        # Use REST API directly instead
        import requests
        import tempfile
        import os
        
        print("Calling Fish Audio API to create voice model...")
        print("Using REST API directly (SDK method doesn't support file upload)")
        
        # Save audio to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
            temp_file.write(audio_bytes)
            temp_file_path = temp_file.name
        
        try:
            # Use Fish Audio REST API with correct endpoint and parameters
            api_url = "https://api.fish.audio/model"
            
            headers = {
                "Authorization": f"Bearer {api_key}"
                # Note: Don't set Content-Type header - requests will set it automatically
                # with the correct boundary for multipart/form-data
            }
            
            print(f"Calling Fish Audio API: {api_url}")
            print(f"Using correct endpoint and parameters for voice cloning")
            
            # Create cover image upfront (required for public models or as fallback)
            import io
            cover_image_available = False
            cover_image_buffers = {}  # Store multiple buffers for retries
            
            try:
                from PIL import Image
                # Create a simple colored square image (200x200 pixels) as cover
                img = Image.new('RGB', (200, 200), color=(73, 109, 137))  # Nice blue color
                
                # Try different image formats and sizes
                for format_name, img_format in [('PNG', 'PNG'), ('JPEG', 'JPEG')]:
                    img_buffer = io.BytesIO()
                    img.save(img_buffer, format=img_format)
                    img_buffer.seek(0)
                    cover_image_buffers[format_name.lower()] = img_buffer
                
                cover_image_available = True
                print("✅ Cover image created successfully (PNG and JPEG formats)")
            except ImportError:
                print("⚠️ PIL/Pillow not available - install with: pip install Pillow")
                print("⚠️ Will attempt without cover image first, then retry if needed")
            except Exception as e:
                print(f"⚠️ Error creating cover image: {e}")
            
            # Prepare multipart form data with correct field names
            # Include cover image in FIRST request to avoid the error
            with open(temp_file_path, 'rb') as f:
                # Correct form data fields as per Fish Audio API documentation
                files = {
                    'voices': (audio_file.filename or 'voice_recording.webm', f, audio_file.content_type or 'audio/webm')
                }
                
                # Add cover image with different possible field names
                if cover_image_available and 'png' in cover_image_buffers:
                    cover_image_buffers['png'].seek(0)
                    # Try 'cover' as the field name (most common)
                    files['cover'] = ('cover.png', cover_image_buffers['png'], 'image/png')
                    print("  Added cover image with field name 'cover'")
                
                data = {
                    'title': f"User {user_id}'s Voice",
                    'type': 'tts',  # Required: must be 'tts'
                    'train_mode': 'fast',  # Required: must be 'fast'
                    'is_public': '0',  # Try '0' for false (some APIs use 0/1)
                    'public': '0',  # Try '0' for false
                    'isPublic': 'false',  # Try camelCase with string
                    'private': 'true',  # Try private as string
                }
                
                print(f"Form data:")
                print(f"  title: {data['title']}")
                print(f"  type: {data['type']}")
                print(f"  train_mode: {data['train_mode']}")
                print(f"  is_public: {data['is_public']}")
                print(f"  public: {data['public']}")
                print(f"  private: {data['private']}")
                print(f"  isPublic: {data['isPublic']}")
                print(f"  voices: {audio_file.filename} ({len(audio_bytes)} bytes)")
                print(f"  cover: {'Included' if 'cover' in files else 'Not included'}")
                
                response = requests.post(api_url, headers=headers, files=files, data=data, timeout=120)
            
            # Clean up temp file
            try:
                os.unlink(temp_file_path)
            except:
                pass
            
            print(f"Response status: {response.status_code}")
            print(f"Response headers: {dict(response.headers)}")
            
            if response.status_code == 201:
                # Success - extract voice ID from response
                try:
                    result = response.json()
                    print(f"Response body: {result}")
                except:
                    result = {}
                    try:
                        result = response.json()
                    except:
                        result_text = response.text[:500]
                        print(f"Response text: {result_text}")
                
                # Extract voice ID (_id field from response)
                if isinstance(result, dict):
                    voice_id = result.get('_id') or result.get('id') or result.get('voice_id') or result.get('reference_id')
                else:
                    # Try to parse as JSON if it's a string
                    try:
                        import json
                        result = json.loads(str(result))
                        voice_id = result.get('_id') or result.get('id')
                    except:
                        voice_id = None
                
                if not voice_id:
                    # Try to extract from response text if JSON parsing failed
                    response_text = response.text
                    print(f"Full response text: {response_text}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Voice creation succeeded (201) but no voice ID found in response. Response: {response_text[:500]}"
                    )
                
                print(f"✅ Voice model created successfully!")
                print(f"Voice ID (_id): {voice_id}")
            elif response.status_code == 400 and "cover image" in response.text.lower():
                # Special handling for cover image error - try with different field names
                print("⚠️ Cover image required but not accepted. Trying different field names...")
                
                if not cover_image_available:
                    error_text = response.text[:1000]
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Fish Audio API Error ({response.status_code}): {error_text}\n\nNote: Install Pillow (pip install Pillow) to enable automatic cover image generation."
                    )
                
                # Recreate temp file since we cleaned it up
                with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file_retry:
                    temp_file_retry.write(audio_bytes)
                    temp_file_path_retry = temp_file_retry.name
                
                # Try different field names for cover image
                cover_field_names = ['cover', 'cover_image', 'image', 'coverImage', 'thumbnail', 'thumb']
                success = False
                
                for field_name in cover_field_names:
                    try:
                        print(f"  Trying cover image with field name: '{field_name}'")
                        
                        # Reset image buffer
                        if 'png' in cover_image_buffers:
                            cover_image_buffers['png'].seek(0)
                        elif 'jpeg' in cover_image_buffers:
                            cover_image_buffers['jpeg'].seek(0)
                            field_name_suffix = 'jpg'
                        else:
                            continue
                        
                        with open(temp_file_path_retry, 'rb') as f:
                            files_retry = {
                                'voices': (audio_file.filename or 'voice_recording.webm', f, audio_file.content_type or 'audio/webm'),
                            }
                            
                            # Add cover with current field name
                            if 'png' in cover_image_buffers:
                                files_retry[field_name] = ('cover.png', cover_image_buffers['png'], 'image/png')
                            else:
                                files_retry[field_name] = ('cover.jpg', cover_image_buffers['jpeg'], 'image/jpeg')
                            
                            data_retry = {
                                'title': f"User {user_id}'s Voice",
                                'type': 'tts',
                                'train_mode': 'fast',
                                'is_public': '0',
                                'public': '0',
                            }
                            
                            response_retry = requests.post(api_url, headers=headers, files=files_retry, data=data_retry, timeout=120)
                            
                            if response_retry.status_code == 201:
                                result = response_retry.json()
                                print(f"  ✅ Success with field name '{field_name}'! Response: {result}")
                                voice_id = result.get('_id') or result.get('id') or result.get('voice_id') or result.get('reference_id')
                                if voice_id:
                                    success = True
                                    response = response_retry  # Update response for later processing
                                    break
                            else:
                                error_text_retry = response_retry.text[:200]
                                print(f"  ❌ Failed with '{field_name}': {response_retry.status_code} - {error_text_retry}")
                                
                    except Exception as e:
                        print(f"  ❌ Exception with '{field_name}': {str(e)}")
                        continue
                
                # Clean up retry temp file
                try:
                    os.unlink(temp_file_path_retry)
                except:
                    pass
                
                if not success:
                    error_text = response.text[:1000]
                    print(f"❌ All cover image field names failed")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Fish Audio API Error ({response.status_code}): {error_text}\n\nTried cover image with field names: {', '.join(cover_field_names)}"
                    )
            else:
                # Error response
                error_text = response.text[:1000]  # Limit error text
                print(f"❌ API Error: {response.status_code}")
                print(f"Error response: {error_text}")
                
                try:
                    error_json = response.json()
                    error_message = error_json.get('message') or error_json.get('error') or error_text
                except:
                    error_message = error_text
                
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Fish Audio API Error ({response.status_code}): {error_message}"
                )
                
        except requests.exceptions.RequestException as e:
            # Clean up temp file on error
            try:
                os.unlink(temp_file_path)
            except:
                pass
            print(f"❌ Request Error: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to connect to Fish Audio API: {str(e)}"
            )
        except Exception as e:
            # Clean up temp file on error
            try:
                os.unlink(temp_file_path)
            except:
                pass
            print(f"❌ Error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create voice model: {str(e)}"
            )
        
        # Save voice ID to storage
        save_user_voice_id(user_id, voice_id)
        print(f"Voice ID saved for user: {user_id}")
        
        return {
            "success": True,
            "voice_id": voice_id,
            "message": "Voice model created successfully",
            "user_id": user_id
        }
        
    except APIError as e:
        error_message = str(e)
        print(f"❌ Fish Audio API Error: {error_message}")
        raise HTTPException(
            status_code=500,
            detail=f"Fish Audio API Error: {error_message}"
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error creating voice: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create voice model: {str(e)}"
        )

# ========== PHASE 2: VOICE STATUS ENDPOINT ==========
@app.get("/api/voice-status")
async def get_voice_status(user_id: str = "default"):
    """Check if user has a cloned voice model"""
    voice_id = get_user_voice_id(user_id)
    
    if voice_id:
        return VoiceStatusResponse(
            has_voice=True,
            voice_id=voice_id,
            status="Personal Voice Activated"
        )
    else:
        return VoiceStatusResponse(
            has_voice=False,
            voice_id=None,
            status="Voice Model Not Setup"
        )

# ========== MANUAL VOICE ID SAVE ENDPOINT ==========
@app.post("/api/save-voice-id")
async def save_voice_id(request: dict):
    """
    Save a voice ID manually (for users who create voices in Fish Audio dashboard)
    """
    user_id = request.get('user_id', 'default')
    voice_id = request.get('voice_id', '').strip()
    
    if not voice_id:
        raise HTTPException(status_code=400, detail="Voice ID cannot be empty")
    
    try:
        save_user_voice_id(user_id, voice_id)
        print(f"Voice ID saved manually for user: {user_id}, voice_id: {voice_id}")
        return {
            "success": True,
            "message": "Voice ID saved successfully",
            "user_id": user_id,
            "voice_id": voice_id
        }
    except Exception as e:
        print(f"Error saving voice ID: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save voice ID: {str(e)}"
        )

# ========== PHASE 2: UPDATED TTS GENERATION ==========
@app.post("/generate_speech")
async def generate_speech(request: SpeechRequest):
    """
    Generate speech with emotion. Uses cloned voice if available, falls back to default.
    """
    print("\n" + "="*80)
    print("=== /generate_speech ENDPOINT CALLED ===")
    print("="*80)
    
    # Get text and emotion from request
    text = request.text
    emotion = request.emotion
    user_id = request.user_id or "default"
    
    # Log received data
    import json as json_lib
    print(f"\n[DEBUG] RAW JSON DATA RECEIVED FROM FRONTEND:")
    print(f"  {json_lib.dumps(request.model_dump(), indent=2)}")
    
    print(f"\n[DEBUG] EXTRACTED VARIABLES:")
    print(f"  text: '{text}' (type: {type(text).__name__}, length: {len(text) if text else 0})")
    print(f"  emotion: '{emotion}' (type: {type(emotion).__name__}, length: {len(emotion) if emotion else 0})")
    print(f"  user_id: '{user_id}'")
    
    # Validate and clean inputs
    if not text or not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty and must be a string")
    
    if not emotion or not isinstance(emotion, str):
        emotion = 'neutral'
    
    # Clean the text
    text = text.strip()
    emotion_lower = emotion.lower()
    
    # Remove emotion tags if accidentally typed
    if text.lower().startswith(f'({emotion_lower})'):
        text = text[len(f'({emotion_lower})'):].strip()
        print(f"Warning: Removed emotion tag from text field. Cleaned text: '{text}'")
    
    # Ensure emotion is valid
    valid_emotions = ['happy', 'sad', 'neutral', 'surprised', 'angry']
    if emotion_lower not in valid_emotions:
        print(f"Warning: Invalid emotion '{emotion}', defaulting to 'neutral'")
        emotion_lower = 'neutral'
    
    # Create prompt_text using Text Tag logic
    if emotion_lower == "neutral":
        prompt_text = text
    else:
        prompt_text = f"({emotion_lower}) {text}"
    
    print(f"\n[DEBUG] FINAL prompt_text CONSTRUCTED:")
    print(f"  prompt_text: '{prompt_text}'")
    print(f"  prompt_text length: {len(prompt_text)}")
    
    # Check if Fish Audio client is available
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="Fish Audio client not initialized. Please set FISH_AUDIO_API_KEY environment variable."
        )
    
    # ========== PHASE 2: RETRIEVE CLONED VOICE ID ==========
    user_voice_id = get_user_voice_id(user_id)
    voice_id_to_use = user_voice_id if user_voice_id else default_voice_id
    
    print(f"\n[DEBUG] VOICE SELECTION:")
    print(f"  User ID: {user_id}")
    print(f"  Cloned voice ID: {user_voice_id or 'None'}")
    print(f"  Default voice ID: {default_voice_id or 'None'}")
    print(f"  Using voice ID: {voice_id_to_use or 'None (will use default)'}")
    
    try:
        # Get voice parameters based on emotion
        voice_params = EMOTION_VOICE_PARAMS.get(emotion_lower, EMOTION_VOICE_PARAMS['neutral'])
        
        # Create TTS config
        tts_config = TTSConfig(
            format='mp3',
            normalize=True,
            latency='balanced',
            temperature=0.7,
            top_p=0.7
        )
        
        convert_params = {
            'text': prompt_text,
            'speed': voice_params.get('speed', 1.0),
            'model': 's1',
            'config': tts_config
        }
        
        # Add voice ID (cloned voice if available, otherwise default)
        if voice_id_to_use:
            convert_params['reference_id'] = voice_id_to_use
            print(f"  ✅ Using {'cloned' if user_voice_id else 'default'} voice: {voice_id_to_use}")
        else:
            print(f"  ⚠️ No voice ID available, using default model")
        
        # Log parameters
        print(f"\n[DEBUG] PARAMETERS BEING SENT TO FISH AUDIO API:")
        print(f"  convert_params: {json_lib.dumps({k: str(v) if k != 'config' else 'TTSConfig' for k, v in convert_params.items()}, indent=2)}")
        
        # Call Fish Audio API with retry logic
        print(f"\n[DEBUG] CALLING client.tts.convert()...")
        max_retries = 3
        retry_delay = 1
        
        for attempt in range(max_retries):
            try:
                audio_bytes = client.tts.convert(**convert_params)
                print(f"[DEBUG] ✅ SUCCESS: client.tts.convert() returned audio bytes")
                print(f"  Audio bytes length: {len(audio_bytes)} bytes")
                break
            except APIError as e:
                error_message = str(e)
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                    print(f"[DEBUG] ⚠️ Attempt {attempt + 1} failed: {error_message}")
                    print(f"  Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    print(f"[DEBUG] ❌ FAILURE after {max_retries} attempts: {error_message}")
                    raise
            except Exception as convert_error:
                print(f"[DEBUG] ❌ FAILURE: client.tts.convert() raised exception")
                print(f"  Exception type: {type(convert_error).__name__}")
                print(f"  Exception message: {str(convert_error)}")
                import traceback
                traceback.print_exc()
                raise
        
        print(f"\n[DEBUG] RETURNING AUDIO RESPONSE TO FRONTEND")
        print("="*80 + "\n")
        
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
