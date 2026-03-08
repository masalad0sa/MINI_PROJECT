# Exam Proctoring System — Phase-Wise Improvement Plan

## Current State Assessment

After a thorough analysis of the entire codebase (frontend, backend, AI service), here are the findings organized into a phased improvement plan.

---

## CRITICAL BUGS FOUND (Must Fix First)

### Bug 1: Proctoring Frame Endpoint Has No Authentication
- **File**: `backend/src/routes/proctoring.js`
- **Issue**: `router.post('/:id/frame', processFrame)` has no `protect` middleware — anyone can send frames without being logged in.
- **Impact**: An attacker could spam the AI service or inject fake frames.

### Bug 2: Frontend Uses `fetch()` Without Auth Token for Proctoring
- **File**: `frontend/src/hooks/useProctoring.ts` (line ~88)
- **Issue**: `fetch(${apiBase}/proctoring/...)` does NOT include `Authorization: Bearer` header. Every other API call uses `getAuthHeader()` but proctoring doesn't.
- **Impact**: Once auth is added to the route, all proctoring will break. Currently it works only because the route is unprotected.

### Bug 3: `objectsOnly: true` Mode Skips All Face/Gaze Analysis on Server
- **File**: `frontend/src/hooks/useProctoring.ts` (line ~92)
- **Issue**: The frontend sends `objectsOnly: true` to the Python server, which means the server ONLY checks for prohibited objects (YOLO) and skips face mesh, gaze, head pose, and behavior scoring entirely. The browser-side `useFaceLandmarks` hook handles face/gaze locally, but it cannot do YOLO object detection.
- **Root cause**: This is a **design split** — browser does face tracking, server does object detection. The problem is when the browser's MediaPipe model **fails to load** (GPU unavailable, WASM error, slow network), the entire face/gaze/head tracking stops with no fallback.
- **Impact**: On many machines, MediaPipe FaceLandmarker fails to initialize → zero face tracking → zero violations → exam is essentially unproctored.

### Bug 4: No Fallback When Browser Face Model Fails
- **File**: `frontend/src/hooks/useFaceLandmarks.ts` (line ~330)
- **Issue**: If both GPU and CPU delegates fail, `landmarkerRef.current` stays `null`. The processing loop silently does nothing. No error is surfaced to the user, no frames are sent to the server for full analysis.
- **Impact**: Student takes exam with completely disabled proctoring and nobody knows.

### Bug 5: Unused TensorFlow Dependencies
- **File**: `frontend/package.json`
- **Issue**: `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`, `@tensorflow-models/face-landmarks-detection` are listed as dependencies but **never imported or used** anywhere in the codebase. The project uses `@mediapipe/tasks-vision` instead.
- **Impact**: Adds ~15-20MB to bundle size for zero benefit. Slows install and build.

### Bug 6: `cv2.flip(frame, 1)` in Server Causes Mirror Mismatch  
- **File**: `AI_PROCTORING/server.py` (line ~207)
- **Issue**: The server horizontally flips every frame. But the browser already captures a mirrored webcam feed. So the frame gets flipped TWICE — once by the browser's canvas (mirror by default) and once by the server. This can confuse the gaze direction detection (LEFT becomes RIGHT).
- **Impact**: Eye gaze "LEFT" and "RIGHT" detections from the server may be inverted compared to what the browser detects.

### Bug 7: WebcamPreview Face Check Route Doesn't Match Server
- **File**: `frontend/src/app/components/WebcamPreview.tsx` (line ~51)
- **Issue**: Sends to `/api/proctoring/system-check/frame` which resolves to examId="system-check". This works but creates an orphan session state in the Python server that wastes memory for 30 minutes.

---

## PHASE 1: Fix CV Integration & Critical Bugs (Week 1-2)
> **Goal**: Make proctoring actually work reliably on the website.

### 1.1 Add Server-Side Fallback When Browser Model Fails
- In `useFaceLandmarks.ts`: When model init fails, set a `modelFailed` state
- In `useProctoring.ts`: When `faceState.isLoading` stays true after timeout OR model failed, switch to `objectsOnly: false` mode — send frames to server for FULL analysis (face + gaze + objects)
- This ensures proctoring works even when browser-side MediaPipe fails

### 1.2 Add Auth to Proctoring Route
- In `backend/src/routes/proctoring.js`: Add `protect` middleware  
- In `frontend/src/hooks/useProctoring.ts`: Add `Authorization: Bearer` header to fetch calls

