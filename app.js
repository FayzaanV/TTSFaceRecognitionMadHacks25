// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const canvasCtx = canvas.getContext('2d');
const cursor = document.getElementById('cursor');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
const coordX = document.getElementById('coordX');
const coordY = document.getElementById('coordY');

// State
let camera = null;
let faceMesh = null;
let isTracking = false;

// Smoothing variables
let smoothedX = 0;
let smoothedY = 0;
const smoothingFactor = 0.3; // Lower = smoother but more lag

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
        canvasCtx.arc(smoothedX, smoothedY, 8, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#FF0000';
        canvasCtx.fill();
        canvasCtx.strokeStyle = '#FFFFFF';
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();

        // Update cursor position (mirrored to match video)
        const containerRect = canvas.getBoundingClientRect();
        const cursorX = containerRect.left + (canvas.width - smoothedX) * (containerRect.width / canvas.width);
        const cursorY = containerRect.top + smoothedY * (containerRect.height / canvas.height);

        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;
        cursor.classList.add('active');

        // Update coordinates display
        coordX.textContent = Math.round(smoothedX);
        coordY.textContent = Math.round(smoothedY);

        status.textContent = 'Tracking active - Move your nose!';
        status.style.color = '#10b981';
    } else {
        cursor.classList.remove('active');
        status.textContent = 'No face detected';
        status.style.color = '#ef4444';
    }

    canvasCtx.restore();
}

// Start camera and tracking
async function startTracking() {
    try {
        status.textContent = 'Initializing camera...';
        status.style.color = '#f59e0b';

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

    cursor.classList.remove('active');
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

// Initialize
status.textContent = 'Click "Start Camera" to begin';
status.style.color = '#6b7280';
