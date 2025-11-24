// frontend/src/components/SearchableSelect.tsx
import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select...",
  className = "",
  disabled = false
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);
  
  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase()) || 
    (o.subLabel && o.subLabel.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm text-left flex justify-between items-center focus:ring-2 focus:ring-primary/50 outline-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : <span className="text-text-muted">{placeholder}</span>}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 w-full bg-bg-light border border-border rounded-md shadow-lg z-50 max-h-60 flex flex-col">
          <div className="p-2 border-b border-border sticky top-0 bg-bg-light rounded-t-md">
            <input
              type="text"
              autoFocus
              placeholder="Search..."
              className="w-full rounded-md border border-border px-2 py-1 text-sm focus:border-primary outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ul className="overflow-y-auto flex-1 p-1">
            {filteredOptions.length > 0 ? filteredOptions.map((opt) => (
              <li 
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                  setSearch('');
                }}
                className={`px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-bg-medium ${opt.value === value ? 'bg-primary/10 text-primary font-medium' : 'text-text-primary'}`}
              >
                <div>{opt.label}</div>
                {opt.subLabel && <div className="text-xs text-text-muted">{opt.subLabel}</div>}
              </li>
            )) : (
              <li className="px-3 py-2 text-sm text-text-muted italic">No matches found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}