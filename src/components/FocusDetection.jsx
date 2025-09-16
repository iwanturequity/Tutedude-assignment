import React, { useEffect, useRef } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import { FOCUS_LOOK_AWAY_THRESHOLD, FOCUS_NO_FACE_THRESHOLD, logEvent } from "../utils/detectionHelpers";

export default function FocusDetection({ videoEl, canvasEl, addLogEvent, enabled = true }) {
    const faceMeshRef = useRef(null);
    const cameraRef = useRef(null);
    const watcherRef = useRef(null);

    const lastFaceSeenAt = useRef(Date.now());
    const lookingAwaySince = useRef(null);
    const lastNoFaceLoggedAt = useRef(0);

    const LOOK_AWAY_THRESHOLD = FOCUS_LOOK_AWAY_THRESHOLD;
    const NO_FACE_THRESHOLD = FOCUS_NO_FACE_THRESHOLD;
    const LOG_COOLDOWN = 2000;
    const GRACE_PERIOD = 2000;

    const lastState = useRef("unknown");
    const lastObjectState = useRef("none");

    useEffect(() => {
        if (!videoEl || !canvasEl || !enabled) return;

        const faceMesh = new FaceMesh({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        faceMesh.setOptions({
            maxNumFaces: 2,
            refineLandmarks: true,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(onResults);
        faceMeshRef.current = faceMesh;

        try {
            const camera = new Camera(videoEl, {
                onFrame: async () => {
                    await faceMesh.send({ image: videoEl });
                },
                width: videoEl.videoWidth || 640,
                height: videoEl.videoHeight || 480,
            });
            camera.start();
            cameraRef.current = camera;

            setTimeout(() => {
                if (videoEl.srcObject) {
                    window.focusStream = videoEl.srcObject;
                }
            }, 1000);
        } catch (err) {
            console.warn("Camera util failed, falling back to periodic send:", err);
            const fallbackInterval = setInterval(() => {
                if (videoEl && videoEl.readyState >= 2) {
                    faceMesh.send({ image: videoEl }).catch(() => { });
                }
            }, 100);
            cameraRef.current = { stop: () => clearInterval(fallbackInterval) };
        }

        return () => {
            if (watcherRef.current) {
                clearInterval(watcherRef.current);
                watcherRef.current = null;
            }
            try {
                cameraRef.current?.stop();
            } catch (e) { }
            faceMeshRef.current?.close?.();
            faceMeshRef.current = null;
            if (videoEl && videoEl.srcObject) {
                videoEl.srcObject.getTracks().forEach((t) => t.stop());
                videoEl.srcObject = null;
            }
            if (window.focusStream) {
                window.focusStream.getTracks().forEach((t) => t.stop());
                window.focusStream = null;
            }
        };
    }, [videoEl, canvasEl, enabled]);

    const drawLandmarks = (ctx, landmarks, canvasW, canvasH) => {
        ctx.fillStyle = "rgba(0,255,0,0.6)";
        for (let i = 0; i < landmarks.length; i++) {
            const x = landmarks[i].x * canvasW;
            const y = landmarks[i].y * canvasH;
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
        }
    };

    function onResults(results) {
        if (!canvasEl) return;
        const ctx = canvasEl.getContext("2d");

        try {
            if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
                if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
                    canvasEl.width = videoEl.videoWidth;
                    canvasEl.height = videoEl.videoHeight;
                }
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            }
        } catch (e) { }

        const faces = results.multiFaceLandmarks || [];
        const now = Date.now();

        // --- Multiple faces ---
        if (faces.length > 1) {
            if (lastState.current !== "multiple-faces") {
                addLogEvent && addLogEvent({
                    type: "multiple-faces",
                    message: `Multiple faces detected (${faces.length})`,
                    timestamp: new Date().toISOString(),
                    meta: { count: faces.length },
                });
                lastState.current = "multiple-faces";
            }
            return;
        }

        // --- No face detected ---
        if (faces.length === 0) {
            if (lastState.current !== "no-face" && now - lastFaceSeenAt.current > GRACE_PERIOD) {
                addLogEvent && addLogEvent({
                    type: "no-face",
                    message: "No face detected",
                    timestamp: new Date().toISOString(),
                    meta: {},
                });
                lastState.current = "no-face";
            }
            return;
        }

        // --- Face detected ---
        lastFaceSeenAt.current = now;
        if (lastState.current !== "face") {
            addLogEvent && addLogEvent({
                type: "face",
                message: "Face detected",
                timestamp: new Date().toISOString(),
                meta: {},
            });
            lastState.current = "face";
        }

        const primary = faces[0];
        try {
            drawLandmarks(ctx, primary, canvasEl.width, canvasEl.height);
        } catch (e) { }

        // --- Looking away detection ---
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const lm of primary) {
            if (lm.x < minX) minX = lm.x;
            if (lm.y < minY) minY = lm.y;
            if (lm.x > maxX) maxX = lm.x;
            if (lm.y > maxY) maxY = lm.y;
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const LEFT_BOUND = 0.28;
        const RIGHT_BOUND = 0.72;
        const TOP_BOUND = 0.20;
        const BOTTOM_BOUND = 0.80;

        const isLookingAway =
            cx < LEFT_BOUND || cx > RIGHT_BOUND || cy < TOP_BOUND || cy > BOTTOM_BOUND;

        if (isLookingAway) {
            if (!lookingAwaySince.current) lookingAwaySince.current = now;
            const awayDuration = now - lookingAwaySince.current;
            if (awayDuration >= LOOK_AWAY_THRESHOLD && lastState.current !== "look-away") {
                addLogEvent && addLogEvent({
                    type: "look-away",
                    message: `User looking away for ${Math.round(awayDuration / 1000)}s`,
                    timestamp: new Date().toISOString(),
                    meta: { awayDurationMs: awayDuration, faceCenter: { cx, cy } },
                });
                lastState.current = "look-away";
            }
        } else {
            lookingAwaySince.current = null;
            if (lastState.current === "look-away") {
                addLogEvent && addLogEvent({
                    type: "face",
                    message: "Back to normal - Face detected",
                    timestamp: new Date().toISOString(),
                });
                lastState.current = "face";
            }
        }
        const detectedObject = results.detectedObject || "none";
        if (detectedObject !== lastObjectState.current) {
            if (detectedObject !== "none") {
                if (detectedObject === "cell phone") {
                    addLogEvent && addLogEvent({
                        type: "phone-detected",
                        message: "Cell phone detected",
                        timestamp: new Date().toISOString(),
                        meta: {},
                    });
                }
                if (detectedObject === "book") {
                    addLogEvent && addLogEvent({
                        type: "notes-detected",
                        message: "Book/Notes detected",
                        timestamp: new Date().toISOString(),
                        meta: {},
                    });
                }
            } else {
                addLogEvent && addLogEvent({
                    type: "object-cleared",
                    message: `${lastObjectState.current} removed`,
                    timestamp: new Date().toISOString(),
                    meta: {},
                });
            }
            lastObjectState.current = detectedObject;
        }
    }

    // --- Watcher for long-term no face ---
    useEffect(() => {
        watcherRef.current = setInterval(() => {
            if (!videoEl || !window.focusStream) return;
            const now = Date.now();
            if (!faceMeshRef.current) return;

            if (lastState.current === "no-face" && now - lastFaceSeenAt.current >= NO_FACE_THRESHOLD) {
                if (now - lastNoFaceLoggedAt.current > LOG_COOLDOWN) {
                    lastNoFaceLoggedAt.current = now;
                    addLogEvent &&
                        addLogEvent({
                            type: "no-face",
                            message: `Still no face detected for ${Math.round((now - lastFaceSeenAt.current) / 1000)}s`,
                            timestamp: new Date().toISOString(),
                            meta: {},
                        });
                }
            }
        }, 1000);

        return () => {
            if (watcherRef.current) {
                clearInterval(watcherRef.current);
                watcherRef.current = null;
            }
        };
    }, [videoEl, canvasEl]);

    return null;
}

