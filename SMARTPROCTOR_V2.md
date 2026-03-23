# SmartProctor V2 — Full Rebuild Plan

> **Design Philosophy**: "Server-authoritative proctoring with a lightweight, resilient client."
>
> The server is the single source of truth for all CV analysis. The browser's only job is to capture frames and display results. Optionally, the browser runs a lightweight face-presence check for instant UI feedback — but it never makes violation decisions.

---

## Tech Stack

| Layer               | Current (V1)                             | V2                                                                                                        | Rationale                                                                                                                              |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**        | React + Vite + TypeScript                | **Next.js 15 (App Router) + TypeScript + Tailwind v4**                                                    | SSR for auth pages, API routes eliminate separate Node backend for proxying, App Router gives layouts/loading states/server components |
| **UI Kit**          | Radix primitives + hand-rolled           | **shadcn/ui**                                                                                             | Pre-built accessible components (Dialog, Toast, Tabs, Progress), copy-pasted into project (no lock-in), consistent theming             |
| **Design Style**    | Corporate blue gradients                 | **"Calm Focus"** — Neutral stone/zinc palette, soft shadows, generous whitespace, subtle micro-animations | Exam-taking is stressful; UI should feel calm, not clinical                                                                            |
| **Backend**         | Express.js (separate service)            | **Next.js API Routes + tRPC**                                                                             | Type-safe API layer, no separate Express server, single deployment                                                                     |
| **Database**        | MongoDB + Mongoose                       | **PostgreSQL + Prisma**                                                                                   | Relational data (users → exams → submissions → violations) fits SQL naturally, Prisma gives type-safe queries + migrations             |
| **Auth**            | JWT in localStorage + manual middleware  | **NextAuth.js v5 (Auth.js)** with JWT strategy                                                            | Session management, CSRF protection, role-based middleware — all handled                                                               |
| **Real-time**       | Socket.IO (underutilized)                | **Socket.IO** (properly used)                                                                             | Frame transport via binary WebSocket instead of base64 HTTP POST, live dashboard updates, student warnings                             |
| **AI Service**      | Python FastAPI + MediaPipe + YOLOv8n     | **Python FastAPI + MediaPipe + YOLOv8n** (restructured)                                                   | Core is solid — restructure for multi-worker deployment, queue management, binary frame input                                          |
| **Object Storage**  | Evidence as base64 in MongoDB            | **S3-compatible (MinIO dev / S3 prod)**                                                                   | Evidence as files, DB holds references only — 90%+ DB size reduction                                                                   |
| **Frame Transport** | Base64 JPEG over HTTP POST (~80KB/frame) | **Binary JPEG over WebSocket** (~15KB/frame at 320×240)                                                   | 70% bandwidth reduction + connection reuse + lower latency                                                                             |

---

## Design System — "Calm Focus"

### Color Tokens (Tailwind v4 / OKLCH)

```css
--color-bg: oklch(0.985 0.002 250); /* near-white with cool tint */
--color-surface: oklch(1 0 0); /* pure white cards */
--color-text: oklch(0.25 0.02 260); /* deep slate */
--color-muted: oklch(0.55 0.01 260); /* secondary text */
--color-accent: oklch(0.55 0.2 270); /* indigo-500 — primary action */
--color-safe: oklch(0.65 0.18 155); /* emerald — OK / low risk */
--color-warn: oklch(0.7 0.15 75); /* amber — medium risk */
--color-danger: oklch(0.6 0.2 25); /* rose — high risk / violations */
--radius: 0.75rem;
--shadow-sm: 0 1px 3px oklch(0 0 0 / 0.06);
--shadow-md: 0 4px 12px oklch(0 0 0 / 0.08);
```

### Typography

| Usage       | Font               | Weight             |
| ----------- | ------------------ | ------------------ |
| UI text     | **Inter**          | 400, 500, 600, 700 |
| Data / code | **JetBrains Mono** | 400, 500           |

