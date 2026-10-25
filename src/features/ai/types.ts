export interface PerformanceSummary {
  projectName: string;
  sections: {
    id: string;
    name: string;
    accuracy: number;
    attempted: number;
    weakCards: number;
    avgStability: number;
  }[];
  weakCards: {
    cardId: string;
    sectionId: string;
    lapses: number;
    stability: number;
    difficulty: number;
  }[];
  recentAccuracy: number;
  totalReviews: number;
  totalCards: number;
}

export interface GeneratedQuestion {
  q: string;
  correct: string;
  wrong: string[];
  explanation?: string;
}

export type AITab = 'insights' | 'generate' | 'targeted';
