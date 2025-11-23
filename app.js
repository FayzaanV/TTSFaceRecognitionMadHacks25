// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const canvasCtx = canvas.getContext('2d');
const keyboardCursor = document.getElementById('keyboardCursor');
const keyboardWrapper = document.querySelector('.keyboard-wrapper');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
const coordX = document.getElementById('coordX');
const coordY = document.getElementById('coordY');
const textOutput = document.getElementById('textOutput');
const keyboard = document.getElementById('keyboard');
const keys = document.querySelectorAll('.key');
const emotionIcon = document.getElementById('emotionIcon');
const emotionLabel = document.getElementById('emotionLabel');
const confidenceFill = document.getElementById('confidenceFill');
const confidenceText = document.getElementById('confidenceText');
const voiceRadios = document.querySelectorAll('input[name="voice"]');

// State
let camera = null;
let faceMesh = null;
let isTracking = false;
let selectedVoice = 'female'; // Default voice selection

// face-api.js model state
let emotionModelsLoaded = false;
let emotionModelLoading = false;
let lastEmotionDetectionTime = 0;
const EMOTION_DETECTION_INTERVAL = 100; // Throttle to ~10 FPS (100ms between detections)
let emotionDetectionPending = false; // Flag to prevent concurrent detections
let emotionDetectionPromise = null; // Track the latest detection promise

// Smoothing variables
let smoothedX = 0;
let smoothedY = 0;
const smoothingFactor = 0.3; // Lower = smoother but more lag

// Keyboard state
let currentText = '';

// Universal element interaction state (for full-page accessibility)
let hoveredElement = null;
let dwellStartTime = null;
const dwellTime = 500; // 0.5 seconds in milliseconds
let dwellTimeout = null;

// Emotion state
let currentEmotion = 'neutral';

// Speak cooldown state (prevents spam)
let speakCooldown = false;
let emotionConfidence = 0;

// Emotion stabilization (prevent flickering)
let emotionBuffer = [];
const EMOTION_BUFFER_SIZE = 4; // Number of frames to consider (reduced for better responsiveness)
const EMOTION_THRESHOLD = 0.5;  // 50% of frames must agree (2 out of 4 frames)
const NON_NEUTRAL_CONFIDENCE_THRESHOLD = 0.7; // High confidence threshold for non-neutral emotions (increased to reduce false positives)

// Emotion lock (maintain emotion for 2 seconds after change - reduced for better responsiveness)
let emotionLocked = false;
let emotionLockTimeout = null;
const EMOTION_LOCK_DURATION = 2000; // 2 seconds

// Emotion icons mapping
const EMOTION_ICONS = {
    happy: '😊',
    sad: '😢',
    neutral: '😐',
    surprised: '😲',
    angry: '😠'
};

// MediaPipe Face Mesh configuration
function initFaceMesh() {
    faceMesh = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);
}

// Initialize face-api.js emotion recognition models
async function initEmotionModel() {
    if (emotionModelsLoaded || emotionModelLoading) {
        return;
    }

    emotionModelLoading = true;
    status.textContent = 'Loading emotion models...';
    status.style.color = '#f59e0b';

    try {
        // Check if face-api is available
        if (typeof faceapi === 'undefined') {
            console.error('face-api.js not loaded');
            status.textContent = 'Emotion models failed to load';
            status.style.color = '#ef4444';
            emotionModelLoading = false;
            return;
        }

        // Load models from CDN
        // Try multiple CDN options for reliability (GitHub raw is most reliable)
        const MODEL_URLS = [
            'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights',
            'https://unpkg.com/face-api.js@0.22.2/weights',
            'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'
        ];
        
        let modelLoaded = false;
        let lastError = null;
        
        // Try each CDN until one works
        for (const MODEL_URL of MODEL_URLS) {
            try {
                console.log(`Attempting to load models from: ${MODEL_URL}`);
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
                ]);
                modelLoaded = true;
                console.log(`Successfully loaded models from: ${MODEL_URL}`);
                break;
            } catch (error) {
                console.warn(`Failed to load from ${MODEL_URL}:`, error);
                lastError = error;
                continue;
            }
        }
        
        if (!modelLoaded) {
            throw new Error(`Failed to load models from all CDNs. Last error: ${lastError?.message}`);
        }

        emotionModelsLoaded = true;
        emotionModelLoading = false;
        console.log('Emotion models loaded successfully');
        
        if (status.textContent.includes('Loading emotion models')) {
            status.textContent = 'Models loaded - Click "Start Camera" to begin';
            status.style.color = '#10b981';
        }
    } catch (error) {
        console.error('Error loading emotion models:', error);
        emotionModelLoading = false;
        status.textContent = 'Emotion models failed to load - using fallback';
        status.style.color = '#ef4444';
    }
}

