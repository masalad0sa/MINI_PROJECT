const BLOCKED_CAMERA_LABEL_HINTS = [
  "usb",
  "external",
  "virtual",
  "obs",
  "droidcam",
  "epoccam",
  "iriun",
  "ivcam",
  "cam link",
  "capture",
  "ndi",
  "snap camera",
  "logitech",
  "elgato",
  "razer",
  "avermedia",
  "phone",
  "continuity camera",
];

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

function isBlockedCameraLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return false;
  return BLOCKED_CAMERA_LABEL_HINTS.some((hint) => normalized.includes(hint));
}

async function getVideoInputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

function createExternalCameraError(): Error {
  return new Error(
    "External and virtual cameras are blocked. Please use your built-in webcam.",
  );
}

/**
 * Get a camera stream while enforcing built-in webcam usage.
 * If the default selected device looks external, tries to switch to an
 * internal device and fails if none is available.
 */
export async function getBuiltInCameraStream(
  constraints: MediaTrackConstraints,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is not supported in this browser.");
  }

  let defaultStream: MediaStream | null = null;

  try {
    defaultStream = await navigator.mediaDevices.getUserMedia({
      video: constraints,
      audio: false,
    });
  } catch {
    throw new Error("Camera access denied or unavailable.");
  }

  try {
    const defaultTrack = defaultStream.getVideoTracks()[0];
    if (!defaultTrack) {
      throw new Error("No camera track is available.");
    }

    const selectedDeviceId = defaultTrack.getSettings().deviceId;
    const devices = await getVideoInputDevices();
    const selectedDevice = devices.find(
      (device) => device.deviceId === selectedDeviceId,
    );
    const selectedLabel = (defaultTrack.label || selectedDevice?.label || "").trim();

    if (!isBlockedCameraLabel(selectedLabel)) {
      return defaultStream;
    }

    const builtInDevice = devices.find(
      (device) =>
        device.deviceId !== selectedDeviceId &&
        !isBlockedCameraLabel(device.label),
    );

    if (!builtInDevice) {
      throw createExternalCameraError();
    }

    const replacementStream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...constraints,
        deviceId: { exact: builtInDevice.deviceId },
      },
      audio: false,
    });

    const replacementTrack = replacementStream.getVideoTracks()[0];
    const replacementLabel = (
      replacementTrack?.label ||
      builtInDevice.label ||
      ""
    ).trim();

    if (isBlockedCameraLabel(replacementLabel)) {
      stopMediaStream(replacementStream);
      throw createExternalCameraError();
    }

    stopMediaStream(defaultStream);
    return replacementStream;
  } catch (error) {
    stopMediaStream(defaultStream);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to initialize built-in webcam.");
  }
}

/**
 * Block browser screen-sharing APIs in the client runtime.
 * This is a client-side guard and should be paired with server policy headers.
 */
export function disableScreenSharingApis() {
  const blockedDisplayCapture = async (): Promise<MediaStream> => {
    throw new DOMException(
      "Screen sharing is disabled for this platform.",
      "NotAllowedError",
    );
  };

  if (typeof navigator === "undefined") return;

  type MediaDevicesWithDisplayCapture = MediaDevices & {
    getDisplayMedia?: (
      constraints?: DisplayMediaStreamConstraints,
    ) => Promise<MediaStream>;
  };

  const mediaDevices = navigator.mediaDevices as MediaDevicesWithDisplayCapture;

  if (mediaDevices?.getDisplayMedia) {
    try {
      mediaDevices.getDisplayMedia = blockedDisplayCapture;
    } catch {
      try {
        Object.defineProperty(mediaDevices, "getDisplayMedia", {
          value: blockedDisplayCapture,
          configurable: false,
          writable: false,
        });
      } catch {
        // Ignore if browser blocks overriding
      }
    }
  }

  const legacyNavigator = navigator as Navigator & {
    getDisplayMedia?: (
      constraints?: DisplayMediaStreamConstraints,
    ) => Promise<MediaStream>;
  };

  if (legacyNavigator.getDisplayMedia) {
    try {
      legacyNavigator.getDisplayMedia = blockedDisplayCapture;
    } catch {
      try {
        Object.defineProperty(legacyNavigator, "getDisplayMedia", {
          value: blockedDisplayCapture,
          configurable: false,
          writable: false,
        });
      } catch {
        // Ignore if browser blocks overriding
      }
    }
  }
}
