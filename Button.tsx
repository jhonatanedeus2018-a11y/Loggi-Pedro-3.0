
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  loading = false, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "px-4 py-2 rounded-xl font-black transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.96] text-sm tracking-tight";
  
  const variants = {
    primary: "bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-500 text-white shadow-lg shadow-red-100 hover:bg-red-600",
    success: "bg-emerald-500 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-600"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      ) : children}
    </button>
  );
};