// Process face mesh results
function onResults(results) {
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Clear canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // Draw face mesh (optional - can be removed for cleaner look)
        drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {
            color: '#C0C0C070',
            lineWidth: 1
        });

        // Nose tip is landmark index 1
        const noseTip = landmarks[1];

        // Convert normalized coordinates to pixel coordinates
        const x = noseTip.x * canvas.width;
        const y = noseTip.y * canvas.height;

        // Apply smoothing
        smoothedX = smoothedX + (x - smoothedX) * smoothingFactor;
        smoothedY = smoothedY + (y - smoothedY) * smoothingFactor;

        // Draw nose point on canvas
        canvasCtx.beginPath();
        canvasCtx.arc(smoothedX, smoothedY, 10, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#FF0000';
        canvasCtx.fill();
        canvasCtx.strokeStyle = '#FFFFFF';
        canvasCtx.lineWidth = 3;
        canvasCtx.stroke();

        // Map nose position to full viewport cursor (full-page accessibility)
        // Use normalized coordinates (0-1) from noseTip

        // Map nose position (invert X for natural movement)
        let normalizedX = 1 - noseTip.x; // Invert X for natural left-right
        let normalizedY = noseTip.y;

        // Apply sensitivity multiplier for easier movement (higher = more sensitive)
        // Separate sensitivity for X and Y axes - Y needs more sensitivity for up/down
        const sensitivityX = 4.0;  // Increased from 2.5 for tilting instead of full head movement
        const sensitivityY = 5.0;  // Increased from 3.5 for easier vertical navigation
        normalizedX = (normalizedX - 0.5) * sensitivityX + 0.5;
        normalizedY = (normalizedY - 0.5) * sensitivityY + 0.5;

        // Clamp values to stay within bounds [0, 1]
        normalizedX = Math.max(0, Math.min(1, normalizedX));
        normalizedY = Math.max(0, Math.min(1, normalizedY));

        // Calculate cursor position within FULL VIEWPORT bounds
        const cursorX = normalizedX * window.innerWidth;
        const cursorY = normalizedY * window.innerHeight;

        // Update cursor position (fixed positioning relative to viewport)
        keyboardCursor.style.left = `${cursorX}px`;
        keyboardCursor.style.top = `${cursorY}px`;
        keyboardCursor.classList.add('active');

        // Update coordinates display
        coordX.textContent = Math.round(normalizedX * 100);
        coordY.textContent = Math.round(normalizedY * 100);

        // Detect and update emotion using ML (async, non-blocking)
        // Only detect if models are loaded and no detection is already pending
        if (emotionModelsLoaded && !emotionDetectionPending) {
            emotionDetectionPending = true;
            emotionDetectionPromise = detectEmotion()
                .then((result) => {
                    // Skip if throttled (result is null)
                    if (result === null) {
                        emotionDetectionPending = false;
                        return;
                    }
                    const { emotion, confidence } = result;
                    if (Math.random() < 0.1) { // Log occasionally
                        console.log('[onResults] Emotion detected:', emotion, 'confidence:', confidence);
                    }
                    updateEmotionUI(emotion, confidence);
                    emotionDetectionPending = false;
                })
                .catch(error => {
                    console.error('[onResults] Emotion detection error:', error);
                    // Fallback to neutral on error
                    updateEmotionUI('neutral', 0.5);
                    emotionDetectionPending = false;
                });
        } else if (!emotionModelsLoaded && !emotionModelLoading) {
            // Models not loaded yet, show status
            console.warn('[onResults] Emotion models not loaded yet. emotionModelsLoaded:', emotionModelsLoaded);
        }

        status.textContent = 'Tracking active - Move your nose!';
        status.style.color = '#10b981';
    } else {
        keyboardCursor.classList.remove('active');
        status.textContent = 'No face detected';
        status.style.color = '#ef4444';
    }

    canvasCtx.restore();

    // Check element interaction (full-page accessibility)
    if (isTracking) {
        checkElementHover();
    }
}

// Universal element hover detection (full-page accessibility)
function checkElementHover() {
    const cursorRect = keyboardCursor.getBoundingClientRect();
    const cursorCenterX = cursorRect.left + cursorRect.width / 2;
    const cursorCenterY = cursorRect.top + cursorRect.height / 2;

    // Get all elements under the cursor center point
    const elementsAtPoint = document.elementsFromPoint(cursorCenterX, cursorCenterY);

    // Find first interactive element (buttons, keyboard keys, voice options)
    let foundElement = null;
    for (const element of elementsAtPoint) {
        // Check for keyboard keys
        if (element.classList.contains('key')) {
            foundElement = element;
            break;
        }
        // Check for control buttons (Start/Stop Camera)
        if (element.id === 'startBtn' || element.id === 'stopBtn') {
            foundElement = element;
            break;
        }
        // Check for voice selector labels
        if (element.classList.contains('voice-option')) {
            foundElement = element;
            break;
        }
    }

    // Handle element hover state change
    if (foundElement !== hoveredElement) {
        // Clear previous hover
        if (hoveredElement) {
            // Remove hover class based on element type
            if (hoveredElement.classList.contains('key')) {
                hoveredElement.classList.remove('hovering');
            } else {
                hoveredElement.classList.remove('nose-hovering');
            }
            clearTimeout(dwellTimeout);
            dwellTimeout = null;
        }

        // Set new hover
        hoveredElement = foundElement;

        if (hoveredElement) {
            // Add hover class based on element type
            if (hoveredElement.classList.contains('key')) {
                hoveredElement.classList.add('hovering');
            } else {
                hoveredElement.classList.add('nose-hovering');
            }
            dwellStartTime = Date.now();

            // Start dwell timer
            dwellTimeout = setTimeout(() => {
                selectElement(hoveredElement);
            }, dwellTime);
        }
    }
}

