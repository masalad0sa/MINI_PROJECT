# Project Setup Guide

## Summary of Changes

✅ **Frontend folder created** - All React/Vite code moved to `/frontend`
✅ **Backend folder created** - Complete Node.js/Express API structure
✅ **API Endpoints** - All routes organized with controllers
✅ **Database Models** - Schema templates for User, Exam, and Submission

## Directory Structure

```
Enhance-Exam-Proctoring/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   └── components/
│   │   │       ├── ActiveExam.tsx
│   │   │       ├── AdminMonitor.tsx
│   │   │       ├── IntegrityReport.tsx
│   │   │       ├── PreExamCheck.tsx
│   │   │       ├── StudentDashboard.tsx
│   │   │       ├── figma/
│   │   │       │   └── ImageWithFallback.tsx
│   │   │       └── ui/
│   │   │           └── [40+ Radix UI components]
│   │   ├── styles/
│   │   │   ├── fonts.css
│   │   │   ├── index.css
│   │   │   ├── tailwind.css
│   │   │   └── theme.css
│   │   └── main.tsx
│   ├── /
│   ├── package.json
│   ├── vite.config.ts
│   ├── postcss.config.mjs
│   └── README.md
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── examController.js
│   │   │   ├── studentController.js
│   │   │   └── adminController.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── exam.js
│   │   │   ├── student.js
│   │   │   └── admin.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Exam.js
│   │   │   └── Submission.js
│   │   └── server.js
│   ├── package.json
│   ├── .env.example
│   ├── .gitignore
│   └── README.md
│
├── ATTRIBUTIONS.md
├── README.md
└── .gitignore
```

## Quick Start

### 1. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

**Frontend URL**: http://localhost:5173

### 2. Setup Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your configuration:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/exam-proctoring
JWT_SECRET=your_secret_key_here
FRONTEND_URL=http://localhost:5173
```

Then start:

```bash
npm run dev
```

**Backend URL**: http://localhost:5000

## Backend API Endpoints

### Authentication

- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout
- `POST /api/auth/reset-password` - Reset password

### Exams

- `GET /api/exam` - Get all exams
- `GET /api/exam/:id` - Get exam details
- `POST /api/exam` - Create exam
- `PUT /api/exam/:id` - Update exam
- `DELETE /api/exam/:id` - Delete exam

### Student

- `GET /api/student/dashboard/:id` - Student dashboard
- `POST /api/student/exam/start/:examId` - Start exam
- `POST /api/student/exam/submit` - Submit exam
- `GET /api/student/exam/:examId/results` - Get results

### Admin

- `GET /api/admin/dashboard` - Admin dashboard
- `GET /api/admin/monitor/:examId` - Monitor exam
- `GET /api/admin/report/:examId` - Integrity report
- `GET /api/admin/users` - List users
- `POST /api/admin/suspend/:studentId` - Suspend student

## Next Steps - To Do List

### Backend Implementation

- [ ] Implement MongoDB models with Mongoose
- [ ] Create authentication middleware (JWT)
- [ ] Implement user registration and login with bcrypt
- [ ] Add input validation and error handling
- [ ] Create exam management logic
- [ ] Implement proctoring features (WebCamera, Screen Recording)
- [ ] Add integrity monitoring system
- [ ] Setup email notifications (Nodemailer)
- [ ] Create database seeding/fixtures
- [ ] Add logging system

### Frontend Integration

- [ ] Update API service calls to match backend endpoints
- [ ] Implement authentication state management
- [ ] Add loading states and error handling
- [ ] Connect exam submission to backend
- [ ] Integrate WebCamera/Screen Recording APIs
- [ ] Real-time monitoring websockets

### Features to Develop

- [ ] Real-time exam monitoring dashboard (WebSocket)
- [ ] Integrity violation detection
- [ ] Automated proctoring checks
- [ ] Student suspension workflow
- [ ] Email notifications
- [ ] Analytics and reporting

## Technologies

**Frontend**: React 18.3, TypeScript, Vite, Tailwind CSS, Radix UI
**Backend**: Node.js, Express, MongoDB, JWT, Nodemailer

## Support

For issues or questions, refer to:

- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)
