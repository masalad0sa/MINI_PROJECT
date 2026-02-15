import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle } from "lucide-react";

const API_BASE =
  ((import.meta as any).env.VITE_API_BASE as string) ||
  "http://localhost:5000/api";

interface WebcamPreviewProps {
  onReady?: () => void;
  onFaceDetectionChange?: (detected: boolean) => void;
}

export function WebcamPreview({
  onReady,
  onFaceDetectionChange,
}: WebcamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState<boolean | null>(null);
  const [isCheckingFace, setIsCheckingFace] = useState(false);

  useEffect(() => {
    if (!isReady || error) {
      setFaceDetected(null);
      return;
    }

    let cancelled = false;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");

    const detectFace = async () => {
      const video = videoRef.current;
      if (!video || !ctx || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      setIsCheckingFace(true);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.7);

      try {
        const response = await fetch(`${API_BASE}/proctoring/system-check/frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });

        if (!response.ok) {
          if (!cancelled) {
            setFaceDetected(false);
            onFaceDetectionChange?.(false);
          }
          return;
        }

        const data = await response.json();
        const detected = Number(data?.face_count ?? 0) > 0;

        if (!cancelled) {
          setFaceDetected(detected);
          onFaceDetectionChange?.(detected);
        }
      } catch {
        if (!cancelled) {
          setFaceDetected(false);
          onFaceDetectionChange?.(false);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingFace(false);
        }
      }
    };

    void detectFace();
    const intervalId = window.setInterval(() => {
      void detectFace();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [error, isReady, onFaceDetectionChange]);

  useEffect(() => {
    async function initWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
          setError(null);
          setFaceDetected(null);
          onReady?.();
        }
      } catch (err: any) {
        setError(err.message || "Failed to access webcam");
        setIsReady(false);
        setFaceDetected(false);
        onFaceDetectionChange?.(false);
      }
    }

    initWebcam();

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, [onFaceDetectionChange, onReady]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {!isReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="text-white text-sm">Loading webcam...</span>
          </div>
        )}
      </div>

      {error ? (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-800">Webcam Error</div>
            <div className="text-sm text-red-700">{error}</div>
            <div className="text-xs text-red-600 mt-1">
              Please allow camera permissions and try again.
            </div>
          </div>
        </div>
      ) : isReady ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-sm font-medium text-green-700">
              Webcam is ready
            </span>
          </div>
          <div
            className={`rounded-lg p-3 text-sm font-medium ${
              faceDetected === true
                ? "bg-green-50 border border-green-200 text-green-700"
                : faceDetected === false
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-amber-50 border border-amber-200 text-amber-700"
            }`}
          >
            {faceDetected === true
              ? "Face detected"
              : faceDetected === false
                ? "No face detected. Sit in front of the camera."
                : isCheckingFace
                  ? "Checking for face..."
                  : "Preparing face check..."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
