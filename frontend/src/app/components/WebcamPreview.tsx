import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle } from "lucide-react";

interface WebcamPreviewProps {
  onReady?: () => void;
}

export function WebcamPreview({ onReady }: WebcamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          onReady?.();
        }
      } catch (err: any) {
        setError(err.message || "Failed to access webcam");
        setIsReady(false);
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
  }, [onReady]);

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
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="text-sm font-medium text-green-700">
            Webcam is ready
          </span>
        </div>
      ) : null}
    </div>
  );
}
