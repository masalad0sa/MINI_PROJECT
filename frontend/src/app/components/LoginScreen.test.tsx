import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LoginScreen } from './LoginScreen';

// Mock the AuthContext so we can spy on the login function
const mockLogin = vi.fn().mockResolvedValue(undefined);

vi.mock('../../lib/AuthContext', async () => {
  const actual = await vi.importActual('../../lib/AuthContext');
  return {
    ...actual as any,
    useAuth: () => ({
      login: mockLogin,
      isLoading: false,
      error: null,
      user: null
    })
  };
});

describe('LoginScreen Component', () => {
  it('renders login form elements correctly', () => {
    render(
      <MemoryRouter>
        <LoginScreen />
      </MemoryRouter>
    );
    
    expect(screen.getByText('SmartProctor')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });

  it('calls login function on form submission', async () => {
    render(
      <MemoryRouter>
        <LoginScreen />
      </MemoryRouter>
    );

    const submitBtn = screen.getByRole('button', { name: /Sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('student@example.com', 'password123', 'student');
    });
  });
});
