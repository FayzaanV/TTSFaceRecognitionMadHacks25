import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

interface CursorPosition {
  x: number;
  y: number;
}

type Emotion = 'happy' | 'angry' | 'surprised' | 'neutral';

interface UseHeadTrackingReturn {
  cursorPosition: CursorPosition;
  emotion: Emotion;
  isTracking: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
}

interface UseHeadTrackingOptions {
  sensitivity?: number;
  smoothingFactor?: number;
  onEmotionChange?: (emotion: Emotion) => void;
}

export const useHeadTracking = (options: UseHeadTrackingOptions = {}): UseHeadTrackingReturn => {
  const {
    sensitivity = 2.5,
    smoothingFactor = 0.1,
    onEmotionChange
  } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const animationFrameRef = useRef<number | null>(null);

  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ x: 0.5, y: 0.5 });
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [isTracking, setIsTracking] = useState(false);

  // Smooth cursor position using linear interpolation
  const smoothedCursorRef = useRef<CursorPosition>({ x: 0.5, y: 0.5 });

  // Initialize MediaPipe Face Landmarker
  const initializeFaceLandmarker = useCallback(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
      );

      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: 'GPU' // Try GPU first, falls back to CPU if not available
        },
        outputFaceBlendshapes: true, // Critical for emotion detection
        runningMode: 'VIDEO',
        numFaces: 1
      });

      faceLandmarkerRef.current = faceLandmarker;
      console.log('Face Landmarker initialized successfully');
    } catch (error) {
      console.error('Error initializing Face Landmarker:', error);
      // Fallback to CPU if GPU fails
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: 'CPU'
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        });

        faceLandmarkerRef.current = faceLandmarker;
        console.log('Face Landmarker initialized with CPU fallback');
      } catch (fallbackError) {
        console.error('Error initializing Face Landmarker with CPU:', fallbackError);
      }
    }
  }, []);

  // Linear interpolation function for smoothing
  const lerp = useCallback((start: number, end: number, factor: number): number => {
    return start + (end - start) * factor;
  }, []);

  // Detect emotion from face blendshapes
  const detectEmotionFromBlendshapes = useCallback((blendshapes: any[]): Emotion => {
    if (!blendshapes || blendshapes.length === 0) {
      return 'neutral';
    }

    // Find blendshape values by category name
    const getBlendshapeValue = (categoryName: string): number => {
      const blendshape = blendshapes.find(bs => bs.categoryName === categoryName);
      return blendshape ? blendshape.score : 0;
    };

    // Calculate emotion scores
    const mouthSmileLeft = getBlendshapeValue('mouthSmileLeft');
    const mouthSmileRight = getBlendshapeValue('mouthSmileRight');
    const happyScore = (mouthSmileLeft + mouthSmileRight) / 2;

    const browDownLeft = getBlendshapeValue('browDownLeft');
    const browDownRight = getBlendshapeValue('browDownRight');
    const angryScore = (browDownLeft + browDownRight) / 2;

    const browInnerUp = getBlendshapeValue('browInnerUp');
    const browOuterUpLeft = getBlendshapeValue('browOuterUpLeft');
    const browOuterUpRight = getBlendshapeValue('browOuterUpRight');
    const surprisedScore = (browInnerUp + (browOuterUpLeft + browOuterUpRight) / 2) / 2;

    // Determine emotion based on thresholds
    if (happyScore > 0.5) {
      return 'happy';
    } else if (angryScore > 0.5) {
      return 'angry';
    } else if (surprisedScore > 0.5) {
      return 'surprised';
    }

    return 'neutral';
  }, []);

  // Process video frame
  const processVideoFrame = useCallback(() => {
    if (!videoRef.current || !faceLandmarkerRef.current || !isTracking) {
      return;
    }

    const video = videoRef.current;
    
    // Check if video is ready
    if (video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(processVideoFrame);
      return;
    }

    const currentTime = video.currentTime;
    
    // Only process if video time has changed
    if (currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = currentTime;

      // Detect face landmarks
      const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        
        // Track Nose Tip (Landmark Index 1)
        const noseTip = landmarks[1];
        
        // Convert normalized coordinates (0.0 to 1.0) to screen coordinates
        // Apply sensitivity multiplier and center offset
        const normalizedX = noseTip.x;
        const normalizedY = noseTip.y;
        
        // Formula: ScreenX = (NoseX - 0.5) * Sensitivity + 0.5 (centered)
        const targetX = (normalizedX - 0.5) * sensitivity + 0.5;
        const targetY = (normalizedY - 0.5) * sensitivity + 0.5;
        
        // Clamp to [0, 1] range
        const clampedX = Math.max(0, Math.min(1, targetX));
        const clampedY = Math.max(0, Math.min(1, targetY));
        
        // Apply smoothing using linear interpolation
        smoothedCursorRef.current = {
          x: lerp(smoothedCursorRef.current.x, clampedX, smoothingFactor),
          y: lerp(smoothedCursorRef.current.y, clampedY, smoothingFactor)
        };
        
        setCursorPosition(smoothedCursorRef.current);

        // Detect emotion from blendshapes
        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
          const detectedEmotion = detectEmotionFromBlendshapes(results.faceBlendshapes[0]);
          
          if (detectedEmotion !== emotion) {
            setEmotion(detectedEmotion);
            onEmotionChange?.(detectedEmotion);
          }
        }
      } else {
        // No face detected, reset to center
        smoothedCursorRef.current = {
          x: lerp(smoothedCursorRef.current.x, 0.5, smoothingFactor),
          y: lerp(smoothedCursorRef.current.y, 0.5, smoothingFactor)
        };
        setCursorPosition(smoothedCursorRef.current);
      }
    }

    // Continue processing frames
    animationFrameRef.current = requestAnimationFrame(processVideoFrame);
  }, [isTracking, sensitivity, smoothingFactor, lerp, detectEmotionFromBlendshapes, emotion, onEmotionChange]);

  // Start tracking
  const startTracking = useCallback(async () => {
    if (!videoRef.current) {
      console.error('Video element not available');
      return;
    }

    // Initialize Face Landmarker if not already initialized
    if (!faceLandmarkerRef.current) {
      await initializeFaceLandmarker();
    }

    if (!faceLandmarkerRef.current) {
      console.error('Failed to initialize Face Landmarker');
      return;
    }

    try {
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              if (videoRef.current) {
                videoRef.current.play();
                resolve();
              }
            };
          }
        });

        setIsTracking(true);
        lastVideoTimeRef.current = -1;
        smoothedCursorRef.current = { x: 0.5, y: 0.5 };
        setCursorPosition({ x: 0.5, y: 0.5 });
        
        // Start processing frames
        processVideoFrame();
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      alert('Could not access camera. Please make sure you have granted camera permissions.');
    }
  }, [initializeFaceLandmarker, processVideoFrame]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    setIsTracking(false);

    // Stop animation frame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop video stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    // Reset cursor to center
    smoothedCursorRef.current = { x: 0.5, y: 0.5 };
    setCursorPosition({ x: 0.5, y: 0.5 });
    setEmotion('neutral');
    lastVideoTimeRef.current = -1;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
    };
  }, [stopTracking]);

  return {
    cursorPosition,
    emotion,
    isTracking,
    videoRef,
    startTracking,
    stopTracking
  };
};

