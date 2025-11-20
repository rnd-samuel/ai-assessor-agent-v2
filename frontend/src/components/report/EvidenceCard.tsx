// frontend/src/components/report/EvidenceCard.tsx
import { useState } from 'react';

export interface EvidenceCardData {
  id: string;
  competency: string;
  level: string;
  kb: string;
  quote: string;
  source: string;
  reasoning: string;
}

interface EvidenceCardProps {
  evidence: EvidenceCardData;
  dictionary: any;
  isActive: boolean;
  isViewOnly: boolean;
  onClick: () => void;
  onEdit: (ev: EvidenceCardData) => void;
  onDelete: (id: string) => void;
}

export default function EvidenceCard({
  evidence,
  dictionary,
  isActive,
  isViewOnly,
  onClick,
  onEdit,
  onDelete,
}: EvidenceCardProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  let competencyName = evidence.competency;
  if (dictionary?.kompetensi) {
    const comp = dictionary.kompetensi.find((c: any) =>
      c.id === evidence.competency || c.name === evidence.competency || c.namaKompetensi === evidence.competency
    );
    if (comp) {
      competencyName = comp.name || comp.namaKompetensi;
    }
  }

  return (
    <div
      className={`w-full rounded-lg shadow-sm bg-bg-light border transition-all duration-200 ${
        isActive ? 'border-primary ring-1 ring-primary shadow-md' : 'border-border hover:border-primary/50'
      } cursor-pointer`} // Always cursor-pointer
      onClick={onClick} // Always enable click (highlighting)
    >
      {showReasoning ? (
        <div className="p-4 animate-fade-in">
          <h4 className="text-xs font-bold text-primary uppercase mb-2 tracking-wider">AI Reasoning</h4>
          <p className="text-sm text-text-secondary bg-bg-medium p-3 rounded-md leading-relaxed">
            {evidence.reasoning}
          </p>
        </div>
      ) : (
        <div>
          <div className="p-3 border-b border-border/50 bg-bg-medium/30">
            <div className="flex justify-between items-start mb-1">
               <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">{competencyName}</p>
               <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded bg-white border border-border text-xl font-bold text-primary shadow-sm ml-2">
                 {evidence.level}
               </span>
            </div>
            <p className="text-sm font-medium text-text-primary leading-snug">{evidence.kb}</p>
          </div>
          <div className="p-4">
            <blockquote className="border-l-4 border-primary/30 pl-4 text-sm italic text-text-secondary">
              "{evidence.quote}"
            </blockquote>
            <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {evidence.source}
                </span>
            </div>
          </div>
        </div>
      )}

      {/* Actions Footer */}
      <div className="px-2 py-1.5 border-t border-border flex items-center justify-between bg-gray-50/50 rounded-b-lg">
        <button
          className="text-xs font-medium text-primary hover:text-primary-hover px-2 py-1 rounded hover:bg-primary/5 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setShowReasoning(!showReasoning);
          }}
        >
          {showReasoning ? 'Hide Reasoning' : 'View Reasoning'}
        </button>

        {!isViewOnly && (
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(evidence);
              }}
              className="text-xs font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-gray-200 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(evidence.id);
              }}
              className="text-xs font-medium text-error/80 hover:text-error px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}