import React, { useEffect, useRef } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";

export default function ObjectDetection({ videoEl, canvasEl, addLogEvent, enabled = true }) {
    const modelRef = useRef(null);
    const detectionRef = useRef(null);

    // To prevent spamming logs for same object repeatedly
    const lastLogged = useRef({});

    useEffect(() => {
        if (!videoEl || !canvasEl || !enabled) return;

        let isMounted = true;

        // Load model
        cocoSsd.load().then((model) => {
            if (!isMounted) return;
            modelRef.current = model;
            startDetection();
        });

        const startDetection = () => {
            detectionRef.current = setInterval(async () => {
                if (!videoEl || videoEl.readyState < 2 || !modelRef.current) return;

                const predictions = await modelRef.current.detect(videoEl);

                if (!canvasEl) return;
                const ctx = canvasEl.getContext("2d");
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

                // Draw predictions and log suspicious items
                predictions.forEach((pred) => {
                    const { class: className, bbox, score } = pred;
                    if (score < 0.5) return;

                    const targets = ["cell phone", "book", "laptop", "keyboard", "mouse", "notebook", "paper"];
                    if (targets.includes(className)) {
                        const now = Date.now();
                        if (!lastLogged.current[className] || now - lastLogged.current[className] > 5000) {
                            lastLogged.current[className] = now;

                           
                            if (className === "cell phone") {
                                addLogEvent &&
                                    addLogEvent({
                                        type: "phone-detected",
                                        message: "Cell phone detected",
                                        timestamp: new Date().toISOString(),
                                        meta: { bbox },
                                    });
                            } else if (className === "book") {
                                addLogEvent &&
                                    addLogEvent({
                                        type: "notes-detected",
                                        message: "Book/Notes detected",
                                        timestamp: new Date().toISOString(),
                                        meta: { bbox },
                                    });
                            } else {
                                addLogEvent &&
                                    addLogEvent({
                                        type: className,
                                        message: `${className} detected`,
                                        timestamp: new Date().toISOString(),
                                        meta: { bbox },
                                    });
                            }
                        }
                    }

                    // Draw bounding box
                    ctx.strokeStyle = "red";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(bbox[0], bbox[1], bbox[2], bbox[3]);

                
                    ctx.font = "12px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`${className} (${Math.round(score * 100)}%)`, bbox[0], bbox[1] > 10 ? bbox[1] - 5 : 10);
                });
            }, 200);
        };

        return () => {
            isMounted = false;
            if (detectionRef.current) {
                clearInterval(detectionRef.current);
                detectionRef.current = null;
            }
        };
    }, [videoEl, canvasEl, enabled, addLogEvent]);

    return null;
}