No additional custom fonts — fast loading, excellent readability.

### Accent Color: Indigo-500

- Primary buttons, links, focus rings
- Status colors: **Emerald** (safe) / **Amber** (warning) / **Rose** (danger)
- Risk indicators: 🟢 / 🟡 / 🔴

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (Next.js)                     │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Webcam   │→ │ Frame Capture│→ │ Socket.IO Client  │ │
│  │ <video>  │  │ (canvas→blob)│  │ (binary frames)   │ │
│  └──────────┘  └──────────────┘  └────────┬──────────┘ │
│                                            │            │
│  ┌──────────────────────────────────────┐  │            │
│  │ Optional: lightweight face-presence  │  │            │
│  │ check (TFLite/WASM) for instant UI  │  │            │
│  │ feedback only — NOT for violations   │  │            │
│  └──────────────────────────────────────┘  │            │
│                                            │            │
│  ┌──────────────────────────────────────┐  │            │
│  │ Proctoring HUD:                      │  │            │
│  │  • Face ✓/✗  • Risk dot (G/Y/R)    │  │            │
│  │  • Warnings   • Violation count     │  │            │
│  └──────────────────────────────────────┘  │            │
└────────────────────────────────────────────┼────────────┘
                                             │ WebSocket (binary)
┌────────────────────────────────────────────┼────────────┐
│              NEXT.JS SERVER                │            │
│                                            ▼            │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Auth.js    │  │ tRPC Router  │  │ Socket.IO    │   │
│  │ (sessions) │  │ (exam CRUD)  │  │ Server       │   │
│  └────────────┘  └──────────────┘  └──────┬───────┘   │
│                                            │           │
│  ┌─────────────────────────────────────────┼─────────┐ │
│  │              Frame Router               │         │ │
│  │  • Rate limit (2 frames/sec/student)    │         │ │
│  │  • Timestamp validation                 │         │ │
│  │  • Queue with backpressure             │         │ │
│  └─────────────────────────────────────────┼─────────┘ │
│                                            │           │
└────────────────────────────────────────────┼───────────┘
                                             │ HTTP (binary)
