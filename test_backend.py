"""
Simple test script to verify the backend is working.
Run this after starting the backend server.
"""
import requests
import json

# Test the backend endpoint
def test_backend():
    url = "http://127.0.0.1:8000/generate_speech"
    
    # Test case 1: Happy emotion
    print("Test 1: Sending 'Hello' with 'happy' emotion...")
    response1 = requests.post(url, json={"text": "Hello", "emotion": "happy"})
    print(f"Status: {response1.status_code}")
    if response1.status_code == 200:
        print("✓ Success! Received audio file")
        print(f"Content-Type: {response1.headers.get('Content-Type')}")
    else:
        print(f"✗ Error: {response1.text}")
    
    print("\n" + "="*50 + "\n")
    
    # Test case 2: Neutral emotion
    print("Test 2: Sending 'Hello' with 'neutral' emotion...")
    response2 = requests.post(url, json={"text": "Hello", "emotion": "neutral"})
    print(f"Status: {response2.status_code}")
    if response2.status_code == 200:
        print("✓ Success! Received audio file")
        print(f"Content-Type: {response2.headers.get('Content-Type')}")
    else:
        print(f"✗ Error: {response2.text}")
    
    print("\n" + "="*50 + "\n")
    
    # Test case 3: Sad emotion
    print("Test 3: Sending 'No' with 'sad' emotion...")
    response3 = requests.post(url, json={"text": "No", "emotion": "sad"})
    print(f"Status: {response3.status_code}")
    if response3.status_code == 200:
        print("✓ Success! Received audio file")
        print(f"Content-Type: {response3.headers.get('Content-Type')}")
    else:
        print(f"✗ Error: {response3.text}")

if __name__ == "__main__":
    print("Testing backend at http://127.0.0.1:8000")
    print("Make sure the backend is running (python main.py)\n")
    try:
        test_backend()
    except requests.exceptions.ConnectionError:
        print("✗ Error: Could not connect to backend.")
        print("Make sure the backend is running: python main.py")
    except Exception as e:
        print(f"✗ Error: {e}")

