# Exam Proctoring System - Backend

Backend API for the Exam Proctoring System built with Node.js and Express.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the backend directory:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

- `PORT`: Server port (default: 5000)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `FRONTEND_URL`: Frontend URL for CORS

### 3. Run the Server

**Development Mode** (with auto-reload):

```bash
npm run dev
```

**Production Mode**:

```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/reset-password` - Reset password

### Exams

- `GET /api/exam` - Get all exams
- `GET /api/exam/:id` - Get exam by ID
- `POST /api/exam` - Create new exam
- `PUT /api/exam/:id` - Update exam
- `DELETE /api/exam/:id` - Delete exam
- `POST /api/exam/:id/frame` - Submit proctoring frame payload (`{ "image": "data:image/jpeg;base64,..." }`)

### Proctoring

- `POST /api/proctoring/:id/frame` - Alias route for frame processing

### Student

- `GET /api/student/dashboard/:id` - Get student dashboard
- `POST /api/student/exam/start/:examId` - Start exam
- `POST /api/student/exam/submit` - Submit exam
- `GET /api/student/exam/:examId/results` - Get exam results

### Admin

- `GET /api/admin/dashboard` - Get admin dashboard
- `GET /api/admin/monitor/:examId` - Monitor exam
- `GET /api/admin/report/:examId` - Get integrity report
- `GET /api/admin/users` - Get all users
- `POST /api/admin/suspend/:studentId` - Suspend student

## Project Structure

```
backend/
├── src/
│   ├── controllers/    # Request handlers
│   ├── routes/         # API routes
│   ├── models/         # Database schemas
│   └── server.js       # Main server file
├── package.json        # Dependencies
├── .env.example        # Example environment variables
└── README.md           # This file
```

## Technologies Used

- **Express.js**: Web framework
- **MongoDB/Mongoose**: Database
- **JWT**: Authentication
- **bcryptjs**: Password hashing
- **Multer**: File uploads
- **Nodemailer**: Email notifications

## TODO - Implementation Tasks

- [ ] Implement MongoDB models with Mongoose
- [ ] Add JWT authentication middleware
- [ ] Implement user registration and login
- [ ] Create exam management endpoints
- [ ] Implement proctoring features
- [ ] Add integrity monitoring
- [ ] Create admin dashboard endpoints
- [ ] Implement email notifications
- [ ] Add input validation