┌────────────────────────────────────────────┼───────────┐
│              PYTHON AI SERVICE             │           │
│                                            ▼           │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Face Mesh    │  │ YOLOv8n  │  │ Behavior     │    │
│  │ (MediaPipe)  │  │ (objects)│  │ Analyzer     │    │
│  └──────────────┘  └──────────┘  └──────────────┘    │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Session Manager:                                  │ │
│  │  • Per-student gaze/head calibration baselines   │ │
│  │  • Streak counters + hysteresis                  │ │
│  │  • Evidence capture → S3                         │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  Uvicorn 4 workers + ThreadPoolExecutor for YOLO     │
└───────────────────────────────────────────────────────┘
```

---

## Project Structure

```
smart-proctor/
├── apps/
│   ├── web/                        # Next.js 15 app
│   │   ├── app/
│   │   │   ├── (auth)/             # Login, signup (server-rendered)
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── signup/
│   │   │   │       └── page.tsx
│   │   │   ├── (dashboard)/        # Role-based dashboards
│   │   │   │   ├── student/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── examiner/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── monitor/
│   │   │   │   │       └── [examId]/page.tsx
│   │   │   │   └── admin/
│   │   │   │       └── page.tsx
│   │   │   ├── exam/
│   │   │   │   ├── create/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── check/page.tsx    # Pre-exam + calibration
│   │   │   │       ├── page.tsx          # Active exam
│   │   │   │       └── report/page.tsx   # Post-exam integrity report
│   │   │   ├── api/
│   │   │   │   └── trpc/[trpc]/route.ts
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui components
│   │   │   ├── proctoring/         # Proctoring-specific
│   │   │   │   ├── ProctoringHUD.tsx
│   │   │   │   ├── CalibrationStep.tsx
│   │   │   │   ├── WarningModal.tsx
│   │   │   │   └── WebcamCapture.tsx
│   │   │   └── dashboard/
│   │   │       ├── LiveStudentGrid.tsx
│   │   │       ├── AlertFeed.tsx
│   │   │       └── SuspicionChart.tsx
│   │   ├── hooks/
│   │   │   ├── useFrameStream.ts   # Binary WebSocket frame sender
│   │   │   ├── useFacePresence.ts  # Optional browser-side face check
│   │   │   └── useSocket.ts        # Socket.IO client
│   │   ├── lib/
│   │   │   ├── trpc.ts             # tRPC client setup
│   │   │   ├── auth.ts             # Auth.js config
│   │   │   └── socket.ts           # Socket.IO singleton
│   │   └── server/
│   │       ├── routers/            # tRPC routers
│   │       │   ├── auth.ts
│   │       │   ├── exam.ts
│   │       │   ├── submission.ts
│   │       │   ├── violation.ts
│   │       │   └── admin.ts
│   │       ├── db.ts               # Prisma client
│   │       └── auth.config.ts
│   │
│   └── ai/                         # Python AI service
│       ├── main.py                 # FastAPI app entry
│       ├── config.py               # All thresholds in one place
│       ├── models/
│       │   ├── face.py             # FaceMesh + FaceDetector (merged)
│       │   ├── objects.py          # YOLOv8n
│       │   └── loader.py           # Model warm-up + health check
│       ├── analysis/
│       │   ├── gaze.py             # EyeGazeTracker
│       │   ├── head.py             # HeadPoseEstimator
│       │   ├── behavior.py         # BehaviorAnalyzer + scoring
│       │   └── session.py          # SessionState manager + TTL cleanup
│       ├── endpoints/
│       │   ├── process.py          # /process_frame
│       │   ├── calibrate.py        # /calibrate
│       │   ├── health.py           # /health
│       │   └── system_check.py     # /system_check
│       ├── evidence/
│       │   └── storage.py          # S3 upload for evidence
│       ├── Dockerfile
│       └── requirements.txt
│
├── packages/
│   ├── shared/                     # Shared types, constants, enums
│   │   └── src/
│   │       ├── types.ts
│   │       └── constants.ts
│   └── prisma/                     # Prisma schema + migrations
│       ├── schema.prisma
│       └── migrations/
│
├── docker-compose.yml              # One command starts everything
├── docker-compose.prod.yml         # Production config
├── turbo.json                      # Turborepo monorepo orchestration
├── package.json
└── README.md
```

---

## Data Model (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          String       @id @default(cuid())
  email       String       @unique
  name        String
  password    String       // bcrypt hashed
  role        Role         @default(STUDENT)
  exams       Exam[]       @relation("ExamCreator")
  submissions Submission[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

enum Role {
  STUDENT
  EXAMINER
  ADMIN
}

model Exam {
  id          String       @id @default(cuid())
  title       String
  description String?
  creator     User         @relation("ExamCreator", fields: [creatorId], references: [id])
  creatorId   String
  questions   Question[]
  duration    Int          // minutes
  startTime   DateTime
  endTime     DateTime
  status      ExamStatus   @default(DRAFT)
  submissions Submission[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

enum ExamStatus {
  DRAFT
  PUBLISHED
  ACTIVE
  COMPLETED
}

model Question {
  id      String       @id @default(cuid())
  exam    Exam         @relation(fields: [examId], references: [id], onDelete: Cascade)
  examId  String
  text    String
  type    QuestionType
  options Json?        // for MCQ: ["Option A", "Option B", ...]
  answer  String
  points  Int          @default(1)
  order   Int

  @@index([examId])
}

enum QuestionType {
  MCQ
  SHORT_ANSWER
  LONG_ANSWER
}

model Submission {
  id             String      @id @default(cuid())
  exam           Exam        @relation(fields: [examId], references: [id])
  examId         String
  student        User        @relation(fields: [studentId], references: [id])
  studentId      String
  status         SubStatus   @default(NOT_STARTED)
  answers        Json?       // { "questionId": "answer", ... }
  score          Int?
  startedAt      DateTime?
  submittedAt    DateTime?
  violations     Violation[]
  isSuspicious   Boolean     @default(false)
  integrityScore Float       @default(100) // decays with each violation
  calibration    Json?       // stored gaze/head baselines from pre-exam check
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@unique([examId, studentId])
  @@index([examId])
  @@index([studentId])
}

enum SubStatus {
  NOT_STARTED
  IN_PROGRESS
  SUBMITTED
  AUTO_SUBMITTED
  GRADED
}

model Violation {
  id           String        @id @default(cuid())
  submission   Submission    @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  submissionId String
  type         ViolationType
  severity     Severity
  description  String
  evidenceUrl  String?       // S3 key — NOT base64 blob
  confidence   Float?
  timestamp    DateTime      @default(now())
  reviewed     Boolean       @default(false)  // examiner has looked at it
  dismissed    Boolean       @default(false)  // examiner marked as false positive

  @@index([submissionId])
  @@index([type])
}

enum ViolationType {
  NO_FACE
  MULTIPLE_FACES
  PROHIBITED_OBJECT
  GAZE_AWAY
  HEAD_TURN
  HIGH_SUSPICION
  TAB_SWITCH
  FULLSCREEN_EXIT
}

enum Severity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
```

