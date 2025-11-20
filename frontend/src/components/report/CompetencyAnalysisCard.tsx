// frontend/src/components/report/CompetencyAnalysisCard.tsx
import { useState, useMemo, useRef, useLayoutEffect } from 'react';

// 1. Updated Interfaces to match backend
export interface EvidenceRef {
  quote: string;
  source: string;
}

export interface KeyBehaviorStatus {
  level: string; // <--- Added Level
  kbText: string;
  fulfilled: boolean;
  explanation?: string;
  evidence?: EvidenceRef[]; // <--- Added Evidence List
}

export interface CompetencyAnalysisData {
  id: string;
  competencyName: string;
  levelAchieved: string; 
  explanation: string;
  developmentRecommendations: string;
  keyBehaviors: KeyBehaviorStatus[];
}

interface CompetencyAnalysisCardProps {
  data: CompetencyAnalysisData;
  targetLevel: string;
  isViewOnly: boolean;
  onChange: (updated: CompetencyAnalysisData) => void;
  onAskAI: (context: string, currentText: string, onApply: (t: string) => void) => void;
  onHighlightEvidence: (quote: string, source: string) => void;
}

const AutoTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to shrink if needed, then set to scrollHeight
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [props.value]);
  return <textarea ref={textareaRef} {...props} />;
};