// Universal element selection (handles all interactive elements)
function selectElement(element) {
    // Add selection visual feedback
    if (element.classList.contains('key')) {
        element.classList.add('selecting');
        setTimeout(() => {
            element.classList.remove('selecting', 'hovering');
        }, 200);
    } else {
        element.classList.remove('nose-hovering');
    }

    // Handle different element types
    if (element.classList.contains('key')) {
        // Keyboard key selected
        const keyValue = element.getAttribute('data-key');

        // Handle different key types
        if (keyValue === 'BACKSPACE') {
            currentText = currentText.slice(0, -1);
        } else if (keyValue === 'CLEAR') {
            currentText = '';
        } else if (keyValue === 'ENTER') {
            // Check cooldown before speaking
            if (speakCooldown) {
                console.log('SPEAK button on cooldown, please wait...');
                status.textContent = 'Please wait (cooldown)...';
                status.style.color = '#f59e0b';
                return;
            }

            // DEBUG: Log emotion state at button press
            console.log('=== SPEAK BUTTON PRESSED ===');
            console.log('currentEmotion value:', currentEmotion);
            console.log('currentEmotion type:', typeof currentEmotion);
            console.log('emotionConfidence:', emotionConfidence);

            // Trigger text-to-speech with detected emotion
            speakText(currentText, currentEmotion);

            // Set cooldown for 2 seconds
            speakCooldown = true;
            setTimeout(() => {
                speakCooldown = false;
                console.log('SPEAK button cooldown expired');
            }, 2000);
        } else {
            currentText += keyValue;
        }

        // Update text display
        textOutput.textContent = currentText;
    } else if (element.id === 'startBtn') {
        // Start Camera button selected
        if (!element.disabled) {
            startTracking();
        }
    } else if (element.id === 'stopBtn') {
        // Stop Camera button selected
        if (!element.disabled) {
            stopTracking();
        }
    } else if (element.classList.contains('voice-option')) {
        // Voice selector option selected
        const radioInput = element.querySelector('input[type="radio"]');
        if (radioInput) {
            radioInput.checked = true;
            selectedVoice = radioInput.value;
            console.log(`Voice changed to: ${selectedVoice} (via nose selection)`);
        }
    }

    // Clear hover state
    hoveredElement = null;
    clearTimeout(dwellTimeout);
    dwellTimeout = null;
}

// ML-based emotion detection using face-api.js
async function detectEmotion() {
    // Check if models are loaded
    if (!emotionModelsLoaded) {
        console.warn('[detectEmotion] Models not loaded. emotionModelsLoaded:', emotionModelsLoaded);
        // Fallback to neutral if models not loaded
        return { emotion: 'neutral', confidence: 0.5 };
    }

    // Throttle emotion detection to avoid performance issues
    const now = Date.now();
    if (now - lastEmotionDetectionTime < EMOTION_DETECTION_INTERVAL) {
        // Don't return cached - instead, skip this detection entirely
        // This prevents stale cached values from being used
        // The pending flag will prevent multiple concurrent calls anyway
        return null; // Signal to skip this detection
    }
    lastEmotionDetectionTime = now;
    if (Math.random() < 0.1) { // Log occasionally
        console.log('[detectEmotion] Running detection...');
    }

    try {
        // Check if face-api is available
        if (typeof faceapi === 'undefined') {
            console.warn('face-api.js not available');
            return { emotion: 'neutral', confidence: 0.5 };
        }

        // Check if video is ready
        if (!video || video.readyState < 2) {
            console.warn('Video not ready for emotion detection');
            return { emotion: 'neutral', confidence: 0.3 };
        }

        // Detect face and expressions in the video frame
        // Use smaller input size for better performance
        const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
            .withFaceExpressions();

        if (!detection) {
            // No face detected, return neutral
            console.debug('No face detected by face-api.js');
            return { emotion: 'neutral', confidence: 0.3 };
        }

        // Get emotion expressions from face-api.js
        // face-api.js returns: { neutral, happy, sad, angry, fearful, disgusted, surprised }
        const expressions = detection.expressions;
        
        // Debug: log all expressions (only log occasionally to reduce console spam)
        if (Math.random() < 0.1) { // Log ~10% of the time
            console.log('Face-api.js expressions:', expressions);
        }

        // Map face-api.js emotions to our 5 emotions
        // face-api.js uses: happy, sad, angry, surprised, neutral, fearful, disgusted
        // We need: happy, sad, neutral, surprised, angry
        const emotionMap = {
            'happy': expressions.happy || 0,
            'sad': expressions.sad || 0,
            'neutral': expressions.neutral || 0,
            'surprised': expressions.surprised || 0,
            'angry': expressions.angry || 0
        };
        
        // Debug: log emotion map when sad/angry are detected or when they're close
        // Always log when sad/angry are above threshold to help debug
        if (emotionMap.sad > 0.08 || emotionMap.angry > 0.10 || Math.random() < 0.05) {
            console.log('[detectEmotion] Raw emotion probabilities:', {
                happy: (emotionMap.happy * 100).toFixed(1) + '%',
                sad: (emotionMap.sad * 100).toFixed(1) + '%',
                angry: (emotionMap.angry * 100).toFixed(1) + '%',
                surprised: (emotionMap.surprised * 100).toFixed(1) + '%',
                neutral: (emotionMap.neutral * 100).toFixed(1) + '%'
            });
            if (emotionMap.sad > 0.08) {
                console.log(`[detectEmotion] 🔍 Sad detected at ${(emotionMap.sad * 100).toFixed(1)}%, neutral at ${(emotionMap.neutral * 100).toFixed(1)}%`);
            }
            if (emotionMap.angry > 0.10) {
                console.log(`[detectEmotion] 🔍 Angry detected at ${(emotionMap.angry * 100).toFixed(1)}%, neutral at ${(emotionMap.neutral * 100).toFixed(1)}%`);
            }
        }

        // Find emotion with highest probability
        // Very aggressive handling for subtle emotions like sad and angry
        // face-api.js often under-detects these, so we need to be very lenient
        const SAD_MIN_THRESHOLD = 0.08; // Very low threshold for sad (8% - very sensitive)
        const ANGRY_MIN_THRESHOLD = 0.10; // Low threshold for angry (10%)
        const OTHER_NON_NEUTRAL_MIN_THRESHOLD = 0.25; // Threshold for other emotions
        
        let maxEmotion = 'neutral';
        let maxConfidence = emotionMap.neutral;
        
        // VERY AGGRESSIVE handling for sad: prioritize it heavily
        // If sad is above a very low threshold, give it priority even if neutral is much higher
        if (emotionMap.sad >= SAD_MIN_THRESHOLD) {
            // If sad is within 0.35 of neutral (very lenient), prefer sad
            // This helps catch even very subtle sad expressions (frowns, downturned lips)
            if (emotionMap.sad >= emotionMap.neutral - 0.35) {
                maxEmotion = 'sad';
                maxConfidence = emotionMap.sad;
                console.log(`[detectEmotion] ✅ Prioritizing SAD (${emotionMap.sad.toFixed(2)}) over neutral (${emotionMap.neutral.toFixed(2)})`);
            } else {
                // Even if not within range, if sad is above threshold and neutral isn't dominant, still consider it
                if (emotionMap.neutral < 0.7 && emotionMap.sad > 0.1) {
                    maxEmotion = 'sad';
                    maxConfidence = emotionMap.sad;
                    console.log(`[detectEmotion] ✅ Choosing SAD (${emotionMap.sad.toFixed(2)}) - neutral not dominant (${emotionMap.neutral.toFixed(2)})`);
                }
            }
        }
        
        // AGGRESSIVE handling for angry: prioritize it if sad didn't win
        if (emotionMap.angry >= ANGRY_MIN_THRESHOLD && maxEmotion === 'neutral') {
            // If angry is within 0.30 of neutral, prefer angry
            if (emotionMap.angry >= emotionMap.neutral - 0.30) {
                maxEmotion = 'angry';
                maxConfidence = emotionMap.angry;
                console.log(`[detectEmotion] ✅ Prioritizing ANGRY (${emotionMap.angry.toFixed(2)}) over neutral (${emotionMap.neutral.toFixed(2)})`);
            } else {
                // Even if not within range, if angry is above threshold and neutral isn't dominant, still consider it
                if (emotionMap.neutral < 0.7 && emotionMap.angry > 0.12) {
                    maxEmotion = 'angry';
                    maxConfidence = emotionMap.angry;
                    console.log(`[detectEmotion] ✅ Choosing ANGRY (${emotionMap.angry.toFixed(2)}) - neutral not dominant (${emotionMap.neutral.toFixed(2)})`);
                }
            }
        }
        
        // For other non-neutral emotions (happy, surprised), use standard logic
        if (maxEmotion === 'neutral') {
            let bestNonNeutral = null;
            let bestNonNeutralConf = 0;
            
            // Check happy and surprised
            for (const [emotion, confidence] of Object.entries(emotionMap)) {
                if (emotion !== 'neutral' && emotion !== 'sad' && emotion !== 'angry' && confidence > bestNonNeutralConf) {
                    bestNonNeutralConf = confidence;
                    bestNonNeutral = emotion;
                }
            }
            
            // If we have a non-neutral emotion above threshold, prefer it
            if (bestNonNeutral && bestNonNeutralConf >= OTHER_NON_NEUTRAL_MIN_THRESHOLD) {
                // If non-neutral is within 0.15 of neutral, prefer non-neutral
                if (bestNonNeutralConf >= emotionMap.neutral - 0.15) {
                    maxEmotion = bestNonNeutral;
                    maxConfidence = bestNonNeutralConf;
                    if (Math.random() < 0.1) {
                        console.log(`[detectEmotion] Prioritizing non-neutral emotion: ${bestNonNeutral} (${bestNonNeutralConf.toFixed(2)}) over neutral (${emotionMap.neutral.toFixed(2)})`);
                    }
                }
            }
            
            // Fallback: if no special case matched, use the emotion with highest confidence
            if (maxEmotion === 'neutral') {
                for (const [emotion, confidence] of Object.entries(emotionMap)) {
                    if (confidence > maxConfidence) {
                        maxConfidence = confidence;
                        maxEmotion = emotion;
                    }
                }
            }
        }

        // Debug: log detected emotion (only occasionally to reduce console spam)
        if (Math.random() < 0.1) { // Log ~10% of the time
            console.log(`[detectEmotion] Detected emotion: ${maxEmotion} (confidence: ${maxConfidence.toFixed(2)})`);
        }

        // Return detected emotion and confidence
        return { 
            emotion: maxEmotion, 
            confidence: Math.min(maxConfidence, 0.99) // Cap at 0.99 for display
        };

    } catch (error) {
        console.error('Error in ML emotion detection:', error);
        // Fallback to neutral on error
        return { emotion: 'neutral', confidence: 0.5 };
    }
}