### Why This Is Better Than V1

| V1 (MongoDB)                                 | V2 (PostgreSQL + Prisma)                                             |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Violations embedded as array in Submission   | **Separate `Violation` table** — queryable, indexable, pageable      |
| Evidence as 350KB base64 string in violation | **`evidenceUrl`** — S3 path, DB stays small                          |
| Binary `isSuspicious` flag                   | **`integrityScore: Float`** — decays gradually, more nuanced         |
| No examiner review capability                | **`reviewed` / `dismissed`** fields per violation                    |
| No unique constraint on exam+student         | **`@@unique([examId, studentId])`** — prevents duplicate submissions |
| Untyped Mongoose schemas                     | **Fully typed Prisma client** — compile-time safety                  |

---

## Phase Breakdown

### Phase 0: Project Scaffold (Day 1–2)

- [ ] Initialize Turborepo monorepo
- [ ] Create Next.js 15 app with App Router in `apps/web/`
- [ ] Set up Tailwind v4 with design tokens
- [ ] Install and configure shadcn/ui
- [ ] Set up Prisma in `packages/prisma/`
- [ ] Docker Compose: PostgreSQL + MinIO + Redis
- [ ] Copy Python AI service to `apps/ai/` with Dockerfile
- [ ] Verify `docker-compose up` starts all services
- [ ] Configure Turborepo tasks: `dev`, `build`, `lint`, `test`

### Phase 1: Auth & Data Model (Day 3–5)

- [ ] Define Prisma schema (above)
- [ ] Run initial migration
- [ ] Configure Auth.js v5 with credentials provider
- [ ] Implement login page (server-rendered, centered card)
- [ ] Implement signup page with role selection
- [ ] Add Next.js middleware for role-based route protection
- [ ] Seed script for test users (admin, examiner, student)

### Phase 2: Exam CRUD (Day 6–9)

**tRPC Routers:**

- [ ] `exam.create` / `exam.update` / `exam.publish` (examiner only)
- [ ] `exam.list` — filtered by role (examiner sees own, student sees published)
- [ ] `exam.getById` — with questions (student) or with answers (examiner grading)
- [ ] `submission.start` / `submission.answer` / `submission.submit`
- [ ] `admin.users.list` / `admin.exams.list` / `admin.override`

**UI Pages:**

- [ ] Student dashboard — upcoming exams + exam history
- [ ] Examiner dashboard — created exams + live monitoring links
- [ ] Admin dashboard — all users, all exams, system stats
- [ ] Create Exam — multi-step form: Details → Questions → Schedule → Review → Publish

