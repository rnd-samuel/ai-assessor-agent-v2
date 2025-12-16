// frontend/src/components/report/CompetencyAnalysisCard.tsx
import { useState, useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { type CompetencyAnalysis, type KeyBehaviorAnalysis, type KBStatus } from '../../types/assessment';

interface CompetencyAnalysisCardProps {
  data: CompetencyAnalysis;
  targetLevel: string;
  isViewOnly: boolean;
  onChange: (updated: CompetencyAnalysis) => void;
  onAskAI: (context: string, currentText: string, onApply: (t: string) => void) => void;
  onHighlightEvidence: (quote: string, source: string) => void;
  askAiEnabled?: boolean;
}

const AutoTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [props.value]);
  return <textarea ref={textareaRef} {...props} />;
};

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
  askAiEnabled
}: CompetencyAnalysisCardProps) {
  const [level, setLevel] = useState(data.levelAchieved?.toString() || "0");
  const [explanation, setExplanation] = useState(data.explanation);
  const [recommendation, setRecommendation] = useState(data.developmentRecommendations);

  // Sync state if props change (e.g. after regeneration)
  useEffect(() => {
    setLevel(data.levelAchieved?.toString() || "0");
    setExplanation(data.explanation);
    setRecommendation(data.developmentRecommendations);
  }, [data]);

  const [isLevelsExpanded, setIsLevelsExpanded] = useState(true);
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>({});
  
  // REMOVED: Unused openKBs state and toggleKB function

  const toggleLevel = (lvl: string) => {
    setOpenLevels(prev => ({ ...prev, [lvl]: !prev[lvl] }));
  };

  // Helper to handle updates
  const handleUpdate = (field: Partial<CompetencyAnalysis>) => {
    onChange({ ...data, ...field });
  };

  // Helper to update specific KB
  const updateKb = (kbId: string, updates: Partial<KeyBehaviorAnalysis>) => {
    const newKbs = data.keyBehaviors.map(kb => 
      kb.id === kbId ? { ...kb, ...updates } : kb
    );
    handleUpdate({ keyBehaviors: newKbs });
  };

  // Group KBs by Level
  const kbsByLevel = useMemo(() => {
    const groups: Record<string, KeyBehaviorAnalysis[]> = {};
    data.keyBehaviors.forEach(kb => {
      const lvl = kb.level.toString();
      if (!groups[lvl]) groups[lvl] = [];
      groups[lvl].push(kb);
    });
    return Object.entries(groups).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  }, [data.keyBehaviors]);

  const getScoreColor = (current: string, target: string) => {
    const curr = parseInt(current) || 0;
    const tgt = parseInt(target) || 0;
    if (curr >= tgt) return 'text-success border-success/50 bg-success/5'; // Met or Exceeded
    return 'text-warning border-warning/50 bg-warning/5'; // Below
  };

  // Helper: Cycle through statuses on click
  const cycleStatus = (current: KBStatus): KBStatus => {
    if (current === 'FULFILLED') return 'NOT_OBSERVED';
    if (current === 'NOT_OBSERVED') return 'CONTRA_INDICATOR';
    return 'FULFILLED';
  };

  const getStatusBadge = (status: KBStatus) => {
    switch(status) {
        case 'FULFILLED': return <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold">FULFILLED</span>;
        case 'CONTRA_INDICATOR': return <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error border border-error/20 font-bold">CONTRA-INDICATOR</span>;
        default: return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">NOT OBSERVED</span>;
    }
  };

  return (
    <div className="w-full rounded-lg shadow-md bg-bg-light border border-border mb-6 last:mb-0">
      
      {/* Header */}
      <div className="p-4 flex justify-between items-start border-b border-border bg-bg-light rounded-t-lg">
        <div>
            <h3 className="text-xl font-semibold text-text-primary mt-1">{data.competencyName}</h3>
            <p className="text-xs text-text-muted mt-1 uppercase tracking-wide">Target Level: {targetLevel}</p>
        </div>
        <div className="text-right">
          <label className="text-[10px] font-bold text-text-muted mb-1 block uppercase">Score</label>
          <input
            type="number"
            value={level}
            className={`w-16 px-2 py-1 text-2xl font-bold text-center border rounded-md shadow-inner outline-none focus:ring-2 focus:ring-primary/50 ${getScoreColor(level, targetLevel)}`}
            min="0"
            max="5"
            disabled={isViewOnly}
            onChange={(e) => {
              const val = e.target.value;
              setLevel(val);
              handleUpdate({ levelAchieved: parseInt(val) });
            }}
          />
        </div>
      </div>

      <div className="p-4 space-y-6">
        
        {/* Explanation */}
        <div className="relative group">
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-text-primary">Analysis Summary</label>
            {!isViewOnly && askAiEnabled && (
              <button
                onClick={() => onAskAI('Refine explanation', explanation, (t) => { setExplanation(t); handleUpdate({ explanation: t }); })}
                className="p-1 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              </button>
            )}
          </div>
          <AutoTextarea
            rows={3}
            className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm text-text-secondary resize-none focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
            value={explanation}
            disabled={isViewOnly}
            onChange={(e) => {
              setExplanation(e.target.value);
              handleUpdate({ explanation: e.target.value });
            }}
          />
        </div>

        {/* Levels Breakdown */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setIsLevelsExpanded(!isLevelsExpanded)}
            className="w-full flex items-center justify-between p-3 bg-bg-medium/50 hover:bg-bg-medium transition-colors text-left"
          >
            <span className="font-semibold text-sm text-text-primary">Key Behaviors Breakdown</span>
            <ChevronDown className={`transition-transform duration-200 ${isLevelsExpanded ? 'rotate-180' : ''}`} />
          </button>
          
          {isLevelsExpanded && (
            <div className="bg-white divide-y divide-border/50">
              {kbsByLevel.map(([lvl, kbs]) => (
                <div key={lvl} className="group/level">
                  <button
                    onClick={() => toggleLevel(lvl)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-bg-medium text-xs font-bold text-text-secondary flex items-center justify-center border border-border">
                            {lvl}
                        </span>
                        <span className="text-sm font-medium text-text-primary">Level {lvl}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                          {/* Mini Status Bar for collapsed view */}
                          {kbs.map((k, i) => (
                              <div key={i} className={`w-1.5 h-1.5 rounded-full ${
                                  k.status === 'FULFILLED' ? 'bg-success' : 
                                  k.status === 'CONTRA_INDICATOR' ? 'bg-error' : 'bg-gray-400'
                              }`} />
                          ))}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${openLevels[lvl] ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* KBs List */}
                  {openLevels[lvl] && (
                    <div className="px-4 pb-4 space-y-3">
                      {kbs.map((kb) => (
                        <div key={kb.id} className="relative border border-border rounded-md p-3 bg-white hover:border-primary/30 transition-colors group/kb">
                          <div className="flex items-start gap-3">
                            {/* 3-State Checkbox / Status Toggle */}
                            <button
                                onClick={() => updateKb(kb.id, { status: cycleStatus(kb.status) })}
                                disabled={isViewOnly}
                                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                    kb.status === 'FULFILLED' ? 'bg-success border-success text-white' :
                                    kb.status === 'CONTRA_INDICATOR' ? 'bg-error border-error text-white' :
                                    'bg-white border-gray-300 hover:border-primary'
                                }`}
                                title="Click to cycle status"
                            >
                                {kb.status === 'FULFILLED' && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                {kb.status === 'CONTRA_INDICATOR' && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                            </button>

                            <div className="flex-grow">
                              <div className="flex justify-between items-start gap-4">
                                <span className={`text-sm leading-snug ${kb.status === 'NOT_OBSERVED' ? 'text-text-secondary' : 'text-text-primary font-medium'}`}>
                                  {kb.kbText}
                                </span>
                                {getStatusBadge(kb.status)}
                              </div>

                              {/* Reasoning Field */}
                              <div className="mt-3 relative">
                                <div className="flex justify-between items-center mb-1">
                                  <AutoTextarea
                                    rows={1}
                                    placeholder="Reasoning..."
                                    className="w-full text-xs text-text-secondary bg-bg-medium/30 border-b border-transparent focus:border-primary focus:bg-white transition-colors outline-none p-2 pb-8 rounded"
                                    value={kb.reasoning || ''}
                                    disabled={isViewOnly}
                                    onChange={(e) => updateKb(kb.id, { reasoning: e.target.value })}
                                  />
                                </div>
                              </div>

                              {/* Evidence Chips */}
                              {kb.evidence && kb.evidence.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {kb.evidence.map((ev, i) => (
                                    <button
                                      key={i}
                                      onClick={() => onHighlightEvidence(ev.quote, ev.source)}
                                      className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors truncate max-w-[200px]"
                                      title={ev.quote}
                                    >
                                      "{ev.quote.substring(0, 30)}..."
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {!isViewOnly && askAiEnabled && (
                            <button
                              onClick={() => onAskAI(
                                `Refine reasoning for Key Behavior: "${kb.kbText}". Current status: ${kb.status}`, 
                                kb.reasoning || '', 
                                (t) => updateKb(kb.id, { reasoning: t })
                              )}
                              className="absolute bottom-2 right-2 p-1.5 text-[10px] bg-white text-primary border border-primary/20 shadow-sm rounded-md opacity-0 group-hover/kb:opacity-100 transition-all hover:bg-primary/5 flex items-center gap-1.5"
                              title="Refine with AI"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Development Recommendations */}
        <div className="relative group pt-4 border-t border-border">
            <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-text-primary">Development Recommendations</label>
                {!isViewOnly && (
                    <button
                        onClick={() => onAskAI('Refine recommendations', recommendation, (t) => { setRecommendation(t); handleUpdate({ developmentRecommendations: t }); })}
                        className="p-1 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                    </button>
                )}
            </div>
            <AutoTextarea
                rows={3}
                className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm text-text-secondary resize-none focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
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