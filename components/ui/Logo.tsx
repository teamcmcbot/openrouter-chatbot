import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className = "", size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Antenna (15% of height) with rounder top */}
      <rect
        x="46.5"
        y="7.5"
        width="7"
        height="7.5"
        fill="#10B981"
        className="fill-emerald-500"
      />
      <circle
        cx="50"
        cy="7.5"
        r="6.5"
        fill="#10B981"
        className="fill-emerald-500"
      />
      
      {/* Chat bubble body (70% of height, centered) */}
      <rect
        x="15"
        y="15"
        width="70"
        height="70"
        rx="12"
        ry="12"
        fill="#10B981"
        className="fill-emerald-500"
      />
      
      {/* Left ear */}
      <circle
        cx="9"
        cy="37"
        r="6.5"
        fill="#10B981"
        className="fill-emerald-500"
      />
      
      {/* Speech bubble pointer (seamlessly connected to body) */}
      <path
        d="M 32.5 85 L 25 92.5 L 40 85 Z"
        fill="#10B981"
        className="fill-emerald-500"
      />
      
      {/* Left eye (normal) */}
      <circle
        cx="37"
        cy="43"
        r="4.5"
        fill="#000000"
        className="fill-gray-900 dark:fill-gray-900"
      />
      
      {/* Right eye (winking) */}
      <path
        d="M 55 43 C 61 40 67 40 67 43"
        stroke="#000000"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        className="stroke-gray-900 dark:stroke-gray-900"
      />
      
      {/* Smile */}
      <path
        d="M 34 58 Q 50 68 66 58"
        stroke="#000000"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        className="stroke-gray-900 dark:stroke-gray-900"
      />
    </svg>
  );
};

export const LogoWithText: React.FC<LogoProps> = ({ className = "", size = 32 }) => {
  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <Logo size={size} />
      <span className="text-xl font-bold text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
        OpenRouter Chat
      </span>
    </div>
  );
};

export default Logo;