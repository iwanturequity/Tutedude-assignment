// src/utils/apiHelpers.js

/**
 * API Helper Functions for Backend Communication
 * Handles all communication with the Express/MongoDB backend
 */

// Auto-detect environment for API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' ? 
    'http://localhost:5000' : 
    'https://tutedude-assignment-zhcf.onrender.com');

// Helper function to handle API responses
const handleResponse = async (response) => {
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }
  
  return data;
};

// Generate unique session ID
export const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Send event to backend
export const logEventToBackend = async (eventData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData)
    });

    const result = await handleResponse(response);
    console.log('✅ Event logged to backend:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to log event to backend:', error);
    // Don't throw error - continue functioning even if backend is down
    return null;
  }
};

// Create or update interview session
export const updateSession = async (sessionData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionData)
    });

    const result = await handleResponse(response);
    console.log('✅ Session updated:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to update session:', error);
    return null;
  }
};

// Fetch candidate reports
export const fetchCandidateReports = async (candidateId, sessionId = null) => {
  try {
    const url = sessionId 
      ? `${API_BASE_URL}/reports/${candidateId}?sessionId=${sessionId}`
      : `${API_BASE_URL}/reports/${candidateId}`;
      
    const response = await fetch(url);
    const result = await handleResponse(response);
    
    console.log('✅ Reports fetched:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to fetch reports:', error);
    throw error;
  }
};

// Download CSV report from backend
export const downloadBackendCSV = async (candidateId, sessionId = null) => {
  try {
    const url = sessionId 
      ? `${API_BASE_URL}/report/csv/${candidateId}?sessionId=${sessionId}`
      : `${API_BASE_URL}/report/csv/${candidateId}`;
      
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to download CSV');
    }

    const csvBlob = await response.blob();
    const csvUrl = URL.createObjectURL(csvBlob);
    
    // Trigger download
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = `ProctoringReport_${candidateId}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    URL.revokeObjectURL(csvUrl);
    
    console.log('✅ Backend CSV downloaded successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to download backend CSV:', error);
    throw error;
  }
};

// Test backend connection
export const testBackendConnection = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const result = await handleResponse(response);
    
    console.log('✅ Backend connection test:', result);
    return true;
  } catch (error) {
    console.error('❌ Backend connection failed:', error);
    return false;
  }
};

// Enhanced event logging with backend sync
export const logEventWithBackend = async (eventData, candidateId, candidateName, sessionId) => {
  // Prepare event data for backend
  const backendEventData = {
    candidateId,
    candidateName,
    sessionId,
    eventType: eventData.type,
    message: eventData.message,
    meta: eventData.meta || {},
    timestamp: eventData.timestamp
  };

  // Send to backend (non-blocking)
  logEventToBackend(backendEventData);

  // Return original event data for local logging
  return eventData;
};
