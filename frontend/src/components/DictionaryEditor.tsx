// frontend/src/components/DictionaryEditor.tsx
import { type DictionaryContent, type Kompetensi, type Level } from './DictionaryContentDisplay';

interface DictionaryEditorProps {
  content: DictionaryContent;
  onChange: (newContent: DictionaryContent) => void;
}

export default function DictionaryEditor({ content, onChange }: DictionaryEditorProps) {
  
  // --- Handlers for Updates ---

  const handleCompetencyChange = (index: number, field: keyof Kompetensi, value: string) => {
    const newKompetensi = [...content.kompetensi];
    newKompetensi[index] = { ...newKompetensi[index], [field]: value };
    onChange({ ...content, kompetensi: newKompetensi });
  };

  const handleLevelChange = (compIndex: number, levelIndex: number, field: keyof Level, value: string) => {
    const newKompetensi = [...content.kompetensi];
    const newLevels = [...newKompetensi[compIndex].level];
    newLevels[levelIndex] = { ...newLevels[levelIndex], [field]: value };
    newKompetensi[compIndex] = { ...newKompetensi[compIndex], level: newLevels };
    onChange({ ...content, kompetensi: newKompetensi });
  };

  const handleKBChange = (compIndex: number, levelIndex: number, kbIndex: number, value: string) => {
    const newKompetensi = [...content.kompetensi];
    const newLevels = [...newKompetensi[compIndex].level];
    const newKBs = [...newLevels[levelIndex].keyBehavior];
    newKBs[kbIndex] = value; // Update specific KB string
    newLevels[levelIndex] = { ...newLevels[levelIndex], keyBehavior: newKBs };
    newKompetensi[compIndex] = { ...newKompetensi[compIndex], level: newLevels };
    onChange({ ...content, kompetensi: newKompetensi });
  };

  // --- Render ---

  if (!content || !content.kompetensi) {
    return <div className="text-text-muted text-center p-4">No content to edit.</div>;
  }

  return (
    <div className="space-y-8">
      {content.kompetensi.map((komp, compIdx) => (
        <div key={compIdx} className="border border-border rounded-lg overflow-hidden shadow-sm bg-white">
          
          {/* Competency Header (Editable) */}
          <div className="bg-bg-medium p-4 border-b border-border space-y-3">
            <div>
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Competency Name</label>
              <input
                type="text"
                className="w-full font-bold text-lg text-text-primary bg-white border border-border rounded px-2 py-1 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                value={komp.name || komp.namaKompetensi || ''}
                onChange={(e) => {
                    // Handle both name fields to be safe
                    const val = e.target.value;
                    const newKompetensi = [...content.kompetensi];
                    newKompetensi[compIdx] = { ...newKompetensi[compIdx], name: val, namaKompetensi: val };
                    onChange({ ...content, kompetensi: newKompetensi });
                }}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Definition</label>
              <textarea
                rows={2}
                className="w-full text-sm text-text-secondary bg-white border border-border rounded px-2 py-1 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-y"
                value={komp.definisiKompetensi}
                onChange={(e) => handleCompetencyChange(compIdx, 'definisiKompetensi', e.target.value)}
              />
            </div>
          </div>
          
          {/* Levels Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-light border-b border-border text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="p-3 w-16 text-center border-r border-border">Level</th>
                  <th className="p-3 w-1/3 border-r border-border">Description</th>
                  <th className="p-3">Key Behaviors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {komp.level.map((lvl, lvlIdx) => (
                  <tr key={lvlIdx} className="group">
                    {/* Level Number */}
                    <td className="p-3 align-top border-r border-border bg-bg-light/50">
                      <input
                        type="text"
                        className="w-full text-center font-bold text-primary bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 outline-none"
                        value={lvl.nomor}
                        onChange={(e) => handleLevelChange(compIdx, lvlIdx, 'nomor', e.target.value)}
                      />
                    </td>
                    
                    {/* Description */}
                    <td className="p-3 align-top border-r border-border">
                      <textarea
                        rows={3}
                        className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 text-text-primary resize-none focus:bg-white outline-none"
                        value={lvl.penjelasan}
                        onChange={(e) => handleLevelChange(compIdx, lvlIdx, 'penjelasan', e.target.value)}
                      />
                    </td>

                    {/* Key Behaviors */}
                    <td className="p-3 align-top">
                      <ul className="space-y-2">
                        {lvl.keyBehavior.map((kb, kbIdx) => (
                          <li key={kbIdx} className="flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                            <textarea
                              rows={2}
                              className="flex-1 text-sm text-text-secondary bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 resize-none focus:bg-white outline-none"
                              value={kb.toString()}
                              onChange={(e) => handleKBChange(compIdx, lvlIdx, kbIdx, e.target.value)}
                            />
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}