### Phase 3: Frame Transport (Day 10–13)

**Binary WebSocket pipeline:**

- [ ] `useFrameStream` hook: `canvas.toBlob('image/jpeg', 0.6)` → Socket.IO binary emit
- [ ] Adaptive interval: 1.5s–4s based on server RTT (from socket ack)
- [ ] In-flight guard: skip if previous frame not acknowledged
- [ ] Send calibration baselines with first frame only
- [ ] Server-side frame router in Next.js Socket.IO handler
- [ ] Rate limit: max 2 frames/sec per student
- [ ] Timestamp validation: reject frames >5s old
- [ ] Forward binary JPEG to Python AI via internal HTTP
- [ ] Emit analysis results back to student + examiner room

**Frame specs:**
| Setting | V1 | V2 |
|---------|----|----|
| Resolution | 640×480 | **320×240** (sufficient for face/object detection) |
| Quality | 0.85 | **0.6** |
| Encoding | Base64 string (~80KB) | **Binary blob (~15KB)** |
| Transport | HTTP POST per frame | **WebSocket (connection reuse)** |

### Phase 4: AI Service Restructure (Day 14–17)

- [ ] Reorganize into `models/`, `analysis/`, `endpoints/`, `evidence/` directories
- [ ] Move all thresholds to `config.py` — no magic numbers in code
- [ ] Accept binary JPEG input (skip base64 decode overhead)
- [ ] YOLO inference in `ThreadPoolExecutor` (doesn't block event loop)
- [ ] `uvicorn --workers 4` for multi-process serving
- [ ] Background `asyncio` task: prune stale sessions every 5 minutes
- [ ] Evidence capture → `boto3.upload_fileobj` to S3 → return S3 key
- [ ] Calibration built into `SessionState` constructor
- [ ] Model warm-up endpoint to pre-load weights on startup

### Phase 5: Pre-Exam System Check + Calibration (Day 18–19)

**Check flow:**

```
[1. Webcam Permission] → [2. Face Detection] → [3. Internet] → [4. AI Service]
        ↓ all pass
[5. Gaze Calibration — 5 second countdown]
   "Look at the center dot on your screen"
   ● (pulsing indigo dot)
   Captures 10 frames → POST /api/proctoring/calibrate
   Returns baselines → stored in Submission.calibration
        ↓ success
[Start Exam — button unlocked]
```

- [ ] System check page with webcam preview + checklist
- [ ] AI health check polling
- [ ] Calibration UI with animated countdown dot
- [ ] Calibration endpoint integration
- [ ] Store baselines in Submission record
- [ ] Pass baselines to frame stream on exam start

### Phase 6: Active Exam Page (Day 20–24)

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ ┌─ Header ───────────────────────────────────────────┐  │
│ │ SmartProctor    Q 3/20    ⏱ 45:12    [Submit]     │  │
│ └────────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ Question Panel (70%) ──────────────────┐  ┌──────┐  │
│ │                                          │  │  🟢  │  │
│ │  What is the time complexity of          │  │      │  │
│ │  merge sort?                             │  │ Face │  │
│ │                                          │  │  ✓   │  │
│ │  ○ O(n)                                 │  │      │  │
│ │  ● O(n log n)  ←                        │  │  AI  │  │
│ │  ○ O(n²)                                │  │  ✓   │  │
│ │  ○ O(log n)                             │  │      │  │
│ │                                          │  │ 0/3  │  │
│ │  [← Prev]                [Next →]       │  │      │  │
│ └──────────────────────────────────────────┘  └──────┘  │
│                                                         │
│ ┌─ Question Navigator ──────────────────────────────┐   │
│ │ [1] [2] [●3] [4] [5] [6] ... [20]                │   │
│ └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Proctoring HUD (right sidebar, compact):**

- [ ] Risk dot: 🟢/🟡/🔴 — real-time color from server analysis
- [ ] Face indicator: ✓ detected / ✗ missing
- [ ] AI status: ✓ active / ⚠ temporarily unavailable
- [ ] Violation counter: "0/3" — student knows where they stand
- [ ] Tiny webcam preview (80×60px) for self-positioning

**Warning Modal:**

- [ ] Slides down from top on violation
- [ ] Shows what was detected: "No face detected for 5 seconds"
- [ ] Shows count: "Warning 1 of 3"
- [ ] Auto-dismisses after 5s, non-blocking

**Browser Security:**

- [ ] Tab visibility API → detect tab switches
- [ ] Fullscreen enforcement (examiner-configurable)
- [ ] Right-click + copy/paste disabled in exam area
- [ ] DevTools detection via timing + resize heuristics
- [ ] All security events logged with configurable severity

**Exam Functions:**

- [ ] Question navigation (next/prev/jump)
- [ ] Auto-save answers on change (debounced tRPC mutation)
- [ ] Countdown timer with warning at 5min/1min
- [ ] Manual submit button
- [ ] Auto-submit at time expiry
- [ ] Auto-submit at 3 violations (configurable)

### Phase 7: Examiner Live Dashboard (Day 25–28)

```
┌─────────────────────────────────────────────────────────────┐
│  Live Monitoring — Final Exam CS101    28 students online   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ 🟢 Alice │  │ 🟡 Bob   │  │ 🔴 Carol │  │ 🟢 Dave  │  │
│  │ [thumb]  │  │ [thumb]  │  │ [thumb]  │  │ [thumb]  │  │
│  │ Score: 12│  │ Score: 45│  │ Score: 82│  │ Score: 5 │  │
│  │ 0 viols  │  │ 1 viols  │  │ 2 viols  │  │ 0 viols  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│  ... (grid of all students, sorted by risk)                │
│                                                             │
│  ┌─ Alert Feed ────────────────────────────────────────┐   │
│  │ 14:23:05  Carol — PROHIBITED_OBJECT (cell phone)    │   │
│  │ 14:21:12  Bob   — HIGH_SUSPICION (gaze away 8s)     │   │
│  │ 14:20:45  Carol — NO_FACE (5.2s)                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- [ ] Real-time via Socket.IO: every analysis result emitted to examiner room
- [ ] Student grid — sorted by risk level (highest first)
- [ ] Periodic thumbnails: every 10th frame → 160×120 thumbnail stored + displayed
- [ ] Click student → detail view: timeline, violations with evidence, live feed
- [ ] Examiner actions: "Send warning", "Pause exam", "Force submit", "Dismiss violation"
- [ ] Alert feed with timestamp, student name, violation type

### Phase 8: Post-Exam Integrity Report (Day 29–31)

- [ ] **Suspicion Score Timeline**: Line chart (recharts) showing score over exam duration with violation markers
- [ ] **Violation Cards**: Each violation with timestamp, type, evidence image (loaded from S3), confidence level
- [ ] **Examiner Review**: Toggle "Confirmed" / "Dismissed" per violation — updates integrity score
- [ ] **Summary Stats**: Total time, avg suspicion score, tab switches, face-absent duration, gaze-away duration
- [ ] **Export**: PDF report generation for records
- [ ] **Batch Review**: Examiner can review all flagged submissions for an exam in sequence

### Phase 9: Testing & Hardening (Day 32–36)

| Test Type       | Tool                     | Scope                                                         |
| --------------- | ------------------------ | ------------------------------------------------------------- |
| **Unit**        | Vitest                   | tRPC routers, scoring logic, utility functions                |
| **Component**   | Testing Library + Vitest | Exam UI, proctoring HUD, dashboard cards                      |
| **Integration** | Vitest + Supertest       | Auth flow, exam lifecycle, violation persistence              |
| **E2E**         | Playwright               | Full flow: login → check → calibrate → exam → submit → report |
| **AI Service**  | Pytest                   | Frame processing, calibration, session management             |
| **Load**        | k6                       | 100 concurrent students sending frames at 0.5fps              |

**Security Hardening:**

- [ ] Rate limiting: per-student frame limit + global API limit
- [ ] Frame timestamp validation (reject >5s old)
- [ ] Input validation on all tRPC inputs (Zod schemas)
- [ ] CORS locked to deployment domain
- [ ] Helmet.js security headers
- [ ] Content Security Policy
- [ ] SQL injection: impossible (Prisma parameterized queries)
- [ ] XSS: impossible (React auto-escaping + CSP)
- [ ] Evidence URLs: pre-signed S3 URLs, expire in 1 hour
- [ ] Liveness challenges: periodic "blink" or "turn head" requests
- [ ] Frame hash-chain: detect gaps in captured frames

### Phase 10: Deployment (Day 37–40)

```yaml
# docker-compose.prod.yml
services:
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://...
      S3_ENDPOINT: http://minio:9000
      NEXTAUTH_SECRET: ...
      NEXTAUTH_URL: https://smartproctor.example.com

  ai:
    build: ./apps/ai
    ports: ["8000:8000"]
    deploy:
      resources:
        limits:
          memory: 2G # YOLO + MediaPipe need RAM
    command: uvicorn main:app --workers 4 --host 0.0.0.0

  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]

  minio:
    image: minio/minio
    volumes: [s3data:/data]
    command: server /data

  redis:
    image: redis:7-alpine # Rate limiting + Socket.IO adapter
