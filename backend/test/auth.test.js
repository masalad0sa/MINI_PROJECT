import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { setupDB, teardownDB, clearDB } from './setup.js';
import User from '../src/models/User.js';

beforeAll(async () => {
  await setupDB();
});

afterAll(async () => {
  await teardownDB();
});

afterEach(async () => {
  await clearDB();
});

describe('Auth API Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new student user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Student',
          email: 'student@test.com',
          password: 'password123',
          userId: 'test_student_1',
          role: 'student'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('student@test.com');
      expect(res.body.user.role).toBe('student');

      // Verify in DB
      const user = await User.findOne({ email: 'student@test.com' });
      expect(user).not.toBeNull();
      expect(user.name).toBe('Test Student');
    });

    it('should reject registration if email exists', async () => {
      // First registration
      await request(app).post('/api/auth/register').send({
        name: 'Test Student',
        email: 'student@test.com',
        password: 'password123',
        userId: 'test_student_1',
        role: 'student'
      });

      // Second registration with same email
      const res = await request(app).post('/api/auth/register').send({
        name: 'Another Student',
        email: 'student@test.com',
        password: 'password123',
        userId: 'test_student_2',
        role: 'student'
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toMatch(/Email already registered/);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeAll(async () => {
      // Create user before testing login
      await request(app).post('/api/auth/register').send({
        name: 'Login Student',
        email: 'login@test.com',
        password: 'password123',
        userId: 'login_student_1',
        role: 'student'
      });
    });

    it('should login successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('login@test.com');
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toMatch(/Invalid email or password/);
    });
  });
});
