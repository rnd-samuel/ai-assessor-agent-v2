// frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { useUserStore } from './state/userStore.ts';

// --- INITIALIZE THE STORE ---
useUserStore.getState().initialize();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />
)