```

**Deployment Options:**

- Vercel for Next.js (or self-hosted Docker)
- Python AI on GPU instance if available, CPU otherwise
- PostgreSQL managed (Neon / Supabase) or self-hosted
- S3 / MinIO for evidence
- Redis for Socket.IO horizontal scaling + rate limit state

---

## V1 → V2 Comparison Summary

| Problem in V1                                        | Fix in V2                                                 |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Browser model fails silently → unproctored exam      | Server does ALL CV analysis; browser is capture-only      |
| Auth missing on proctoring route                     | Auth.js middleware on every protected route by default    |
| Base64 over HTTP POST (80KB/frame)                   | Binary JPEG over WebSocket (15KB/frame)                   |
| Evidence bloats MongoDB (350KB base64 per violation) | Evidence in S3, DB holds URL reference                    |
| No calibration → first-frame baseline                | 5-second calibration step before every exam               |
| Fixed 2s frame interval                              | Adaptive interval based on RTT + server load              |
| Violations embedded in Submission array              | Separate Violation table — queryable, reviewable          |
| Socket.IO exists but barely used                     | Socket.IO for frame transport + live dashboard + warnings |
| Examiner has no live view                            | Real-time dashboard with thumbnails + alert feed          |
| No examiner override for false positives             | "Confirmed" / "Dismissed" per violation                   |
| Separate Express backend + React frontend            | Next.js unified (SSR + API + WebSocket)                   |
| Mongoose with untyped schemas                        | Prisma with fully typed, migrated schemas                 |
| Manual CSS + Radix primitives                        | shadcn/ui + Tailwind v4 + design system                   |
| No tests                                             | Vitest + Playwright + Pytest from day one                 |
| `npm start` × 3 services                             | `docker-compose up` starts everything                     |

---

## Timeline

| Phase                         | Days | Cumulative  |
| ----------------------------- | ---- | ----------- |
| 0. Scaffold                   | 2    | 2           |
| 1. Auth & Data Model          | 3    | 5           |
| 2. Exam CRUD                  | 4    | 9           |
| 3. Frame Transport            | 4    | 13          |
| 4. AI Restructure             | 4    | 17          |
| 5. System Check + Calibration | 2    | 19          |
| 6. Active Exam Page           | 5    | 24          |
| 7. Examiner Dashboard         | 4    | 28          |
| 8. Integrity Report           | 3    | 31          |
| 9. Testing & Hardening        | 5    | 36          |
| 10. Deployment                | 4    | **40 days** |

**~6 weeks** for one developer, **~3–4 weeks** for a pair.
