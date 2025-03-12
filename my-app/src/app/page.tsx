'use client'
import { useState, useRef, useEffect, MutableRefObject } from 'react';
import { FaMicrophone, FaStop, FaVolumeUp, FaPhone, FaPhoneSlash } from "react-icons/fa";

// Simple toast notification
interface ToastProps {
  message: string;
  type: string;
  onClose: () => void;
}

const Toast = ({ message, type, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className={`toast ${type}`}>
      <div className="toast-message">{message}</div>
      <button onClick={onClose} className="toast-close">×</button>
      
      <style jsx>{`
        .toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 12px 16px;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-width: 300px;
          z-index: 1000;
        }
        .error {
          background-color: #ffebee;
          color: #c62828;
          border-left: 4px solid #c62828;
        }
        .info {
          background-color: #e3f2fd;
          color: #0277bd;
          border-left: 4px solid #0277bd;
        }
        .toast-close {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          margin-left: 16px;
          color: inherit;
        }
      `}</style>
    </div>
  );
};

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [hasSilenceDetector, setHasSilenceDetector] = useState(false);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const silenceDetectorRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    audioPlayerRef.current = new Audio();
    
    audioPlayerRef.current.onplay = () => setIsAudioPlaying(true);
    audioPlayerRef.current.onended = () => {
      setIsAudioPlaying(false);
      // Start listening again after audio finishes playing
      if (!callEnded) {
        setTimeout(() => {
          startRecording();
        }, 1000); // Small delay before starting to record again
      }
    };
    audioPlayerRef.current.onerror = () => {
      setIsAudioPlaying(false);
      showToast("Error playing audio response", "error");
    };
    
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = '';
      }
      
      // Clean up any active media resources
      cleanupResources();
    };
  }, []);

// Modify the playAudioAgain function to restart listening after manual replay
const playAudioAgain = () => {
  if (audioPlayerRef.current && audioPlayerRef.current.src) {
    audioPlayerRef.current.currentTime = 0;
    audioPlayerRef.current.play().catch(err => {
      console.error('Error playing audio:', err);
      showToast("Couldn't play audio. Please try again.", "error");
    });
  }
};

