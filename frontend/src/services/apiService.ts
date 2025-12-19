// frontend/src/services/apiService.ts
import axios from 'axios';

// 1. Get the Backend URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// 2. Create a re-usable 'axios' instance
export const apiService = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json', // <--- ADD THIS DEFAULT
  },
});

// 3. (FIXED) Set up a "request interceptor"
// This function will automatically add the user's auth token
// to *every single API request* they make.
apiService.interceptors.request.use(
  (config) => {
    // Get the token from localStorage
    const token = localStorage.getItem('authToken');

    if (token) {
      // If the token exists, add it to the header
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Safety Check: Ensure Content-Type is set for POST/PUT if not FormData
    if (config.data && !(config.data instanceof FormData)) {
        config.headers['Content-Type'] = 'application/json';
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 4. (NEW) Set up a "response interceptor"
// This will watch for "403 Forbidden" errors. If one happens
// (like an expired token), it will log the user out.
apiService.interceptors.response.use(
  (response) => response, // Just return successful responses
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Token is invalid or expired
      console.log('Auth token is invalid, logging out.');
      localStorage.removeItem('authToken');

      // This reloads the app. Since the token is gone,
      // the userStore will be empty, and AppRoutes will
      // automatically show the LoginPage.
      window.location.href = '/login'; 
    }
    return Promise.reject(error);
  }
);

export default apiService;