"""
Helper script to list available Fish Audio voices.
Run this to see available voices and their IDs, then you can set a specific one in main.py
"""
import os
from fishaudio import FishAudio

api_key = os.getenv("FISH_AUDIO_API_KEY")
if not api_key:
    print("Error: FISH_AUDIO_API_KEY environment variable not set.")
    print("Set it with: $env:FISH_AUDIO_API_KEY='your_api_key' (PowerShell)")
    exit(1)

try:
    client = FishAudio(api_key=api_key)
    print("Fetching available voices...\n")
    
    # List English American voices first
    print("English American voices:")
    print("-" * 80)
    voices = client.voices.list(language="en", tags="american", page_size=50)
    
    if voices.items:
        for i, voice in enumerate(voices.items, 1):
            print(f"{i}. {voice.title}")
            print(f"   ID: {voice.id}")
            if hasattr(voice, 'language'):
                print(f"   Language: {voice.language}")
            if hasattr(voice, 'tags'):
                print(f"   Tags: {voice.tags}")
            print()
    else:
        print("No American accent voices found.\n")
    
    # List all English voices as fallback
    print("\nAll English voices:")
    print("-" * 80)
    voices = client.voices.list(language="en", page_size=50)
    
    print(f"Found {voices.total} voice(s):\n")
    print("-" * 80)
    
    for i, voice in enumerate(voices.items, 1):
        print(f"{i}. {voice.title}")
        print(f"   ID: {voice.id}")
        if hasattr(voice, 'language'):
            print(f"   Language: {voice.language}")
        if hasattr(voice, 'tags'):
            print(f"   Tags: {voice.tags}")
        print()
    
    print("-" * 80)
    print(f"\nTo use a specific voice, the code will automatically use the first one.")
    print(f"Or you can modify main.py to use a specific voice ID.")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

