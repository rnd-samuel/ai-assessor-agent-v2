// frontend/src/components/LoadingButton.tsx
import React from 'react';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'info';
  icon?: React.ReactNode;
}

export default function LoadingButton({
  isLoading,
  loadingText = 'Loading...',
  variant = 'primary',
  icon,
  className = '',
  children,
  disabled,
  ...props
}: LoadingButtonProps) {
  
  const baseStyles = "rounded-md text-sm font-semibold px-4 py-2 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-hover",
    secondary: "bg-white text-text-secondary border border-border hover:bg-bg-medium",
    danger: "bg-error text-white hover:bg-red-700",
    info: "bg-info text-white hover:bg-blue-700",
    ghost: "bg-transparent text-text-secondary hover:bg-bg-medium"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{loadingText}</span>
        </>
      ) : (
        <>
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}