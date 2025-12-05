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

// --- Chevron Icon Helper ---
const ChevronDown = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6"/></svg>
);

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
  // Collapsing State
  const [isLevelsExpanded, setIsLevelsExpanded] = useState(true);
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>({});
  const [openKBs, setOpenKBs] = useState<Record<string, boolean>>({});

  const toggleLevel = (lvl: string) => {
    setOpenLevels(prev => ({ ...prev, [lvl]: !prev[lvl] }));
  };

  const toggleKB = (kbText: string) => {
    setOpenKBs(prev => ({ ...prev, [kbText]: !prev[kbText] }));
  };

  // Group KBs by Level
  const kbsByLevel = useMemo(() => {
    const groups: Record<string, KeyBehaviorStatus[]> = {};
    data.keyBehaviors.forEach(kb => {
      const lvl = kb.level || 'Unassigned';
      if (!groups[lvl]) groups[lvl] = [];
      groups[lvl].push(kb);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.keyBehaviors]);

  const getScoreColor = (current: string, target: string) => {
    const curr = parseInt(current) || 0;
    const tgt = parseInt(target) || 0;
    if (curr > tgt) return 'text-success';
    if (curr < tgt) return 'text-warning';
    return 'text-text-primary';
  };

  useLayoutEffect(() => {
      setOpenLevels(prev => ({ ...prev, [targetLevel]: true }));
  }, [targetLevel]);

  const handleUpdate = (field: Partial<CompetencyAnalysisData>) => {
    const updated = { ...data, ...field };
    onChange(updated);
  };

  // Helper to update a specific KB inside the flat list
  const updateKb = (kbText: string, updates: Partial<KeyBehaviorStatus>) => {
    const newKbs = data.keyBehaviors.map(kb => 
      kb.kbText === kbText ? { ...kb, ...updates } : kb
    );
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
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setIsLevelsExpanded(!isLevelsExpanded)}
            className="w-full flex items-center justify-between p-3 bg-bg-medium/50 hover:bg-bg-medium transition-colors text-left"
          >
            <span className="font-semibold text-sm text-text-primary">Levels Breakdown</span>
            <ChevronDown className={`transition-transform duration-200 ${isLevelsExpanded ? 'rotate-180' : ''}`} />
          </button>
          {isLevelsExpanded && (
            <div className="p-4 space-y-4 bg-white">
              {kbsByLevel.map(([lvl, kbs]) => (
                <div key={lvl} className="border border-border rounded-md overflow-hidden">
                  {/* Level Header */}
                  <button
                    onClick={() => toggleLevel(lvl)}
                    className="w-full flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left border-b border-border/50"
                  >
                    <span className="font-medium text-sm text-text-primary">Level {lvl}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">{kbs.filter(k => k.fulfilled).length}/{kbs.length} Fulfilled</span>
                      <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-200 ${openLevels[lvl] ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* KBs List */}
                  {openLevels[lvl] && (
                    <div className="p-3 space-y-3 bg-white">
                      {kbs.map((kb, idx) => (
                        <div key={idx} className="border border-border/50 rounded-md">
                          {/* KB Header Row */}
                          <div className="flex items-start gap-3 p-3">
                            <input
                              type="checkbox"
                              className="mt-1 w-4 h-4 rounded-sm border-border accent-primary flex-shrink-0 cursor-pointer"
                              checked={kb.fulfilled}
                              disabled={isViewOnly}
                              onChange={(e) => updateKb(kb.kbText, { fulfilled: e.target.checked })}
                            />
                            <div className="flex-grow">
                              <div
                                className="flex justify-between items-start cursor-pointer group/kb"
                                onClick={() => toggleKB(kb.kbText)}
                              >
                                <span className={`text-sm ${kb.fulfilled ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                                  {kb.kbText}
                                </span>
                                <ChevronDown className={`w-4 h-4 text-text-muted flex-shrink-0 mt-0.5 ml-2 transition-transform ${openKBs[kb.kbText] ? 'rotate-180' : ''}`} />
                              </div>

                              {/* KB Details (Explanation + Evidence) */}
                              {openKBs[kb.kbText] && (
                                <div className="mt-3 space-y-3 animate-fade-in pl-1">
                                  {/* Explanation */}
                                  <div className="relative group/edit">
                                    <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Reasoning</label>
                                    <AutoTextarea
                                      rows={2}
                                      className="w-full rounded-md border border-border p-2 bg-bg-medium/30 text-xs text-text-secondary resize-none focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none"
                                      value={kb.explanation || ''}
                                      placeholder="Why was this behavior fulfilled or not?"
                                      disabled={isViewOnly}
                                      onChange={(e) => updateKb(kb.kbText, { explanation: e.target.value })}
                                    />
                                    {!isViewOnly && (
                                      <button
                                        onClick={() => onAskAI(
                                          `Refine reasoning for: ${kb.kbText}`,
                                          kb.explanation || '',
                                          (newText) => updateKb(kb.kbText, { explanation: newText })
                                        )}
                                        className="absolute top-0 right-0 p-1 text-primary opacity-0 group-hover/edit:opacity-100 transition-opacity"
                                        title="Refine with AI"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                                      </button>
                                    )}
                                  </div>

                                  {/* Evidence List */}
                                  {kb.evidence && kb.evidence.length > 0 ? (
                                    <div>
                                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Supporting Evidence</label>
                                      <ul className="space-y-2">
                                        {kb.evidence.map((ev, i) => (
                                          <li
                                            key={i}
                                            className="bg-bg-light border border-border/50 rounded p-2 cursor-pointer hover:border-primary/50 transition-colors group/evidence"
                                            onClick={() => onHighlightEvidence(ev.quote, ev.source)}
                                          >
                                            <p className="text-xs italic text-text-secondary mb-1">"{ev.quote}"</p>
                                            <div className="flex items-center gap-2">
                                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                                {ev.source}
                                              </span>
                                              <span className="text-[10px] text-primary opacity-0 group-hover/evidence:opacity-100 transition-opacity">
                                                Click to locate
                                              </span>
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-text-muted italic">No specific evidence linked.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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