export default function CompetencyAnalysisCard({
  data,
  targetLevel,
  isViewOnly,
  onChange,
  onAskAI,
  onHighlightEvidence,
}: CompetencyAnalysisCardProps) {
  const [level, setLevel] = useState(data.levelAchieved);
  const [explanation, setExplanation] = useState(data.explanation);
  const [recommendation, setRecommendation] = useState(data.developmentRecommendations);
  const [keyBehaviors, setKeyBehaviors] = useState(data.keyBehaviors);

  // Helper: Group KBs by Level
  const kbsByLevel = useMemo(() => {
    const groups: Record<string, KeyBehaviorStatus[]> = {};
    keyBehaviors.forEach(kb => {
      const lvl = kb.level || 'Unassigned';
      if (!groups[lvl]) groups[lvl] = [];
      groups[lvl].push(kb);
    });
    // Sort levels (assuming numeric strings "1", "2"...)
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [keyBehaviors]);

  const getScoreColor = (current: string, target: string) => {
    const curr = parseInt(current) || 0;
    const tgt = parseInt(target) || 0;
    if (curr > tgt) return 'text-success';
    if (curr < tgt) return 'text-warning';
    return 'text-text-primary';
  };

  const handleUpdate = (field: Partial<CompetencyAnalysisData>) => {
    const updated = { ...data, ...field };
    onChange(updated);
  };

  // Helper to update a specific KB inside the flat list
  const updateKb = (kbText: string, updates: Partial<KeyBehaviorStatus>) => {
    const newKbs = keyBehaviors.map(kb => 
      kb.kbText === kbText ? { ...kb, ...updates } : kb
    );
    setKeyBehaviors(newKbs);
    handleUpdate({ keyBehaviors: newKbs });
  };

  return (
    <div className="w-full rounded-lg shadow-md bg-bg-light border border-border mb-6 last:mb-0">
      {/* Header */}
      <div className="p-4 flex justify-between items-start border-b border-border bg-bg-light rounded-t-lg">
        <h3 className="text-xl font-semibold text-text-primary mt-1">{data.competencyName}</h3>
        <div className="text-right">
          <label className="text-xs font-medium text-text-muted mb-1 block uppercase tracking-wide">Level (Target: {targetLevel})</label>
          <input
            type="number"
            value={level}
            className={`w-16 px-2 py-1 text-2xl font-bold text-center border border-border rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary ${getScoreColor(level, targetLevel)}`}
            min="1"
            max="5"
            disabled={isViewOnly}
            onChange={(e) => {
              setLevel(e.target.value);
              handleUpdate({ levelAchieved: e.target.value });
            }}
          />
        </div>
      </div>

      <div className="p-4 space-y-6">
        
        {/* 1. Overall Explanation */}
        <div className="relative group">
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-text-primary">Assessment Explanation</label>
            {!isViewOnly && (
              <button
                onClick={() => onAskAI(
                  `Refine explanation for ${data.competencyName}`,
                  explanation,
                  (newText) => {
                    setExplanation(newText);
                    handleUpdate({ explanation: newText });
                  }
                )}
                className="p-1 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              </button>
            )}
          </div>
          <AutoTextarea
            rows={3}
            className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm text-text-secondary resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
            value={explanation}
            disabled={isViewOnly}
            onChange={(e) => {
              setExplanation(e.target.value);
              handleUpdate({ explanation: e.target.value });
            }}
          />
        </div>

        {/* 2. Levels Explained (Grouped) */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-text-primary pt-2 border-t border-border">Levels Explained</h4>
          
          {kbsByLevel.map(([lvl, kbs]) => (
            <div key={lvl} className="pl-2">
              <h5 className="font-semibold text-text-primary text-sm mb-2">Level {lvl}</h5>
              <div className="space-y-6 pl-4 border-l-2 border-border">
                {kbs.map((kb, idx) => (
                  <div key={idx} className="space-y-2">
                    {/* A. Checkbox & Title */}
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="mt-0.5 w-4 h-4 rounded-sm border-border accent-primary flex-shrink-0 cursor-pointer"
                        checked={kb.fulfilled}
                        disabled={isViewOnly}
                        onChange={(e) => updateKb(kb.kbText, { fulfilled: e.target.checked })}
                      />
                      <span className={`text-sm ${kb.fulfilled ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                        {kb.kbText}
                      </span>
                    </label>

                    {/* B. Explanation Box */}
                    <div className="relative group ml-7">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-medium text-text-muted">Explanation</label>
                        {!isViewOnly && (
                          <button
                            onClick={() => onAskAI(
                              `Refine KB analysis for: ${kb.kbText}`,
                              kb.explanation || '',
                              (newText) => {
                                setExplanation(newText);
                                handleUpdate({ explanation: newText });
                              }
                            )}
                            className="p-1 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                          </button>
                        )}
                      </div>
                      <AutoTextarea
                        rows={2}
                        className="w-full rounded-md border border-border p-2 bg-bg-medium/50 shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
                        value={kb.explanation || ''}
                        placeholder="Why was this behavior fulfilled or not?"
                        disabled={isViewOnly}
                        onChange={(e) => updateKb(kb.kbText, { explanation: e.target.value })}
                      />

                      {/* C. Supporting Evidence List */}
                      {kb.evidence && kb.evidence.length > 0 && (
                        <div className="mt-3">
                            <label className="text-xs font-semibold text-text-muted">Supporting Evidence:</label>
                            <ul className="list-none space-y-2 mt-1">
                                {kb.evidence.map((ev, i) => (
                                    <li key={i}
                                      className="cursor-pointer hover:bg-primary/5 rounded p-1 -ml-1 transition-colors group/evidence"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onHighlightEvidence(ev.quote, ev.source);
                                      }}
                                    >
                                        <blockquote className="border-l-4 border-border pl-3 text-xs italic text-text-secondary">
                                            "{ev.quote}"
                                        </blockquote>
                                        <p className="text-xs text-text-muted pl-3 mt-0.5">Source: {ev.source}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 3. Development Recommendations */}
        <div className="relative group pt-4 border-t border-border">
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-text-primary">Development Recommendations</label>
            {!isViewOnly && (
              <button
                onClick={() => onAskAI(
                  `Refine development recommendations for ${data.competencyName}`,
                  recommendation,
                  (newText) => {
                    setExplanation(newText);
                    handleUpdate({ explanation: newText });
                  }
                )}
                className="p-1 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              </button>
            )}
          </div>
          <AutoTextarea
            rows={3}
            className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm text-text-secondary resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
            value={recommendation}
            disabled={isViewOnly}
            onChange={(e) => {
              setRecommendation(e.target.value);
              handleUpdate({ developmentRecommendations: e.target.value });
            }}
          />
        </div>

      </div>
    </div>
  );
}