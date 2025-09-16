// src/utils/alertHelpers.js

/**
 * Alert and Notification Helper Functions
 * Handles audio alerts and browser notifications for suspicious events
 */

// Request notification permission on page load
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'default') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  return Notification.permission === 'granted';
};

// Generate a beep sound using Web Audio API
export const generateBeep = (frequency = 800, duration = 200, volume = 0.3) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);

  } catch (error) {
    console.warn('Could not generate beep sound:', error);
  }
};

// Play beep sound using Web Audio API
export const playBeep = () => {
  try {
    // Generate a simple beep sound
    generateBeep(800, 300, 0.3);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
};

// Show browser notification
export const showNotification = (title, message, options = {}) => {
  if (Notification.permission !== 'granted') {
    console.warn('Notifications not permitted');
    return;
  }

  const defaultOptions = {
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: 'proctoring-alert',
    requireInteraction: true,
    ...options
  };

  try {
    const notification = new Notification(title, {
      body: message,
      ...defaultOptions
    });

    // Auto close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
  }
};

// Main alert trigger function
export const triggerAlert = (eventType, message = '') => {
  const suspiciousEvents = [
    'multiple-faces',
    'no-face', 
    'phone-detected', 
    'notes-detected', 
    'book',
    'laptop',
    'keyboard',
    'look-away'
  ];

  if (suspiciousEvents.includes(eventType)) {
    // Play beep sound
    playBeep();

    // Show notification
    const alertMessages = {
      'multiple-faces': '⚠️ Multiple faces detected in frame',
      'no-face': '⚠️ No face detected - candidate may have left',
      'phone-detected': '📱 Mobile phone detected',
      'notes-detected': '📖 Books or notes detected', 
      'book': '📚 Book detected',
      'laptop': '💻 Extra laptop detected',
      'keyboard': '⌨️ Extra keyboard detected',
      'look-away': '👀 Candidate looking away from screen'
    };

    const notificationMessage = alertMessages[eventType] || message || 'Suspicious activity detected';
    
    showNotification(
      'Proctoring Alert',
      notificationMessage,
      {
        icon: '/vite.svg',
        tag: eventType,
        requireInteraction: eventType === 'multiple-faces' || eventType === 'phone-detected'
      }
    );

    console.log(`🚨 ALERT: ${eventType} - ${notificationMessage}`);
  }
};

// Initialize alerts system
export const initializeAlerts = async () => {
  console.log('🔔 Initializing alerts system...');
  
  const hasPermission = await requestNotificationPermission();
  
  if (hasPermission) {
    console.log('✅ Notification permission granted');
  } else {
    console.warn('⚠️ Notification permission denied or not supported');
  }

  return hasPermission;
};

// Test alert function for debugging
export const testAlert = () => {
  console.log('🧪 Testing alert system...');
  
  playBeep();
  
  showNotification(
    'Test Alert',
    'This is a test of the proctoring alert system.',
    { tag: 'test', requireInteraction: false }
  );
};