// Update emotion UI with stabilization and 5-second lock
function updateEmotionUI(emotion, confidence) {
    console.log(`[updateEmotionUI] Called with emotion: ${emotion}, confidence: ${confidence}, locked: ${emotionLocked}`);
    
    // If emotion is locked, don't update
    if (emotionLocked) {
        console.log('[updateEmotionUI] Emotion is locked, skipping update');
        return;
    }

    // Add detected emotion to buffer (single entry - no weighting to prevent dominance)
    // Remove oldest entry if buffer is full
    if (emotionBuffer.length >= EMOTION_BUFFER_SIZE) {
        emotionBuffer.shift();
    }
    
    emotionBuffer.push(emotion);
    
    // Log high confidence detections for debugging
    if (emotion !== 'neutral' && confidence >= NON_NEUTRAL_CONFIDENCE_THRESHOLD) {
        console.log(`[updateEmotionUI] High confidence ${emotion} detected (${(confidence * 100).toFixed(0)}%)`);
    }

    // Calculate majority emotion from buffer
    const emotionCounts = {};
    emotionBuffer.forEach(e => {
        emotionCounts[e] = (emotionCounts[e] || 0) + 1;
    });

    // Find emotion with highest count
    let stabilizedEmotion = currentEmotion;
    let maxCount = 0;
    for (const [emo, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
            maxCount = count;
            stabilizedEmotion = emo;
        }
    }

    // Check if recent emotions (last 2-3 entries) agree on a new emotion
    // This allows new emotions to override old ones more quickly
    let recentStabilizedEmotion = stabilizedEmotion;
    if (emotionBuffer.length >= 3) {
        const recentEmotions = emotionBuffer.slice(-3); // Last 3 entries
        const recentCounts = {};
        recentEmotions.forEach(e => {
            recentCounts[e] = (recentCounts[e] || 0) + 1;
        });
        const recentMax = Math.max(...Object.values(recentCounts));
        const recentEmotion = Object.keys(recentCounts).find(e => recentCounts[e] === recentMax);
        // If recent emotion has 2+ out of 3, prioritize it
        if (recentEmotion && recentCounts[recentEmotion] >= 2) {
            recentStabilizedEmotion = recentEmotion;
        }
    }

    // Only change emotion if it exceeds threshold OR if recent emotions strongly agree
    const agreementRatio = maxCount / emotionBuffer.length;
    const recentAgreement = emotionBuffer.length >= 3 ? 
        (emotionBuffer.slice(-3).filter(e => e === recentStabilizedEmotion).length / 3) : 0;
    
    const shouldChange = (agreementRatio >= EMOTION_THRESHOLD && stabilizedEmotion !== currentEmotion) ||
                        (recentAgreement >= 0.67 && recentStabilizedEmotion !== currentEmotion && recentStabilizedEmotion !== 'neutral');
    
    if (shouldChange) {
        const newEmotion = recentAgreement >= 0.67 ? recentStabilizedEmotion : stabilizedEmotion;
        console.log('[EMOTION CHANGED] From:', currentEmotion, 'To:', newEmotion,
                    `(Overall: ${Math.round(agreementRatio * 100)}%, Recent: ${Math.round(recentAgreement * 100)}% agreement)`);
        currentEmotion = newEmotion;

        // Lock emotion for 2 seconds
        emotionLocked = true;
        if (emotionLockTimeout) {
            clearTimeout(emotionLockTimeout);
        }
        emotionLockTimeout = setTimeout(() => {
            emotionLocked = false;
            console.log('[EMOTION UNLOCKED] Can change emotion again');
        }, EMOTION_LOCK_DURATION);
        console.log(`[EMOTION LOCKED] Locked for ${EMOTION_LOCK_DURATION / 1000} seconds`);
    }

    emotionConfidence = confidence;

    // Display logic: Prioritize recent emotions for immediate feedback
    let displayEmotion = currentEmotion;
    
    if (emotionBuffer.length >= 2) {
        // Check last 2 entries - if they agree, show that emotion immediately
        const lastTwo = emotionBuffer.slice(-2);
        if (lastTwo[0] === lastTwo[1] && lastTwo[0] !== currentEmotion) {
            displayEmotion = lastTwo[0];
        } else if (agreementRatio >= EMOTION_THRESHOLD) {
            // Otherwise use stabilized emotion if threshold met
            displayEmotion = stabilizedEmotion;
        } else {
            // Fallback to most recent
            displayEmotion = emotion;
        }
    } else {
        // Buffer not full yet, show latest detected
        displayEmotion = emotion;
    }
    
    emotionIcon.textContent = EMOTION_ICONS[displayEmotion];
    emotionLabel.textContent = displayEmotion.charAt(0).toUpperCase() + displayEmotion.slice(1);
    confidenceFill.style.width = `${confidence * 100}%`;
    confidenceText.textContent = `${Math.round(confidence * 100)}%`;
    
    console.log(`[updateEmotionUI] UI updated - Display: ${displayEmotion}, Current: ${currentEmotion}, Stabilized: ${stabilizedEmotion}, Buffer: ${emotionBuffer.length}, Agreement: ${(agreementRatio * 100).toFixed(0)}%`);
}

