// frontend/src/state/projectStore.ts
import { create } from 'zustand';
import apiService from '../services/apiService';

interface Project {
  id: string;
  name: string;
}

interface ProjectState {
  projects: Project[];
  fetchProjects: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  fetchProjects: async () => {
    try {
      const response = await apiService.get('/projects');
      set({ projects: response.data });
    } catch (error) {
      console.error("Failed to fetch projects for store:", error);
      set({ projects: [] });
    }
  },
}));