// Update the processAudioInput function to properly handle conversation flow
const processAudioInput = async () => {
  try {
    setIsProcessing(true);
    
    // Create audio blob from recorded chunks
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    console.log('Audio blob created:', audioBlob.size, 'bytes');
    
    if (audioBlob.size <= 0) {
      setError('No audio recorded. Please try again.');
      setIsProcessing(false);
      return;
    }
    
    const formData = new FormData();
    formData.append('audio', audioBlob);
    
    // Decide if we want to use streaming
    const useStreaming = true;
    
    console.log('Sending request to server...');
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: useStreaming ? { 'x-use-streaming': 'true' } : {},
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Server error: ${response.status} - ${errorData}`);
    }
    
    const data = await response.json();
    setResponse(data.text);
    
    // Handle audio playback
    if (data.streamingEnabled && data.streamText) {
      // Streaming mode
      try {
        const audioResponse = await fetch('/api/tts-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            text: data.streamText 
          }),
        });
        
        if (!audioResponse.ok) {
          throw new Error(`Audio streaming error: ${audioResponse.status}`);
        }
        
        // Convert the streaming response to a blob
        const audioBlob = await audioResponse.blob();
        
        // Create a URL for the blob
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Create and play audio - no need to restart listening here as onended event will do it
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = audioUrl;
          audioPlayerRef.current.play().catch(err => {
            console.warn('Autoplay prevented:', err);
            showToast('Click to play audio response', 'info');
            
            // If autoplay fails, we won't get the onended event, so restart listening from here
            setTimeout(() => {
              if (!isRecording && !callEnded) {
                startRecording();
              }
            }, 5000);
          });
        }
      } catch (streamError) {
        console.error("Streaming error:", streamError);
        showToast("Error playing audio stream", "error");
        
        // On error, restart listening
        setTimeout(() => {
          if (!isRecording && !callEnded) {
            startRecording();
          }
        }, 3000);
      }
    } else if (data.audio) {
      // Traditional mode
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = data.audio;
        audioPlayerRef.current.play().catch(err => {
          console.warn('Autoplay prevented:', err);
          showToast('Click to play audio response', 'info');
          
          // If autoplay fails, we won't get the onended event, so restart listening from here
          setTimeout(() => {
            if (!isRecording && !callEnded) {
              startRecording();
            }
          }, 5000);
        });
      }
    } else {
      // If there's no audio to play, restart recording immediately
      setTimeout(() => {
        if (!isRecording && !callEnded) {
          startRecording();
        }
      }, 2000);
    }
    
  } catch (err) {
    console.error('Error processing audio:', err);
    setError('Failed to process your voice. Please try again.');
    
    // Even on error, attempt to restart listening after a delay
    setTimeout(() => {
      if (!isRecording && !callEnded) {
        startRecording();
      }
    }, 5000);
  } finally {
    setIsProcessing(false);
    // Clear audio chunks for next recording
    audioChunksRef.current = [];
  }
};


  
  const showToast = (message: string, type: string) => {
    setToast({ message, type });
  };

  const dismissToast = () => {
    setToast(null);
  };

  // Function to clean up all media resources
  const cleanupResources = () => {
    // Stop any active media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop all tracks in the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Reset state
    setHasSilenceDetector(false);
    setIsRecording(false);
  };

  let started = false;

  function onSilence() {
    console.log('silence detected');
    if (started) {
      console.log('stopping recording due to silence');
      stopRecording();
      // After stopping, we should process the audio input
    }
  }

  function onSpeak() {
    console.log('speaking detected');
    if (!started) {
      started = true;
      console.log('Started speaking');
    }
  }

  const startRecording = async () => {
    try {
      if (isProcessing) return;
      
      setError(null);
      setResponse("");
      audioChunksRef.current = [];
      started = false;
      
      // Stop any playing audio
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = '';
        setIsAudioPlaying(false);
      }
      
      // Get access to the microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Set up silence detection
      detectSilence(stream, onSilence, onSpeak, 1500, -40);
      setHasSilenceDetector(true);
      
      // Use higher audio quality for better speech recognition
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          processAudioInput();
        } else {
          setIsRecording(false);
          setIsProcessing(false);
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      showToast("Listening... Speak now", "info");
      console.log('Recording started');
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Error accessing microphone. Please ensure you have granted permission.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      started = false;
      
      // Stop all tracks in the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      console.log('Recording stopped');
    }
  };

  function detectSilence(stream: MediaStream, onSoundEnd = ()=>{}, onSoundStart = ()=>{}, silence_delay = 1500, min_decibels = -40) {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    const streamNode = ctx.createMediaStreamSource(stream);
    streamNode.connect(analyser);
    analyser.minDecibels = min_decibels;
  
    const data = new Uint8Array(analyser.frequencyBinCount); // will hold our data
    let silence_start = performance.now();
    let triggered = false; // trigger only once per silence event
  
    function loop(time: number) {
      if (callEnded) return; // Stop looping if call ended
      
      requestAnimationFrame(loop); // we'll loop every 60th of a second to check
      analyser.getByteFrequencyData(data); // get current data
      if (data.some(v => v)) { // if there is data above the given db limit
        if(triggered){
          triggered = false;
          onSoundStart();
        }
        silence_start = time; // set it to now
      }
      if (!triggered && time - silence_start > silence_delay) {
        onSoundEnd();
        triggered = true;
      }
    }
  
    const time = performance.now();
    loop(time); // loop the function
    
    // Save reference to be able to clean up
    silenceDetectorRef.current = { ctx, analyser, streamNode };
    
    return () => {
      // Cleanup function
      streamNode.disconnect();
      ctx.close();
    };
  }


  const leaveCall = async () => {
    setCallEnded(true);
    
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // Clean up all resources
    cleanupResources();
    
    // Stop audio playback
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = '';
      setIsAudioPlaying(false);
    }
    
    // Reset conversation state
    setResponse("");
    setError(null);
    
    showToast("Call ended", "info");

    
  };

  return (
    <div className="mobile-container py-16 text-black border-r-4 border-b-4 border-pink-500">
      <div className="mobile-screen">
        <h1>Reetape Technologies</h1>
        
        <div className="phone-content-container">
          {isProcessing && (
            <div className="processing-indicator">
              <div className="spinner"></div>
              <p>Processing...</p>
            </div>
          )}
          
          {!isProcessing && !isRecording && !isAudioPlaying && response && (
            <div className="conversation-indicator">
              <div className="conversation-pulse"></div>
              <p>Conversation active - waiting for audio to finish</p>
            </div>
          )}
          
          <div className={`phone-content ${isRecording ? 'recording' : ''}`}>
            {response ? (
              <div className="response-content">
                <p className="response-text">{response}</p>
                {!isAudioPlaying && (
                  <button className="play-again-button" onClick={playAudioAgain}>
                    <FaVolumeUp /> Play Again
                  </button>
                )}
              </div>
            ) : (
              <p className="placeholder">
                {isRecording 
                  ? "I'm listening... Speak and I'll detect when you're done." 
                  : isProcessing 
                    ? "Processing your request..." 
                    : "Click Answer to start a conversation."}
              </p>
            )}
            
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>
          
          {isRecording && (
            <div className="recording-indicator">
              <div className="recording-pulse"></div>
              <p>Recording... I'll detect when you stop speaking</p>
            </div>
          )}
          
          {isAudioPlaying && (
            <div className="playing-indicator">
              <div className="playing-pulse"></div>
              <p>Playing response... I'll listen again when done</p>
            </div>
          )}
        </div>
      
        
        <div className="button-container">
          <button 
            className="call-button" 
            onClick={startRecording}
            disabled={isRecording || isProcessing}
          >
            <FaPhone /> Answer
          </button>
          <button 
            className="end-button" 
            onClick={leaveCall}
          >
            <FaPhoneSlash /> End
          </button>
        </div>
      </div>

      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={dismissToast} 
        />
      )}

      <style jsx>{`
        .phone-content-container {
          width: 100%;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow-y: auto;
          padding: 0 15px;
          margin: 10px 0 20px;
        }
        
        .phone-content {
          width: 100%;
          background-color: rgb(110, 96, 96);
          border-radius: 10px;
          padding: 15px;
          margin-bottom: 10px;
          text-align: center;
          max-height: 350px;
          overflow-y: auto;
          color: black;
          transition: all 0.3s ease;
        }
        
        .phone-content.recording {
          background-color: rgb(110, 96, 96);
        }
        
        .response-content {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .response-text {
          margin-bottom: 10px;
          line-height: 1.5;
        }
        
        .placeholder {
          color: black;
          margin: 20px 0;
        }

        .conversation-indicator, .playing-indicator {
          display: flex;
          align-items: center;
          margin-top: 10px;
          color: white;
          font-size: 0.8rem;
        }

        .conversation-pulse, .playing-pulse {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 8px;
        }

        .conversation-pulse {
          background-color: #4CAF50;
          animation: pulse 2s infinite;
        }

        .playing-pulse {
          background-color: #2196f3;
          animation: pulse 1s infinite;
        }

        /* Update your placeholder text to reflect the conversation flow */
        .placeholder {
          color: black;
          margin: 20px 0;
          font-weight: 500;
        }
        
        .play-again-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 0.8rem;
          color: white;
          background-color: #2196f3;
          border: none;
          border-radius: 20px;
          cursor: pointer;
          margin-top: 10px;
          transition: background-color 0.2s;
        }
        
        .play-again-button:hover {
          background-color: #1976d2;
        }
        
        .error-message {
          margin-top: 10px;
          padding: 8px;
          background-color: rgb(110, 96, 96);
          color: #c62828;
          border-radius: 4px;
          border-left: 2px solid #c62828;
          font-size: 0.8rem;
          text-align: left;
        }
        
        .recording-indicator {
          display: flex;
          align-items: center;
          margin-top: 10px;
          color: white;
          font-size: 0.8rem;
        }
        
        .recording-pulse {
          width: 10px;
          height: 10px;
          background-color: #f44336;
          border-radius: 50%;
          margin-right: 8px;
          animation: pulse 1.5s infinite;
        }
        
        .processing-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          color: white;
          margin-bottom: 10px;
        }
        
        .processing-indicator p {
          margin-top: 5px;
          font-size: 0.8rem;
        }
        
        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .call-button, .end-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }
        
        .call-button:disabled {
          background-color: #a5d6a7;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}