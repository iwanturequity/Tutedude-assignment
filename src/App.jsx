import React, { useState, useEffect, useRef } from "react";
import VideoFeed from "./components/VideoFeed";
import FocusDetection from "./components/FocusDetection";
import ObjectDetection from "./components/ObjectDetection";
import { initializeAlerts, triggerAlert, testAlert } from "./utils/alertHelpers";
import { generateSessionId, logEventWithBackend, updateSession, testBackendConnection, downloadBackendCSV } from "./utils/apiHelpers";
import { exportProctoringReport } from "./utils/csvHelpers";
import "./App.css";

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

  // 👇 Modern Professional UI
  return (
    <div className="app-container">
      {/* Main Header */}
      <header className="main-header">
        <h1 className="main-title">Tutedude — Proctoring System</h1>
        
        {/* System Status Indicators */}
        <div className="status-indicators">
          <div className={`status-badge ${backendConnected ? 'connected' : 'disconnected'}`}>
            🔗 Backend: {backendConnected ? 'Connected' : 'Disconnected'}
          </div>
          <div className={`status-badge ${alertsEnabled ? 'enabled' : 'disabled'}`}>
            🔔 Alerts: {alertsEnabled ? 'Enabled' : 'Disabled'}
          </div>
          <div className={`status-badge ${isInterviewActive ? 'active' : 'inactive'}`}>
            🎥 Status: {isInterviewActive ? 'Active' : 'Inactive'}
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="main-content">
        {/* Video Section Card */}
        <div className="video-card">
          <div className="card-header">
            <h2>Video Monitoring</h2>
            {alertsEnabled && (
              <button onClick={testAlert} className="test-alert-btn">
                🧪 Test Alert
              </button>
            )}
          </div>

          {/* Candidate Input Section */}
          <div className="candidate-section">
            <div className="input-group">
              <label htmlFor="candidateName">Candidate Name:</label>
              <input
                id="candidateName"
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="Enter candidate name"
                disabled={isInterviewActive}
                className="candidate-input"
              />
            </div>
            
            <div className="session-info">
              Session ID: {sessionId} | Candidate ID: {candidateId}
            </div>
          </div>

          {/* Video Feed Container */}
          <div className="video-container">
            {candidateName.trim() === "" ? (
              <button
                onClick={() => alert("⚠️ Please enter your name before starting.")}
                className="start-camera-disabled"
              >
                📹 Start Camera
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
        </div>

        {/* Event Logs Card */}
        <div className="logs-card">
          <div className="card-header">
            <h2>Event Logs</h2>
          </div>

          {/* Stats Summary */}
          <div className="stats-summary">
            <div className="stat-item">
              <span className="stat-label">Candidate:</span>
              <span className="stat-value">{candidateName || "N/A"}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Focus Lost:</span>
              <span className="stat-value">{focusLostCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Suspicious Events:</span>
              <span className="stat-value">{suspiciousEvents.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Integrity Score:</span>
              <span className="stat-value">{integrityScore}</span>
            </div>
          </div>

          {/* Logs Container */}
          <div className="logs-container">
            {logs.length === 0 ? (
              <div className="no-events">No events yet</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="log-entry">
                  <div className="log-header">
                    <span className={`event-type ${l.type}`}>{l.type}</span>
                    <span className="log-time">{new Date(l.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="log-message">{l.message}</div>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button onClick={downloadReport} className="btn btn-primary">
              📊 Download CSV Report
            </button>
            
            {backendConnected && (
              <button onClick={downloadBackendReport} className="btn btn-success">
                🚀 Download Backend Report
              </button>
            )}
            
            {recordedBlob && (
              <button onClick={downloadRecording} className="btn btn-secondary">
                📹 Download Recording
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