// Fish Audio TTS function
async function speakText(text, emotion) {
    if (!text || text.trim() === '') {
        alert('Please type some text first!');
        return;
    }

    try {
        // Show loading state
        status.textContent = 'Generating speech...';
        status.style.color = '#3b82f6';

        // DEBUG: Log emotion parameter received
        console.log('=== speakText() called ===');
        console.log('emotion parameter:', emotion);
        console.log('emotion type:', typeof emotion);
        console.log('CONFIG.EMOTION_VOICE_PARAMS:', CONFIG.EMOTION_VOICE_PARAMS);
        console.log('CONFIG.EMOTION_VOICE_PARAMS[emotion]:', CONFIG.EMOTION_VOICE_PARAMS[emotion]);

        // Get voice parameters based on emotion
        const voiceParams = CONFIG.EMOTION_VOICE_PARAMS[emotion] || CONFIG.EMOTION_VOICE_PARAMS.neutral;

        console.log('voiceParams object:', voiceParams);
        console.log('voiceParams.speed:', voiceParams.speed);

        // Get selected voice reference ID (male/female)
        const voiceReferenceId = CONFIG.VOICE_REFERENCES[selectedVoice];

        // Debug logging
        console.log('=== Fish Audio TTS Request ===');
        console.log('Text:', text);
        console.log('Emotion:', emotion);
        console.log('Selected Voice:', selectedVoice);
        console.log('Voice Reference ID:', voiceReferenceId);
        console.log('Speed (from emotion):', voiceParams.speed);
        console.log('Volume (from emotion):', voiceParams.volume);

        // Convert numbers to words for better TTS pronunciation
        const processedText = convertTextNumbers(text);
        console.log('Original text:', text);
        console.log('Processed text (numbers→words):', processedText);

        // Prepare request payload for FastAPI backend
        // Include user_id to retrieve cloned voice if available
        const requestBody = {
            text: processedText,  // Text with numbers converted to words
            emotion: emotion,
            user_id: USER_ID  // Include user ID for voice cloning
        };

        console.log('Request Body:', JSON.stringify(requestBody, null, 2));
        console.log('User ID:', USER_ID);
        console.log('User Voice ID:', userVoiceId || 'None (will use default)');

        // Call FastAPI backend
        const response = await fetch('http://127.0.0.1:8000/generate_speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('API Response Status:', response.status);
        console.log('API Response Headers:', [...response.headers.entries()]);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`Fish Audio API error: ${response.status} - ${errorText}`);
        }

        // Get audio blob
        const audioBlob = await response.blob();
        console.log('Audio Blob Size:', audioBlob.size, 'bytes');
        console.log('Audio Blob Type:', audioBlob.type);

        const audioUrl = URL.createObjectURL(audioBlob);
        console.log('Audio URL Created:', audioUrl);

        // Play audio
        const audio = new Audio(audioUrl);

        audio.onplay = () => {
            console.log('Audio playback started');
            status.textContent = `Speaking (${selectedVoice}, ${emotion})...`;
            status.style.color = '#10b981';
        };

        audio.onended = () => {
            console.log('Audio playback complete');
            status.textContent = 'Speech complete!';
            status.style.color = '#10b981';
            URL.revokeObjectURL(audioUrl);

            setTimeout(() => {
                status.textContent = 'Tracking active - Move your nose!';
            }, 2000);
        };

        audio.onerror = (e) => {
            console.error('Audio playback error:', e);
            throw new Error('Audio playback failed');
        };

        await audio.play();
        console.log('=== Fish Audio TTS Success ===');

    } catch (error) {
        console.error('=== Fish Audio TTS Error ===');
        console.error('Error Type:', error.name);
        console.error('Error Message:', error.message);
        console.error('Stack Trace:', error.stack);

        // Fallback to Web Speech API if Fish Audio fails
        status.textContent = 'Fish Audio failed, using fallback...';
        status.style.color = '#f59e0b';

        console.log('Falling back to Web Speech API');
        return speakWithWebSpeech(text, emotion);
    }
}

