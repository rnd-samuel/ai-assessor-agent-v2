// frontend/src/pages/LoginPage.tsx
import React, { useState } from 'react';
import apiService from '../services/apiService'; // <-- We will use this
import { useUserStore } from '../state/userStore'; // <-- And this

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'login' | 'forgot' | 'success'>('login');

  // Get the 'setUser' action from our zustand store
  const setUser = useUserStore((state) => state.setUser);

  // --- (FIXED) Handle Real Login ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setError(''); 

    try {
      // 1. Call our REAL backend API endpoint (FR-AUTH-001)
      const response = await apiService.post('/auth/login', { 
        email: email, 
        password: password 
      });

      // 2. On success, get data from the response
      const { userId, role, token, name } = response.data;

      // 3. Update our global zustand store (U2)
      setUser(userId, role, name);

      // 4. Store the auth token in localStorage for persistence
      // This ensures the user stays logged in if they refresh the page
      localStorage.setItem('authToken', token);

      // We don't need to log here; the App.tsx router will
      // automatically see that 'isAuthenticated' is true and redirect.

    } catch (err: any) {
      // If login fails (U2)
      if (err.response && err.response.data && err.response.data.message) {
        setError(err.response.data.message); // Show error from API
      } else {
        setError('An unknown error occurred. Please try again.');
      }
      console.error(err);
    }
  };

  // --- (FIXED) Handle Real Forgot Password ---
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    // (FR-AUTH-004) We'll build this endpoint later
    // await apiService.post('/auth/forgot-password', { email });
    console.log('Forgot password for:', email);
    setView('success'); // Show the success message (U2)
  };

  // --- TSX for Rendering (No changes below) ---

  // View 1: Log In (Default)
  const renderLogin = () => (
    <div id="loginView">
      {/* Company Logo Placeholder */}
      <div className="flex justify-center mb-4">
        <div className="w-32 h-16 bg-bg-medium rounded-md flex items-center justify-center border border-border">
          <span className="text-xs text-text-muted">Your Logo Here</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-text-primary">AI Assessor Agent</h1>
      </div>

      <form className="space-y-4 mt-6" onSubmit={handleLogin}>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1">E-mail Address</label>
          <input 
            type="email" 
            id="email" 
            placeholder="Enter your email" 
            className={`w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/50 ${error ? 'border-error ring-error/50' : ''}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1">Password</label>
          <input 
            type="password" 
            id="password" 
            placeholder="Enter your password" 
            className={`w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/50 ${error ? 'border-error ring-error/50' : ''}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="text-right text-sm">
          <button 
            type="button" 
            onClick={() => setView('forgot')} 
            className="font-medium text-primary hover:text-primary-hover transition-colors"
          >
            Forgot Password?
          </button>
        </div>

        {/* Error Message (U2) */}
        {error && (
          <div id="errorMessage" className="text-sm text-error pt-1">
            {error}
          </div>
        )}

        <div className="pt-2">
          <button 
            type="submit" 
            className="w-full bg-primary text-white rounded-md text-sm font-semibold px-4 py-2.5 hover:bg-primary-hover active:bg-primary-active transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            Log In
          </button>
        </div>
      </form>
    </div>
  );

  // View 2: Forgot Password
  const renderForgot = () => (
    <div id="forgotView">
      <h2 className="text-xl font-bold text-text-primary text-center">Reset Password</h2>
      <p className="text-sm text-text-muted text-center mt-2 mb-6">Enter your email to receive a password reset link.</p>

      <form id="forgotPasswordForm" className="space-y-4" onSubmit={handleForgotPassword}>
        <div>
          <label htmlFor="forgotEmail" className="block text-sm font-medium text-text-secondary mb-1">E-mail Address</label>
          <input 
            type="email" 
            id="forgotEmail" 
            placeholder="Enter your email" 
            className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/50"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="pt-2">
          <button 
            type="submit" 
            className="w-full bg-primary text-white rounded-md text-sm font-semibold px-4 py-2.5 hover:bg-primary-hover active:bg-primary-active transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            Send Reset Link
          </button>
        </div>
      </form>

      <div className="text-center text-sm mt-6">
        <button 
          onClick={() => setView('login')} 
          className="font-medium text-primary hover:text-primary-hover transition-colors"
        >
          &larr; Back to Log In
        </button>
      </div>
    </div>
  );

  // View 3: Success Message (U2)
  const renderSuccess = () => (
    <div id="successView">
      <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-success/10">
         <svg className="h-6 w-6 text-success" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-text-primary text-center mt-4">Check Your Email</h2>
      <p className="text-sm text-text-secondary text-center mt-2 mb-6">
        If an account exists for that email, a password reset link has been sent.
      </p>

      <div className="text-center text-sm mt-6">
        <button 
          onClick={() => setView('login')} 
          className="font-medium text-primary hover:text-primary-hover transition-colors"
        >
          &larr; Back to Log In
        </button>
      </div>
    </div>
  );

  // Main component render logic
  return (
    <div className="bg-bg-medium font-sans text-text-secondary flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm bg-bg-light p-8 rounded-lg shadow-lg overflow-hidden">
        {view === 'login' && renderLogin()}
        {view === 'forgot' && renderForgot()}
        {view === 'success' && renderSuccess()}
      </div>
    </div>
  );
}