### 1.3 Fix Frame Mirroring
- Remove `cv2.flip(frame, 1)` in `server.py` OR flip in the frontend before sending
- Standardize: browser sends un-mirrored frames, server processes as-is

### 1.4 Remove Unused TF Dependencies
- Remove `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`, `@tensorflow-models/face-landmarks-detection` from `frontend/package.json`

### 1.5 Add Proctoring Health Check Before Exam Start
- In `PreExamCheck.tsx`: Check both `/api/proctoring/health` (backend+Python) AND browser MediaPipe model
- Block exam start if AI service is down
- Show clear error: "AI proctoring service unavailable, please try again later"

### 1.6 Fix System Check Session Leak
- Use a dedicated `/api/proctoring/system-check` endpoint with no session state, or add cleanup

---

## PHASE 2: Improve Reliability & Accuracy (Week 3-4)
> **Goal**: Reduce false positives, improve detection accuracy.

### 2.1 Adaptive Frame Rate Based on Network/Performance  
- Current: Fixed 2s interval for frame sending
- Improvement: Measure RTT of frame processing; if server responds in <500ms, increase to every 1.5s; if >3s, decrease to every 4s
- Add frame queue with drop policy (skip if previous frame still processing)

### 2.2 Improve Gaze Calibration
- Add a 5-second "look at the center of your screen" calibration step in `PreExamCheck`
- Store baseline gaze ratios per student session
- Use these baselines instead of generic thresholds (people's eyes differ)

### 2.3 Add Confidence Scoring to Violations
- Currently violations are binary (detected/not). Add confidence levels:
  - `PROHIBITED_OBJECT` with 90%+ confidence → immediate violation
  - `PROHIBITED_OBJECT` with 60-90% → warning only, needs 3 consecutive frames to confirm
- Already partially implemented with `high_confidence_objects` vs `confirmed_objects`, but frontend ignores the distinction

### 2.4 Network Resilience  
- Current: If Python service is down, frontend gets 503 error and silently drops the frame
- Add: Retry with exponential backoff (max 3 retries)
- Add: Queue frames locally and batch-send when connection recovers
- Add: Visual indicator in exam UI: "AI monitoring temporarily unavailable"

### 2.5 Fix Violation Double-Counting
- Both browser AND server can fire violations for the same event (e.g., NO_FACE)
- Browser fires from `useFaceLandmarks` → `useProctoring` effect
- Server fires from `process_frame` → violation persistence
- Need deduplication: if server already logged it (`backendLogged: true`), browser should NOT also call `handleViolation → api.logViolation`

---

## PHASE 3: Security Hardening (Week 5-6)
> **Goal**: Prevent cheating bypasses and harden the system.

### 3.1 Frame Authenticity Verification
- Currently: Student's browser sends base64 images. Nothing stops spoofing (replay attack with pre-recorded video or static image)
- Add: Periodic "liveness challenges" — ask student to blink, turn head slightly
- Add: Frame timestamp verification — reject frames older than 5s
- Add: Hash-chain frames so the server can detect gaps

### 3.2 Rate Limiting on Frame Endpoint
- Current rate limit: global 500/15min, which allows ~33/min
- Need specific limiter: max 2 frames/sec per student (anything more is suspicious or buggy)

### 3.3 Encrypt Evidence Data
- Evidence images in MongoDB (`Submission.violations[].evidence`) are stored as plain base64
- Add: Encrypt evidence at rest with a server-side key
- Add: Evidence access audit trail

### 3.4 Prevent DevTools Evasion
- Current: `useBrowserSecurity` detects F12/Ctrl+Shift+I but cannot detect already-open DevTools
- Add: Use `debugger` statement timing detection
- Add: Detect window resize that suggests DevTools docked to side

### 3.5 Tighten CORS Policy
- `AI_PROCTORING/server.py` has `allow_origins=["*"]` — wide open
- Lock down to only accept requests from the backend Node server (localhost:5000)

---

## PHASE 4: UX & Monitoring Improvements (Week 7-8)
> **Goal**: Better examiner experience and student feedback.

### 4.1 Real-Time Proctoring Dashboard for Examiners
- Current: `AdminMonitor.tsx` exists but Socket.IO only sends join/leave events
- Add: Stream live suspicion scores, risk levels, and violation counts per student
- Add: Thumbnail of annotated frames (small, periodic) for real-time visual monitoring
- Add: One-click "view evidence" for each violation

### 4.2 Student-Facing Proctoring Status
- Show small overlay during exam with:
  - Green/Yellow/Red dot for current risk level
  - "Face detected ✓" confirmation
  - Violation count (X/3 before auto-submit)
  - "AI monitoring active" indicator
- Already partially in `ActiveExam.tsx` but needs better visual feedback

### 4.3 Post-Exam Integrity Report
- Current: `IntegrityReport.tsx` exists
- Enhance: Timeline view of all violations with evidence snapshots
- Add: Suspicion score graph over time
- Add: Examiner can mark individual violations as "false positive" / "confirmed"

### 4.4 Examiner Override for False Positives
- Allow examiner to dismiss violations from a student's record
- Add "reviewed" status to violations in the Submission model
- Affects the `isSuspicious` flag and auto-submit logic

---

## PHASE 5: Performance & Scalability (Week 9-10)
> **Goal**: Handle more concurrent exams efficiently.

### 5.1 Optimize Frame Size
- Current: 640x480 JPEG at 0.85 quality ≈ 40-80KB per frame
- For object detection only: 320x240 at 0.6 quality is sufficient (≈10-15KB)
- For full analysis: 480x360 at 0.7 is enough
- Saves ~60% bandwidth per student

### 5.2 Python Service Scaling
- Current: Single FastAPI instance, all models in memory, single-threaded GIL bottleneck for YOLO
- Add: Uvicorn with multiple workers (`uvicorn server:app --workers 4`)
- Add: Separate YOLO inference to a worker pool (ThreadPoolExecutor or process pool)
- Add: Model warm-up endpoint to pre-load weights

### 5.3 Evidence Storage Optimization
- Current: Base64-encoded images stored as strings in MongoDB violations
- Problem: A single 640x480 JPEG evidence image is ~80KB base64 → 350KB cap per violation → with 3 violations that's 1MB+ per submission
- Solution: Store evidence in filesystem/S3, store only the reference path in MongoDB

### 5.4 Session State Memory Management
- `SESSION_STATES` in Python grows unbounded (only cleaned on next request)
- Add: Background cleanup task every 5 minutes
- Add: Max session limit (reject new sessions under extreme load)

### 5.5 WebSocket for Frame Transport
- Current: HTTP POST per frame (high overhead per request)
- Consider: Use Socket.IO to stream frames (already have Socket.IO set up!)
- Benefits: Lower latency, connection reuse, binary frame support

---

## PHASE 6: Advanced Features (Week 11+)
> **Goal**: Competitive advantage features.

### 6.1 Audio Proctoring
- Add microphone capture during exam
- Detect voice activity → potential communication with others
- Store audio snapshots of suspicious moments

### 6.2 Screen Recording / Tab Monitoring  
- Use Screen Capture API for periodic screenshots
- Detect screen sharing applications
- Log all tab switches with destination URL (if accessible)

### 6.3 AI-Powered Behavior Analysis
- Replace rule-based suspicion scoring with ML model
- Train on labeled violation data to distinguish genuine cheating from normal fidgeting
- Reduces false positives significantly

### 6.4 Identity Verification
- Pre-exam: Compare webcam face with registered student photo
- Use face embeddings for matching (not just "face exists")
- Periodic re-verification during exam

### 6.5 Offline/Unstable Network Support
- Cache exam questions locally after load
- Queue answers and violations for sync when connection restores
- Avoid losing exam data on network drops

---

## Priority Summary

| Priority | Items | Impact |
|----------|-------|--------|
| **P0 (Critical)** | Phase 1 (1.1-1.6) | Proctoring actually works |
| **P1 (High)** | Phase 2 (2.1-2.5) | Accuracy & reliability |
| **P1 (High)** | Phase 3 (3.1-3.5) | Security & anti-cheat |
| **P2 (Medium)** | Phase 4 (4.1-4.4) | UX quality |
| **P2 (Medium)** | Phase 5 (5.1-5.5) | Scale & performance |
| **P3 (Low)** | Phase 6 (6.1-6.5) | Advanced features |

---

## Quick Win List (Can Do Today)

1. Remove unused TF dependencies from `frontend/package.json` (saves 20MB bundle)
2. Add auth header to proctoring fetch calls  
3. Add `protect` middleware to proctoring route
4. Tighten Python CORS from `*` to backend origin only
5. Add server-side fallback flag when browser model fails

---

*Ready to start implementing? I recommend beginning with Phase 1 items — they will fix the core CV integration issues you're experiencing.*
