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
  <div style={{ maxWidth: 1400 }}>
    <div style={{ marginBottom: 10 }}>
      {!isStreaming ? (
        <button
          onClick={startCamera}
          style={{ background: "#ff9800", color: "white" }}
        >
          Start Camera
        </button>
      ) : (
        <button
          onClick={() => {
            stopDrawing();
            stopCamera();
          }}
          style={{ background: "#ff9800", color: "white" }}
        >
          Stop Camera
        </button>
      )}

      {isStreaming && (
        <>
          {!isRecording ? (
            <button
              onClick={startRecording}
              style={{ marginLeft: 8, background: "#ff9800", color: "white" }}
            >
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              style={{ marginLeft: 8, background: "#f44336", color: "white" }}
            >
              Stop Recording
            </button>
          )}
        </>
      )}
    </div>

    {error && <div style={{ color: "red", marginBottom: 8 }}>Error: {error}</div>}

    <div style={{ display: "flex", gap: 16, position: "relative" }}>
      <video
        ref={videoRef}
        style={{ width: 640, height: 480, background: "#000" }}
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        style={{
          width: 640,
          height: 480,
          border: "1px solid #ddd",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      />
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
