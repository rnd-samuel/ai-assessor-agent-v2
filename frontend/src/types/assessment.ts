// frontend/src/types/assessment.ts

export interface Evidence {
  id: string;
  competency: string;
  level: string;
  kb: string;
  quote: string;
  source: string;
  reasoning: string;
  is_ai_generated: boolean;
}

// Update this to match the new Backend Schema
export type KBStatus = 'FULFILLED' | 'NOT_OBSERVED' | 'CONTRA_INDICATOR';

export interface KeyBehaviorAnalysis {
  id: string;
  level: number;
  kbText: string;
  
  // The new fields from backend
  status: KBStatus; 
  reasoning: string;
  
  evidence: Evidence[];
}

export interface CompetencyAnalysis {
  id: string;
  competencyName: string;
  levelAchieved: number;
  explanation: string;
  developmentRecommendations: string;
  keyBehaviors: KeyBehaviorAnalysis[];
}