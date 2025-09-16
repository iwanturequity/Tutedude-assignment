// src/utils/detectionHelpers.js

// --- Thresholds & Config ---
export const FOCUS_LOOK_AWAY_THRESHOLD = 5000; // 5 seconds
export const FOCUS_NO_FACE_THRESHOLD = 10000; // 10 seconds
export const LOG_COOLDOWN = 2000; // 2 seconds between repeated logs

export const OBJECT_DETECTION_CONFIDENCE = 0.5; // confidence threshold
export const OBJECT_LOG_COOLDOWN = 5000; // log same object every 5 sec max

// --- Timer helpers ---
export function startTimer(callback, interval = 1000) {
  const timerId = setInterval(callback, interval);
  return timerId;
}

export function stopTimer(timerId) {
  if (timerId) clearInterval(timerId);
}

// --- Log event wrapper to prevent spamming ---
export function logEvent(addLogEvent, type, message, meta = {}, lastLoggedRef = null, cooldown = LOG_COOLDOWN) {
  if (!addLogEvent) return;
  const now = Date.now();

  // If lastLoggedRef is provided, check cooldown
  if (lastLoggedRef) {
    if (!lastLoggedRef.current) lastLoggedRef.current = {};
    if (lastLoggedRef.current[type] && now - lastLoggedRef.current[type] < cooldown) return;
    lastLoggedRef.current[type] = now;
  }

  addLogEvent({
    type,
    message,
    timestamp: new Date().toISOString(),
    meta,
  });
}

// --- Integrity score calculation ---
export function calculateIntegrityScore(events) {
  // Base score 100
  let score = 100;

  events.forEach((ev) => {
    switch (ev.type) {
      case "look-away":
        score -= 2; // each look-away deduction
        break;
      case "no-face":
        score -= 5;
        break;
      case "multiple-faces":
        score -= 10;
        break;
      case "cell phone":
      case "book":
      case "notebook":
      case "paper":
        score -= 8;
        break;
      default:
        break;
    }
  });

  if (score < 0) score = 0;
  return score;
}
