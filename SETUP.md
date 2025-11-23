# Setup Guide

## Prerequisites

1. **Get a Fish Audio API Key:**
   - Sign up at [https://fish.audio](https://fish.audio)
   - Get your API key from the dashboard
   - Make sure you have credits/balance in your account

## Installation Steps

### 1. Install Dependencies

```bash
cd github_repo
pip install -r requirements.txt
```

This will install:
- FastAPI
- Uvicorn
- Pydantic
- fish-audio-sdk

### 2. Set Your API Key

**PowerShell:**
```powershell
$env:FISH_AUDIO_API_KEY="your_api_key_here"
```

**Command Prompt (CMD):**
```cmd
set FISH_AUDIO_API_KEY=your_api_key_here
```

**Linux/Mac:**
```bash
export FISH_AUDIO_API_KEY=your_api_key_here
```

### 3. Start the Backend

```bash
python main.py
```

You should see:
```
Fish Audio client initialized successfully
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 4. Start the Frontend

In a **new terminal**:

```bash
cd github_repo
python -m http.server 8080
```

Then open: `http://localhost:8080/index.html`

## How It Works

1. Frontend detects emotion and sends: `{"text": "Hello", "emotion": "happy"}`
2. Backend creates prompt: `(happy) Hello`
3. Backend calls Fish Audio API to generate speech
4. Backend returns MP3 audio file
5. Frontend plays the audio

## Troubleshooting

### "Fish Audio client not initialized"
- Make sure you set the `FISH_AUDIO_API_KEY` environment variable
- Restart the backend after setting the variable

### "Invalid API key or insufficient balance"
- Check your API key is correct
- Verify you have credits in your Fish Audio account
- Get a new API key if needed

### Audio doesn't play
- Check browser console for errors
- Verify backend is running and receiving requests
- Check backend terminal for error messages