// Web Speech API with proper male/female voice selection
function speakWithWebSpeech(text, emotion) {
    if (!('speechSynthesis' in window)) {
        alert('Speech synthesis not supported in this browser');
        return;
    }

    console.log('=== Web Speech API Request ===');
    console.log('Text:', text);
    console.log('Emotion:', emotion);
    console.log('Selected Voice Gender:', selectedVoice);

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Get available voices
    const voices = window.speechSynthesis.getVoices();
    console.log('Available voices:', voices.length);

    const utterance = new SpeechSynthesisUtterance(text);

    // Select voice based on gender
    let selectedVoiceObj = null;

    if (selectedVoice === 'female') {
        // Try to find female voices (in order of preference)
        selectedVoiceObj = voices.find(v => v.name.includes('Female')) ||
                          voices.find(v => v.name.includes('Zira')) ||
                          voices.find(v => v.name.includes('Samantha')) ||
                          voices.find(v => v.name.includes('Victoria')) ||
                          voices.find(v => v.name === 'Google US English') ||
                          voices.find(v => !v.name.includes('Male'));
    } else {
        // Try to find male voices (in order of preference)
        selectedVoiceObj = voices.find(v => v.name.includes('Male')) ||
                          voices.find(v => v.name.includes('David')) ||
                          voices.find(v => v.name.includes('Mark')) ||
                          voices.find(v => v.name.includes('Daniel')) ||
                          voices.find(v => v.name === 'Google UK English Male');
    }

    if (selectedVoiceObj) {
        utterance.voice = selectedVoiceObj;
        console.log('Selected voice:', selectedVoiceObj.name, '(' + selectedVoiceObj.lang + ')');
    } else {
        console.log('No specific voice found, using default');
    }

    // Adjust speech rate and pitch based on emotion (enhanced ranges)
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (emotion === 'happy') {
        utterance.rate = 1.0;   // Much faster for happiness
        utterance.pitch = 1.3;  // Higher pitch for cheerfulness
    } else if (emotion === 'sad') {
        utterance.rate = 0.5;   // Much slower for sadness
        utterance.pitch = 1.5;  // Lower pitch for melancholy
    } else if (emotion === 'angry') {
        utterance.rate = 1.5;   // Faster for intensity
        utterance.pitch = 0.5;  // Lower pitch for anger
    } else if (emotion === 'surprised') {
        utterance.rate = 2.0;   // Very fast for surprise
        utterance.pitch = 2.5;  // Very high pitch for excitement
    }

    console.log('Speech parameters:', {
        rate: utterance.rate,
        pitch: utterance.pitch,
        volume: utterance.volume
    });

    utterance.onstart = () => {
        console.log('Web Speech playback started');
        status.textContent = `Speaking (${selectedVoice}, ${emotion})...`;
        status.style.color = '#10b981';
    };

    utterance.onend = () => {
        console.log('Web Speech playback complete');
        status.textContent = 'Speech complete!';
        status.style.color = '#10b981';
        setTimeout(() => {
            status.textContent = 'Tracking active - Move your nose!';
        }, 2000);
    };

    utterance.onerror = (error) => {
        console.error('Web Speech Error:', error);
        status.textContent = 'Speech failed';
        status.style.color = '#ef4444';
    };

    window.speechSynthesis.speak(utterance);
    console.log('=== Web Speech API Success ===');
}

// Start camera and tracking
async function startTracking() {
    try {
        status.textContent = 'Initializing camera...';
        status.style.color = '#f59e0b';

        // Initialize emotion models if not already loaded
        if (!emotionModelsLoaded && !emotionModelLoading) {
            await initEmotionModel();
        }

        // Initialize Face Mesh
        if (!faceMesh) {
            initFaceMesh();
        }

        // Get camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        video.srcObject = stream;

        // Wait for video to load
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve();
            };
        });

        // Start camera
        camera = new Camera(video, {
            onFrame: async () => {
                await faceMesh.send({ image: video });
            },
            width: 1280,
            height: 720
        });

        await camera.start();

        isTracking = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;

        // Reset emotion buffer and state when starting fresh
        emotionBuffer = [];
        currentEmotion = 'neutral';
        emotionLocked = false;
        emotionDetectionPending = false;
        emotionDetectionPromise = null;
        if (emotionLockTimeout) {
            clearTimeout(emotionLockTimeout);
            emotionLockTimeout = null;
        }

        status.textContent = 'Camera started - Looking for face...';
        status.style.color = '#3b82f6';

    } catch (error) {
        console.error('Error starting camera:', error);
        status.textContent = 'Error: Could not access camera';
        status.style.color = '#ef4444';
        alert('Could not access camera. Please make sure you have granted camera permissions.');
    }
}

