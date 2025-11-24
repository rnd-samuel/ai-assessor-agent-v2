// frontend/src/components/DictionaryContentDisplay.tsx

// Shared Interfaces
export interface KeyBehavior extends String {}

export interface Level {
  nomor: string;
  penjelasan: string;
  keyBehavior: KeyBehavior[];
}

export interface Kompetensi {
  id?: string;
  name?: string;
  namaKompetensi?: string;
  definisiKompetensi: string;
  level: Level[];
}

export interface DictionaryContent {
  namaKamus: string;
  kompetensi: Kompetensi[];
}

interface DictionaryContentDisplayProps {
  content: DictionaryContent | null;
}

export default function DictionaryContentDisplay({ content }: DictionaryContentDisplayProps) {
  // Handle missing or malformed content gracefully
  if (!content || !content.kompetensi) {
    return (
      <div className="p-8 text-center border-2 border-dashed border-border rounded-lg">
        <p className="text-text-muted">No dictionary content available to display.</p>
        <p className="text-xs text-text-muted mt-1">The file might be empty or invalid.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {content.kompetensi.map((komp, idx) => (
        <div key={komp.id || idx} className="border border-border rounded-lg overflow-hidden shadow-sm bg-white">
          {/* Competency Header */}
          <div className="bg-bg-medium p-4 border-b border-border">
            <h4 className="text-lg font-bold text-text-primary">{komp.name || komp.namaKompetensi}</h4>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">{komp.definisiKompetensi}</p>
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
                  <tr key={lvlIdx} className="hover:bg-bg-medium/30 transition-colors">
                    <td className="p-4 align-top text-center font-bold text-primary text-lg border-r border-border bg-bg-light/50">
                      {lvl.nomor}
                    </td>
                    <td className="p-4 align-top text-text-primary border-r border-border font-medium">
                      {lvl.penjelasan}
                    </td>
                    <td className="p-4 align-top">
                      <ul className="list-disc list-outside pl-4 space-y-1.5 text-text-secondary marker:text-primary">
                        {lvl.keyBehavior.map((kb, kbIdx) => (
                          <li key={kbIdx} className="leading-relaxed">{kb}</li>
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