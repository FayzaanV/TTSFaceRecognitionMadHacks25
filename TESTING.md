# Testing Guide

## Quick Test Steps

### 1. Start the Backend

Open a terminal in the `github_repo` folder and run:

```bash
cd github_repo
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 2. Test the Backend (Option A: Python Script)

In a **new terminal** (keep the backend running), run:

```bash
cd github_repo
pip install requests  # If not already installed
python test_backend.py
```

This will send test requests and verify the backend responds correctly.

### 3. Test the Backend (Option B: Browser/Postman)

1. Open your browser and go to: `http://127.0.0.1:8000/`
   - You should see: `{"message":"Expressive AAC Board API is running"}`

2. Test the endpoint using browser console or Postman:
   - URL: `http://127.0.0.1:8000/generate_speech`
   - Method: POST
   - Headers: `Content-Type: application/json`
   - Body:
     ```json
     {
       "text": "Hello",
       "emotion": "happy"
     }
     ```

### 4. Test the Full Stack (Frontend + Backend)

1. **Keep the backend running** (from step 1)

2. **Start a simple HTTP server** for the frontend (in a new terminal):
   ```bash
   cd github_repo
   python -m http.server 8080
   ```

3. **Open your browser** and go to: `http://localhost:8080/index.html`

4. **Test the application:**
   - The frontend should connect to the backend at `http://127.0.0.1:8000`
   - When you use the nose tracking to type and click "SPEAK", it should call the backend
   - Check the backend terminal to see: `SIMULATING AI with prompt: (happy) Hello` (or similar)

## Expected Behavior

### Backend Console Output

When you send a request, you should see:
```
SIMULATING AI with prompt: (happy) Hello
INFO:     127.0.0.1:xxxxx - "POST /generate_speech HTTP/1.1" 200 OK
```

### Frontend Behavior

- The frontend sends POST requests to `http://127.0.0.1:8000/generate_speech`
- It receives the dummy audio file
- The audio should play in the browser

## Troubleshooting

### Backend won't start
- Make sure you're in the `github_repo` folder
- Check that `dummy_output.wav` exists in the folder
- Verify Python dependencies are installed: `pip install -r requirements.txt`

### Frontend can't connect to backend
- Make sure backend is running on port 8000
- Check browser console for CORS errors (shouldn't happen with our CORS settings)
- Verify the frontend is calling `http://127.0.0.1:8000/generate_speech`

### No audio plays
- Check that `dummy_output.wav` exists in `github_repo` folder
- Check browser console for errors
- Verify the backend is returning the file correctly