// Stop camera and tracking
function stopTracking() {
    if (camera) {
        camera.stop();
        camera = null;
    }

    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }

    keyboardCursor.classList.remove('active');
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    isTracking = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;

    status.textContent = 'Camera stopped';
    status.style.color = '#6b7280';
    coordX.textContent = '0';
    coordY.textContent = '0';
}

// Event listeners
startBtn.addEventListener('click', startTracking);
stopBtn.addEventListener('click', stopTracking);

// Voice selection event listeners
voiceRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        selectedVoice = e.target.value;
        console.log(`Voice changed to: ${selectedVoice}`);
    });
});

// Initialize emotion models on page load
initEmotionModel().catch(error => {
    console.error('Failed to initialize emotion models:', error);
});

// ========== VOICE CLONING FUNCTIONALITY ==========
// Voice cloning state
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimerInterval = null;
let userVoiceId = null;
const RECORDING_DURATION = 30000; // 30 seconds in milliseconds
const USER_ID = localStorage.getItem('userId') || `user_${Date.now()}`;

// Store user ID in localStorage
localStorage.setItem('userId', USER_ID);

// DOM elements for voice cloning
const voiceStatusText = document.getElementById('voiceStatusText');
const voiceSetupContainer = document.getElementById('voiceSetupContainer');
const startRecordingBtn = document.getElementById('startRecordingBtn');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const recordingTimer = document.getElementById('recordingTimer');
const timerDisplay = document.getElementById('timerDisplay');
const recordingProgress = document.getElementById('recordingProgress');
const progressBar = document.getElementById('progressBar');
const uploadStatus = document.getElementById('uploadStatus');
const uploadStatusText = document.getElementById('uploadStatusText');

// File upload elements
const recordModeBtn = document.getElementById('recordModeBtn');
const uploadModeBtn = document.getElementById('uploadModeBtn');
const recordingMode = document.getElementById('recordingMode');
const uploadMode = document.getElementById('uploadMode');
const audioFileInput = document.getElementById('audioFileInput');
const selectedFileName = document.getElementById('selectedFileName');
const uploadFileBtn = document.getElementById('uploadFileBtn');
let selectedAudioFile = null;

// Check voice status on page load
async function checkVoiceStatus() {
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/voice-status?user_id=${encodeURIComponent(USER_ID)}`);
        const data = await response.json();
        
        if (data.has_voice) {
            userVoiceId = data.voice_id;
            voiceStatusText.textContent = '✅ Personal Voice Activated';
            voiceStatusText.style.color = '#10b981';
            voiceSetupContainer.style.display = 'none';
        } else {
            voiceStatusText.textContent = '⚠️ Voice Model Not Setup';
            voiceStatusText.style.color = '#f59e0b';
            voiceSetupContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking voice status:', error);
        voiceStatusText.textContent = '❌ Error checking status';
        voiceStatusText.style.color = '#ef4444';
        voiceSetupContainer.style.display = 'block';
    }
}

// Start recording
async function startRecording() {
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus' // Use WebM for better browser support
        });
        
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Create audio blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Convert to WAV format for better compatibility
            const wavBlob = await convertToWav(audioBlob);
            
            // Upload and create voice model
            await uploadAndCreateVoice(wavBlob);
        };
        
        // Start recording
        mediaRecorder.start();
        recordingStartTime = Date.now();
        
        // Update UI
        startRecordingBtn.style.display = 'none';
        stopRecordingBtn.style.display = 'inline-block';
        stopRecordingBtn.disabled = false;
        recordingTimer.style.display = 'block';
        recordingProgress.style.display = 'block';
        
        // Start timer
        updateTimer();
        recordingTimerInterval = setInterval(updateTimer, 100);
        
        // Auto-stop after 30 seconds
        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopRecording();
            }
        }, RECORDING_DURATION);
        
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording. Please allow microphone access.');
    }
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        
        // Clear timer
        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
            recordingTimerInterval = null;
        }
        
        // Update UI
        stopRecordingBtn.disabled = true;
        stopRecordingBtn.textContent = 'Processing...';
    }
}

// Update recording timer
function updateTimer() {
    if (!recordingStartTime) return;
    
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(displaySeconds).padStart(2, '0')}`;
    
    // Update progress bar
    const progress = Math.min((elapsed / RECORDING_DURATION) * 100, 100);
    progressBar.style.width = `${progress}%`;
    
    // Auto-stop at 30 seconds
    if (elapsed >= RECORDING_DURATION) {
        stopRecording();
    }
}

// Convert audio blob to WAV format
async function convertToWav(audioBlob) {
    try {
        // For simplicity, we'll use the WebM format directly
        // Fish Audio API should accept WebM, but if not, we can convert server-side
        // For now, return the original blob
        return audioBlob;
    } catch (error) {
        console.error('Error converting to WAV:', error);
        return audioBlob; // Fallback to original
    }
}

