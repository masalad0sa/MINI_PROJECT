# 🛡️ AI Powered Online Exam Proctoring System

## 📖 Overview
A robust web-based platform designed to ensure fair and secure online examinations using Artificial Intelligence, Computer Vision, and Browser Monitoring. The system verifies candidate identity, monitors behavior during the exam, and produces post-exam integrity reports.

---

## 🧩 Project Framework

### 1. System Modules

#### 1. Authentication & Identity Verification Module
- User registration & login
- Face recognition-based identity verification
- Liveness detection (blink tracking, micro-movements, anti-spoofing)
- Secure access control

Output: Authenticated student allowed to begin the exam

---

#### 2. AI Proctoring Module
- Continuous webcam monitoring
- Face absence detection
- Multiple face detection
- Eye-gaze tracking
- Head pose estimation
- Behavioral analysis via AI

Output: Real-time suspicious event detection with severity levels

---

#### 3. Browser & System Monitoring Module
- Tab switch detection
- Full-screen enforcement
- Copy/paste blocking
- Right-click disable
- Idle time monitoring

Output: Security violation logging

---

#### 4. Decision & Warning Engine
- Severity-based violation classification: Minor, Medium, Critical
- Real-time alerts & warning prompts
- Temporary screen freeze
- Auto-submission trigger based on severity threshold

Output: Automated interventions and exam decision handling

---

#### 5. Reporting & Analytics Module
- Post-exam report generation
- Timeline-based event logs
- Cheating probability score (0–100%)
- Final verdict: Clean, Suspicious, High Risk
- PDF export support

Output: Downloadable integrity report

---

#### 6. Backend & Database Module
- Secure REST APIs
- Authentication & session management
- Exam configuration & management
- Centralized event logging
- Secure report storage

Database collections: Users, Exams, Attempts/Logs

---

## 🔁 System Workflow

1. Login & identity verification
   - Student logs in
   - Face recognition + liveness authentication
   - Access granted upon successful verification

2. Exam start
   - Exam interface loads
   - AI proctoring & browser monitoring begin
   - Timer initialized

3. Continuous monitoring
   - Real-time AI surveillance
   - Browser activity watch
   - Continuous logging

4. Adaptive response
   - Violations evaluated by severity engine
   - Warning notifications issued
   - Freeze or auto-submit if violation persists

5. Post-exam processing
   - Analytics computation
   - Risk evaluation
   - PDF report generation

---

## 🛠️ Technology Stack

Frontend
- React.js
- Webcam integration
- Fullscreen & tab monitoring
- Warning UI
- Exam interface

AI Engine
- Python (Flask / FastAPI)
- OpenCV
- Dlib / face-recognition
- TensorFlow / PyTorch

Backend
- Node.js + Express
- Secure REST APIs
- Proctoring logic handling

Database
- MongoDB
- Mongoose ORM

---

## 🧪 Development Phases

Phase 1 — Core setup
- Database schema
- Authentication
- Basic exam UI

Phase 2 — Security enforcement
- Browser monitoring
- Fullscreen lock
- Log recording

Phase 3 — AI integration
- Face recognition
- Liveness detection
- Gaze tracking
- Multi-face detection

Phase 4 — Decision intelligence
- Severity algorithm
- Auto-submit logic
- Freeze mechanism

Phase 5 — Reporting
- Analytics
- Cheating score
- PDF report module

---

## ☁️ Deployment Framework
- Frontend → Vercel / Netlify
- Backend → Render / Railway / AWS
- Database → MongoDB Atlas
- AI Engine → Dedicated Python server (Render / AWS)

---

## 🔮 Future Scope
- Voice keyword detection
- Phone audio cheating detection
- Native mobile app support
- Cloud scaling enhancements
- LMS integration (Moodle, Canvas, Google Classroom)\


---

## ✅ Conclusion
This framework defines the architecture, workflow, technical design, intelligence logic, and deployment strategy for the AI Powered Online Exam Proctoring System, ensuring a secure, scalable, and extensible solution for remote exam integrity.
