import React, { useState, useEffect, useRef } from "react";
import VideoFeed from "./components/VideoFeed";
import FocusDetection from "./components/FocusDetection";
import ObjectDetection from "./components/ObjectDetection";
import { initializeAlerts, triggerAlert, testAlert } from "./utils/alertHelpers";
import { generateSessionId, logEventWithBackend, updateSession, testBackendConnection, downloadBackendCSV } from "./utils/apiHelpers";
import { exportProctoringReport } from "./utils/csvHelpers";

export default function App() {
  const [videoEl, setVideoEl] = useState(null);
  const [canvasEl, setCanvasEl] = useState(null);
  const [logs, setLogs] = useState([]);
  const [candidateName, setCandidateName] = useState("");
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const logsEndRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // New state for enhanced features
  const [sessionId] = useState(() => generateSessionId());
  const [candidateId] = useState(() => `candidate_${Date.now()}`);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);

  useEffect(() => {
    const checkMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(
      navigator.userAgent
    );
    setIsMobile(checkMobile);

    // Initialize alerts system
    const initAlerts = async () => {
      const alertsInitialized = await initializeAlerts();
      setAlertsEnabled(alertsInitialized);
      console.log('🔔 Alerts system initialized:', alertsInitialized);
    };

    // Test backend connection
    const checkBackend = async () => {
      const connected = await testBackendConnection();
      setBackendConnected(connected);
      console.log('🔗 Backend connection:', connected ? 'Connected' : 'Disconnected');
    };

    initAlerts();
    checkBackend();
  }, []);

  const handleStreamReady = async (stream, vEl, cEl) => {
    console.log("Stream ready:", stream, vEl, cEl);
    setVideoEl(vEl);
    setCanvasEl(cEl);
    
    const interviewStartTime = new Date();
    setStartTime(interviewStartTime);
    setIsInterviewActive(true);

    // Log interview start event
    const startEvent = {
      type: "interview-start",
      message: "Interview session started",
      timestamp: interviewStartTime.toISOString(),
      meta: { sessionId, candidateId }
    };

    addLogEvent(startEvent);

    // Update session in backend
    if (backendConnected) {
      await updateSession({
        sessionId,
        candidateId,
        candidateName: candidateName.trim(),
        startTime: interviewStartTime.toISOString(),
        status: 'active'
      });
    }
  };

  const addLogEvent = async (event) => {
    // Add to local logs
    setLogs((prev) => [...prev, event]);
    console.log("LOG:", event);

    // Trigger alerts for suspicious events
    if (alertsEnabled) {
      triggerAlert(event.type, event.message);
    }

    // Send to backend if connected
    if (backendConnected && candidateName.trim()) {
      await logEventWithBackend(event, candidateId, candidateName.trim(), sessionId);
    }
  };

  // Handle recording events
  const handleRecordingStateChange = (recording, blob = null) => {
    setIsRecording(recording);
    if (blob) {
      setRecordedBlob(blob);
    }
  };

  // Download recorded video
  const downloadRecording = () => {
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interview_recording_${sessionId}_${new Date().toISOString().slice(0, 10)}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const focusLostCount = logs.filter((l) => l.type === "focus-lost").length;

  const suspiciousEvents = logs.filter(
    (l) =>
      l.type === "multiple-faces" ||
      l.type === "no-face" ||
      l.type === "phone-detected" ||
      l.type === "notes-detected"
  );

  const integrityScore =
    100 - (focusLostCount * 5 + suspiciousEvents.length * 10);

  const downloadReport = () => {
    if (!startTime) {
      alert("Interview has not started yet!");
      return;
    }

    const reportEndTime = endTime || new Date();
    setEndTime(reportEndTime);

    // Prepare candidate data
    const candidateData = {
      candidateName: candidateName.trim() || 'Unknown',
      candidateId,
      sessionId,
      startTime: startTime.toISOString(),
      endTime: reportEndTime.toISOString()
    };

    // Export comprehensive CSV report
    const success = exportProctoringReport(candidateData, logs, {
      backendConnected,
      alertsEnabled
    });

    if (success && isInterviewActive) {
      // Log interview end event
      const endEvent = {
        type: "interview-end",
        message: "Interview session completed - Report downloaded",
        timestamp: reportEndTime.toISOString(),
        meta: { 
          duration: Math.round((reportEndTime - startTime) / (1000 * 60)),
          totalEvents: logs.length,
          integrityScore
        }
      };

      addLogEvent(endEvent);
      setIsInterviewActive(false);

      // Update session in backend
      if (backendConnected) {
        updateSession({
          sessionId,
          candidateId,
          candidateName: candidateName.trim(),
          startTime: startTime.toISOString(),
          endTime: reportEndTime.toISOString(),
          integrityScore,
          status: 'completed'
        });
      }
    }
  };

  // Download backend-generated CSV report
  const downloadBackendReport = async () => {
    if (!backendConnected) {
      alert("Backend is not connected. Using local CSV generation.");
      downloadReport();
      return;
    }

    if (!candidateId) {
      alert("No candidate ID available for backend report.");
      return;
    }

    try {
      await downloadBackendCSV(candidateId, sessionId);
      console.log("✅ Backend CSV report downloaded successfully");
      
      // Mark interview as completed
      if (isInterviewActive) {
        const reportEndTime = new Date();
        setEndTime(reportEndTime);
        setIsInterviewActive(false);

        // Update session
        await updateSession({
          sessionId,
          candidateId,
          candidateName: candidateName.trim(),
          endTime: reportEndTime.toISOString(),
          integrityScore,
          status: 'completed'
        });
      }
    } catch (error) {
      console.error("❌ Failed to download backend report:", error);
      alert("Failed to download backend report. Falling back to local CSV generation.");
      downloadReport();
    }
  };

  // 🔥 Wrapper for mobile check
  if (isMobile) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ff9800",
          fontSize: "20px",
          fontWeight: "bold",
          textAlign: "center",
          padding: "20px",
        }}
      >
        ⚠️ Please open this application on a Laptop/Desktop
      </div>
    );
  }

  // 👇 Original code untouched
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Left side - Video & Detection */}
      <div style={{ flex: 3, padding: 20 }}>
        <h2>Tutedude — Proctor Demo</h2>

        {/* System Status Indicators */}
        <div style={{ marginBottom: 15, display: 'flex', gap: 15, fontSize: 14 }}>
          <span style={{ 
            color: backendConnected ? '#4CAF50' : '#FF5722',
            fontWeight: 'bold'
          }}>
            🔗 Backend: {backendConnected ? 'Connected' : 'Disconnected'}
          </span>
          <span style={{ 
            color: alertsEnabled ? '#4CAF50' : '#FF9800',
            fontWeight: 'bold'
          }}>
            🔔 Alerts: {alertsEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <span style={{ 
            color: isInterviewActive ? '#4CAF50' : '#666',
            fontWeight: 'bold'
          }}>
            🎥 Status: {isInterviewActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Test Alert Button (for debugging) */}
        {alertsEnabled && (
          <button
            onClick={testAlert}
            style={{
              padding: "6px 10px",
              background: "#9C27B0",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              marginRight: 10,
              fontSize: 12
            }}
          >
            🧪 Test Alert
          </button>
        )}

        {/*  Candidate Name Input */}
        <div style={{ marginBottom: 10 }}>
          <label>
            Candidate Name:{" "}
            <input
              type="text"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="Enter candidate name"
              style={{ padding: "4px 6px", marginLeft: "6px" }}
              disabled={isInterviewActive}
            />
          </label>
        </div>

        {/* Session Info */}
        <div style={{ marginBottom: 10, fontSize: 12, color: '#666' }}>
          Session ID: {sessionId} | Candidate ID: {candidateId}
        </div>

        {/* Prevent Start Camera until name entered */}
        {candidateName.trim() === "" ? (
          <button
            onClick={() => alert("⚠️ Please enter your name before starting.")}
            style={{
              padding: "10px 12px",
              background: "#ff9800",
              color: "black",
              border: "none",
              borderRadius: 4,
              cursor: "not-allowed",
            }}
          >
            Start Camera
          </button>
        ) : (
          <VideoFeed 
            onStreamReady={handleStreamReady} 
            onRecordingStateChange={handleRecordingStateChange}
          />
        )}

        {videoEl && canvasEl && (
          <>
            <FocusDetection
              videoEl={videoEl}
              canvasEl={canvasEl}
              addLogEvent={addLogEvent}
            />
            <ObjectDetection
              videoEl={videoEl}
              canvasEl={canvasEl}
              addLogEvent={addLogEvent}
            />
          </>
        )}
      </div>

      {/*  Logs Sidebar */}
      <div
        style={{
          flex: 1,
          borderLeft: "2px solid #ddd",
          padding: 12,
          background: "#ff9800",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h3 style={{ margin: "0 0 10px" }}>Event Logs</h3>

        {/* Quick stats above logs */}
        <div style={{ marginBottom: 10, fontSize: 14, color: "#333" }}>
          <p>
            <strong>Candidate:</strong> {candidateName || "N/A"}
          </p>
          <p>
            <strong>Focus Lost:</strong> {focusLostCount}
          </p>
          <p>
            <strong>Suspicious Events:</strong> {suspiciousEvents.length}
          </p>
          <p>
            <strong>Integrity Score:</strong> {integrityScore}
          </p>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            border: "1px solid #ccc",
            borderRadius: 4,
            padding: 8,
            background: "white",
          }}
        >
          {logs.length === 0 ? (
            <div>No events yet</div>
          ) : (
            logs.map((l, i) => (
              <div
                key={i}
                style={{
                  padding: "6px 4px",
                  borderBottom: "1px solid #eee",
                  fontSize: 14,
                }}
              >
                <strong style={{ color: "#333" }}>{l.type}</strong> — {l.message}
                <br />
                <small style={{ color: "#666" }}>{l.timestamp}</small>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Download Report Button */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button
            onClick={downloadReport}
            style={{
              padding: "10px 12px",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              flex: 1
            }}
          >
            � Download Recording
          </button>
          
          {backendConnected && (
            <button
              onClick={downloadBackendReport}
              style={{
                padding: "10px 12px",
                background: "#28a745",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                flex: 1
              }}
            >
              🚀 Download Backend Report
            </button>
          )}
        </div>
        
        {recordedBlob && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={downloadRecording}
              style={{
                padding: "10px 12px",
                background: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                width: "100%"
              }}
            >
              📹 Download Recording
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

