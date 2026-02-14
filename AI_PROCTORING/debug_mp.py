
import mediapipe
import sys

print(f"Python Executable: {sys.executable}")
print(f"MediaPipe Version: {getattr(mediapipe, '__version__', 'Unknown')}")
print(f"MediaPipe Location: {getattr(mediapipe, '__file__', 'Unknown')}")

try:
    print("Attempting to access mediapipe.solutions...")
    print(mediapipe.solutions)
    print("SUCCESS: mediapipe.solutions exists!")
except AttributeError as e:
    print(f"FAILURE: {e}")
    print("Available attributes in mediapipe:")
    print(dir(mediapipe))
