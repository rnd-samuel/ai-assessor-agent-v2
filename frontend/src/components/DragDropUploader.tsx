// frontend/src/components/DragDropUploader.tsx
import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';

interface DragDropUploaderProps {
  onUpload: (files: FileList) => void;
  acceptedTypes: string; // e.g. ".pdf,.docx,.txt"
  multiple?: boolean;
  label?: string;
  subLabel?: string;
}

export default function DragDropUploader({
  onUpload,
  acceptedTypes,
  multiple = false,
  label = "Click to upload or drag and drop",
  subLabel
}: DragDropUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFileAccepted = (file: File) => {
    if (!acceptedTypes) return true;
    
    const types = acceptedTypes.split(',').map((t) => t.trim().toLowerCase());
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();

    return types.some((type) => {
      // Check extension (e.g. ".pdf")
      if (type.startsWith('.')) {
        return fileName.endsWith(type);
      }
      // Check MIME type (e.g. "image/*" or "application/pdf")
      if (type.endsWith('/*')) {
        const baseType = type.slice(0, -2); // remove "/*"
        return fileType.startsWith(baseType);
      }
      return fileType === type;
    });
  };

  const processFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const rejectedFiles: string[] = [];

    fileArray.forEach((file) => {
      if (isFileAccepted(file)) {
        validFiles.push(file);
      } else {
        rejectedFiles.push(file.name);
      }
    });

    // Feedback for rejected files
    if (rejectedFiles.length > 0) {
      alert(`The following files were rejected (invalid format):\n- ${rejectedFiles.join('\n- ')}`);
    }

    // If valid files exist, create a new FileList and call onUpload
    if (validFiles.length > 0) {
      // If multiple is false, only take the first valid one
      const finalFiles = multiple ? validFiles : [validFiles[0]];
      
      // Construct a new FileList using DataTransfer (modern browser standard)
      const dt = new DataTransfer();
      finalFiles.forEach((file) => dt.items.add(file));
      
      onUpload(dt.files);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    // Validate selected files (users can sometimes bypass the 'accept' filter in OS dialogs)
    processFiles(e.target.files);
    
    // Reset input so the same file can be selected again if needed
    e.target.value = ''; 
  };

  return (
    <div
      className={`w-full border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ease-in-out
        ${isDragging 
          ? 'border-primary bg-primary/5 scale-[1.02]' 
          : 'border-border bg-bg-medium hover:border-primary/50 hover:bg-bg-medium/80'
        }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept={acceptedTypes}
        multiple={multiple}
        onChange={handleFileInput}
      />
      
      <div className="flex flex-col items-center pointer-events-none">
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="32" height="32" viewBox="0 0 24 24" 
            fill="none" stroke="currentColor" strokeWidth="2" 
            strokeLinecap="round" strokeLinejoin="round" 
            className={`mb-2 transition-colors ${isDragging ? 'text-primary' : 'text-text-muted'}`}
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        
        <p className={`text-sm font-semibold transition-colors ${isDragging ? 'text-primary' : 'text-text-secondary'}`}>
            {isDragging ? "Drop files here" : label}
        </p>
        
        {subLabel && (
            <p className="text-xs text-text-muted mt-1">{subLabel}</p>
        )}
      </div>
    </div>
  );
}