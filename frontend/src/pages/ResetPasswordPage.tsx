// frontend/src/pages/ResetPasswordPage.tsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiService from '../services/apiService';
import LoadingButton from '../components/LoadingButton';
import { useToastStore } from '../state/toastStore';
import ToastContainer from '../components/ToastContainer';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const addToast = useToastStore((state) => state.addToast);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-medium">
        <div className="bg-bg-light p-8 rounded-lg shadow-md text-center">
          <h2 className="text-xl font-bold text-error mb-2">Invalid Link</h2>
          <p className="text-text-secondary">This password reset link is missing a token.</p>
          <button onClick={() => navigate('/login')} className="mt-4 text-primary hover:underline">Back to Login</button>
        </div>
      </div>
    );
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      addToast("Passwords do not match.", 'error');
      return;
    }
    if (password.length < 6) {
      addToast("Password must be at least 6 characters.", 'error');
      return;
    }

    setIsLoading(true);
    try {
      await apiService.post('/auth/reset-password', { token, newPassword: password });
      addToast("Password reset successfully! Please log in.", 'success');
      navigate('/login');
    } catch (error: any) {
      console.error(error);
      addToast(error.response?.data?.message || "Failed to reset password.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-medium">
      <div className="w-full max-w-sm bg-bg-light p-8 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold text-text-primary text-center mb-6">Set New Password</h2>
        
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">New Password</label>
            <input 
              type="password" 
              required
              className="w-full rounded-md border border-border px-3 py-2 bg-bg-light focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Confirm Password</label>
            <input 
              type="password" 
              required
              className="w-full rounded-md border border-border px-3 py-2 bg-bg-light focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <LoadingButton
            type="submit"
            className="w-full py-2.5 mt-2"
            isLoading={isLoading}
            loadingText="Updating..."
          >
            Reset Password
          </LoadingButton>
        </form>
      </div>
      <ToastContainer />
    </div>
  );
}