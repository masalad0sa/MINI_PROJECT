"""Simple camera test script."""
import cv2
import sys

print("Testing camera access...")
print(f"OpenCV version: {cv2.__version__}")

# Try different camera backends
backends = [
    ("DirectShow", cv2.CAP_DSHOW),
    ("MSMF", cv2.CAP_MSMF),
    ("Default", cv2.CAP_ANY),
]

for backend_name, backend in backends:
    for cam_idx in [0, 1]:
        print(f"\nTrying camera {cam_idx} with {backend_name}...")
        cap = cv2.VideoCapture(cam_idx, backend)

        if not cap.isOpened():
            print(f"  Failed to open")
            continue

        ret, frame = cap.read()
        if ret and frame is not None:
            print(f"  SUCCESS! Frame shape: {frame.shape}")

            # Show a window briefly
            cv2.imshow("Camera Test - Press any key", frame)
            cv2.waitKey(2000)
            cv2.destroyAllWindows()
            cap.release()
            print("\nCamera is working! You can run main.py now.")
            sys.exit(0)
        else:
            print(f"  Opened but read() failed")
            cap.release()

print("\nNo working camera found!")
print("Make sure:")
print("  1. Your webcam is connected")
print("  2. No other app is using the camera")
print("  3. Camera permissions are granted in Windows Settings")
sys.exit(1)
