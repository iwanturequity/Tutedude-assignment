import React, { useRef, useEffect, useState } from "react";
import FocusDetection from "./FocusDetection";
import ObjectDetection from "./ObjectDetection";

export default function VideoFeed({ onStreamReady, onRecordingStateChange }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  // Recording refs
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const drawFlag = useRef(false);

  const [logs, setLogs] = useState([]);
  const handleLogEvent = (event) => {
    console.log("Event Logs:", event);
    setLogs((prev) => [...prev, event]);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      stopDrawing();
      stopRecording();
    };
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setStream(s);
      setIsStreaming(true);

      if (onStreamReady) onStreamReady(s, videoRef.current, canvasRef.current);

      startDrawing();
    } catch (err) {
      console.error("getUserMedia error:", err);
      setError(err.message || "Could not access camera. Check permissions.");
    }
  };

  const stopCamera = () => {
    stopDrawing();
    const activeStream = videoRef.current?.srcObject || stream;
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
    }
    if (window.focusStream) {
      window.focusStream.getTracks().forEach((t) => t.stop());
      window.focusStream = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("srcObject");
    }
    setStream(null);
    setIsStreaming(false);

    // Log camera stopped event
    handleLogEvent({
      type: "camera-stopped",
      message: "Camera feed stopped",
      timestamp: new Date().toISOString(),
      meta: {}
    });
  };

  const startDrawing = () => {
    drawFlag.current = true;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const loop = () => {
      if (!drawFlag.current) return;
      if (video && canvas && ctx) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  const stopDrawing = () => {
    drawFlag.current = false;
  };

  const startRecording = () => {
    recordedChunksRef.current = [];
    if (!stream) {
      setError("Start camera first before recording.");
      return;
    }
    try {
      const options = { mimeType: "video/webm; codecs=vp8" };
      const mr = new MediaRecorder(stream, options);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        setIsRecording(false);
        // Notify parent component about recording completion
        if (onRecordingStateChange) {
          onRecordingStateChange(false, blob);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      
      // Notify parent component about recording start
      if (onRecordingStateChange) {
        onRecordingStateChange(true);
      }
    } catch (err) {
      console.error("MediaRecorder error:", err);
      setError("Recording not supported by this browser or mimeType.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      // The onRecordingStateChange callback will be called in the onstop event handler
    }
  };

 return (
  <div className="video-feed-container">
    {/* Control Buttons */}
    <div className="video-controls">
      {!isStreaming ? (
        <button onClick={startCamera} className="btn btn-start-camera">
          📹 Start Camera
        </button>
      ) : (
        <button
          onClick={() => {
            stopDrawing();
            stopCamera();
          }}
          className="btn btn-stop-camera"
        >
          ⏹️ Stop Camera
        </button>
      )}

      {isStreaming && (
        <>
          {!isRecording ? (
            <button onClick={startRecording} className="btn btn-start-recording">
              🔴 Start Recording
            </button>
          ) : (
            <button onClick={stopRecording} className="btn btn-stop-recording">
              ⏹️ Stop Recording
            </button>
          )}
        </>
      )}
    </div>

    {error && (
      <div className="error-message">
        ⚠️ Error: {error}
      </div>
    )}

    {/* Video Display Area */}
    <div className="video-display">
      <video
        ref={videoRef}
        className="video-element"
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="video-canvas"
      />
      
      {!isStreaming && (
        <div className="video-placeholder">
          <div className="placeholder-content">
            <div className="placeholder-icon">📹</div>
            <div className="placeholder-text">Camera Not Started</div>
            <div className="placeholder-subtitle">Click "Start Camera" to begin monitoring</div>
          </div>
        </div>
      )}
    </div>

    {isStreaming && (
      <>
        <FocusDetection
          videoEl={videoRef.current}
          canvasEl={canvasRef.current}
          addLogEvent={handleLogEvent}
          enabled={isStreaming}
        />
        <ObjectDetection
          videoEl={videoRef.current}
          canvasEl={canvasRef.current}
          addLogEvent={handleLogEvent}
          enabled={isStreaming}
        />
      </>
    )}
  </div>
)
}
