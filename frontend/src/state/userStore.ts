// frontend/src/state/userStore.ts
import { create } from 'zustand';
import { jwtDecode } from 'jwt-decode';

// Define the type for the decoded token
interface DecodedToken {
  userId: string;
  role: 'User' | 'Project Manager' | 'Admin';
  name: string;
  iat: number;
  exp: number;
}

// 1. Define the shape of our state and the actions
interface UserState {
  userId: string | null;
  role: 'User' | 'Project Manager' | 'Admin' | null;
  name: string | null;
  isAuthenticated: boolean;

  // Actions: Functions to update the state
  setUser: (userId: string, role: 'User' | 'Project Manager' | 'Admin', name: string) => void;
  clearUser: () => void;
  initialize: () => void;
}

// 2. Create the store
export const useUserStore = create<UserState>((set) => ({
  // --- Default State ---
  userId: null,
  role: null,
  name: null,
  isAuthenticated: false,

  // --- Actions ---
  setUser: (userId, role, name) =>
    set({
      userId: userId,
      role: role,
      name: name,
      isAuthenticated: true,
    }),

  clearUser: () =>
    set({
      userId: null,
      role: null,
      name: null,
      isAuthenticated: false,
    }),
  initialize: () => {
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        const decoded = jwtDecode<DecodedToken>(token);

        //Check if token is expired
        if (decoded.exp * 1000 > Date.now()) {
          // Token is valid, set the user
          set({
            userId: decoded.userId,
            role: decoded.role,
            name: decoded.name,
            isAuthenticated: true
          });
        } else {
          // Token is expired, remove it
          localStorage.removeItem('authToken');
        }
      }
    } catch (error) {
      // Invalid token, remove it
      console.error("Failed to decode token", error);
      localStorage.removeItem('authToken');
    }
  }
}));