// Upload audio and create voice model with retry logic
// Accepts either a Blob (from recording) or a File (from file input)
async function uploadAndCreateVoice(audioBlobOrFile) {
    uploadStatus.style.display = 'block';
    uploadStatusText.textContent = 'Uploading audio and creating voice model...';
    
    const formData = new FormData();
    
    // Handle both Blob (from recording) and File (from file input)
    if (audioBlobOrFile instanceof File) {
        formData.append('audio_file', audioBlobOrFile);
    } else {
        // It's a Blob from recording
        formData.append('audio_file', audioBlobOrFile, 'voice_recording.webm');
    }
    
    formData.append('user_id', USER_ID);
    
    const maxRetries = 3;
    let retryDelay = 1;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            uploadStatusText.textContent = `Uploading... (Attempt ${attempt + 1}/${maxRetries})`;
            
            const response = await fetch('http://127.0.0.1:8000/api/create-voice', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.voice_id) {
                userVoiceId = data.voice_id;
                uploadStatusText.textContent = '✅ Voice model created successfully!';
                uploadStatusText.style.color = '#10b981';
                
                // Update voice status
                setTimeout(() => {
                    checkVoiceStatus();
                    uploadStatus.style.display = 'none';
                }, 2000);
                
                return;
            } else {
                throw new Error('Voice creation failed: ' + (data.message || 'Unknown error'));
            }
            
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            
            if (attempt < maxRetries - 1) {
                const waitTime = retryDelay * Math.pow(2, attempt); // Exponential backoff
                uploadStatusText.textContent = `Error: ${error.message}. Retrying in ${waitTime}s...`;
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            } else {
                uploadStatusText.textContent = `❌ Failed to create voice model: ${error.message}`;
                uploadStatusText.style.color = '#ef4444';
                // Reset appropriate button based on mode
                if (stopRecordingBtn) {
                    stopRecordingBtn.textContent = 'Try Again';
                    stopRecordingBtn.disabled = false;
                }
                if (uploadFileBtn) {
                    uploadFileBtn.textContent = 'Upload & Create Voice';
                    uploadFileBtn.disabled = false;
                }
            }
        }
    }
}

// Toggle between record and upload modes
function switchToRecordMode() {
    recordModeBtn.classList.add('active');
    uploadModeBtn.classList.remove('active');
    recordingMode.style.display = 'block';
    uploadMode.style.display = 'none';
    selectedAudioFile = null;
    audioFileInput.value = '';
    selectedFileName.style.display = 'none';
    uploadFileBtn.disabled = true;
}

function switchToUploadMode() {
    uploadModeBtn.classList.add('active');
    recordModeBtn.classList.remove('active');
    uploadMode.style.display = 'block';
    recordingMode.style.display = 'none';
}

recordModeBtn.addEventListener('click', switchToRecordMode);
uploadModeBtn.addEventListener('click', switchToUploadMode);

// Handle file selection
audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        // Validate file type
        if (!file.type.startsWith('audio/')) {
            alert('Please select an audio file.');
            audioFileInput.value = '';
            return;
        }
        
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('File is too large. Maximum size is 10MB.');
            audioFileInput.value = '';
            return;
        }
        
        selectedAudioFile = file;
        selectedFileName.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        selectedFileName.style.display = 'block';
        uploadFileBtn.disabled = false;
    }
});

// Handle file upload
uploadFileBtn.addEventListener('click', async () => {
    if (!selectedAudioFile) {
        alert('Please select an audio file first.');
        return;
    }
    
    // Disable button during upload
    uploadFileBtn.disabled = true;
    uploadFileBtn.textContent = 'Uploading...';
    
    // Upload and create voice
    await uploadAndCreateVoice(selectedAudioFile);
    
    // Reset UI
    uploadFileBtn.textContent = 'Upload & Create Voice';
    uploadFileBtn.disabled = false;
});

// Manual Voice ID Entry
const manualVoiceIdInput = document.getElementById('manualVoiceIdInput');
const saveVoiceIdBtn = document.getElementById('saveVoiceIdBtn');

saveVoiceIdBtn.addEventListener('click', async () => {
    const voiceId = manualVoiceIdInput.value.trim();
    
    if (!voiceId) {
        alert('Please enter a voice ID.');
        return;
    }
    
    // Validate voice ID format (basic check)
    if (voiceId.length < 10) {
        alert('Voice ID seems too short. Please check and try again.');
        return;
    }
    
    saveVoiceIdBtn.disabled = true;
    saveVoiceIdBtn.textContent = 'Saving...';
    
    try {
        // Save the voice ID directly to storage via backend
        // We'll create a simple endpoint for this, or use localStorage + backend sync
        userVoiceId = voiceId;
        
        // Save to backend storage
        const response = await fetch(`http://127.0.0.1:8000/api/save-voice-id`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: USER_ID,
                voice_id: voiceId
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                uploadStatus.style.display = 'block';
                uploadStatusText.textContent = '✅ Voice ID saved successfully!';
                uploadStatusText.style.color = '#10b981';
                
                // Update voice status
                setTimeout(() => {
                    checkVoiceStatus();
                    uploadStatus.style.display = 'none';
                }, 2000);
            } else {
                throw new Error(data.message || 'Failed to save voice ID');
            }
        } else {
            const errorText = await response.text();
            throw new Error(`Server error: ${errorText}`);
        }
    } catch (error) {
        console.error('Error saving voice ID:', error);
        uploadStatus.style.display = 'block';
        uploadStatusText.textContent = `❌ Failed to save voice ID: ${error.message}`;
        uploadStatusText.style.color = '#ef4444';
    } finally {
        saveVoiceIdBtn.disabled = false;
        saveVoiceIdBtn.textContent = 'Save Voice ID';
    }
});

// Event listeners for recording
startRecordingBtn.addEventListener('click', startRecording);
stopRecordingBtn.addEventListener('click', stopRecording);

// Check voice status on page load
checkVoiceStatus();

// ========== UPDATE TTS GENERATION TO USE CLONED VOICE ==========
// Modify the existing speakText function to include user_id
// Find the speakText function and update it
const originalSpeakText = window.speakText;
if (typeof originalSpeakText === 'function') {
    // The function is already defined, we'll need to modify it
    // For now, we'll create a wrapper that adds user_id
}

// Initialize
status.textContent = 'Click "Start Camera" to begin';
status.style.color = '#6b7280';
