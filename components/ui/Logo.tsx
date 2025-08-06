import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

// export const Logo: React.FC<LogoProps> = ({ className = "", size = 32 }) => {
//   return (
//     <svg
//       width={size}
//       height={size}
//       viewBox="0 0 100 100"
//       fill="none"
//       xmlns="http://www.w3.org/2000/svg"
//       className={className}
//     >
//       {/* Antenna (15% of height) with rounder top */}
//       <rect
//         x="46.5"
//         y="7.5"
//         width="7"
//         height="7.5"
//         fill="#10B981"
//         className="fill-emerald-500"
//       />
//       <circle
//         cx="50"
//         cy="7.5"
//         r="6.5"
//         fill="#10B981"
//         className="fill-emerald-500"
//       />
      
//       {/* Chat bubble body (70% of height, centered) */}
//       <rect
//         x="15"
//         y="15"
//         width="70"
//         height="70"
//         rx="12"
//         ry="12"
//         fill="#10B981"
//         className="fill-emerald-500"
//       />
      
//       {/* Left ear */}
//       <circle
//         cx="9"
//         cy="37"
//         r="6.5"
//         fill="#10B981"
//         className="fill-emerald-500"
//       />
      
//       {/* Speech bubble pointer (seamlessly connected to body) */}
//       <path
//         d="M 32.5 85 L 25 92.5 L 40 85 Z"
//         fill="#10B981"
//         className="fill-emerald-500"
//       />
      
//       {/* Left eye (normal) */}
//       <circle
//         cx="37"
//         cy="43"
//         r="4.5"
//         fill="#000000"
//         className="fill-gray-900 dark:fill-gray-900"
//       />
      
//       {/* Right eye (winking) */}
//       <path
//         d="M 55 43 C 61 40 67 40 67 43"
//         stroke="#000000"
//         strokeWidth="4.5"
//         strokeLinecap="round"
//         fill="none"
//         className="stroke-gray-900 dark:stroke-gray-900"
//       />
      
//       {/* Smile */}
//       <path
//         d="M 34 58 Q 50 68 66 58"
//         stroke="#000000"
//         strokeWidth="4.5"
//         strokeLinecap="round"
//         fill="none"
//         className="stroke-gray-900 dark:stroke-gray-900"
//       />
//     </svg>
//   );
// };

export const Logo: React.FC<LogoProps> = ({
  size = 32,
  className = "",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="GreenBubble logo"
    className={className}
  >
    {/* Scale‑and‑centre group (translate → scale → translate‑back) */}
    <g transform="translate(256 256) scale(1.3) translate(-255 -260)">
      {/* 1. Speech‑bubble body */}
      <rect
        x="136"
        y="136"
        width="240"
        height="240"
        rx="42"
        ry="42"
        className="fill-emerald-500"
      />

      {/* 2. Ear */}
      <rect
        x="113"
        y="231"
        width="24"
        height="52"
        rx="8"
        ry="8"
        className="fill-emerald-500"
      />

      {/* 3. Tail */}
      <path
        d="M235 374 L195 420 L285 374 Z"
        className="fill-emerald-500"
      />

      {/* 4. Antenna */}
      <rect
        x="248"
        y="116"
        width="16"
        height="24"
        className="fill-emerald-500"
      />
      <circle
        cx="256"
        cy="104"
        r="18"
        className="fill-emerald-500"
      />

      {/* 5. Face */}
      <ellipse
        cx="218"
        cy="231"
        rx="17"
        ry="21"
        className="fill-gray-900 dark:fill-gray-900"
      />
      <path
        d="M275 238 C277 215 305 210 311 238"
        strokeWidth={18}
        strokeLinecap="round"
        fill="none"
        className="stroke-gray-900 dark:stroke-gray-900"
      />
      <path
        d="M214 286 Q256 326 298 286"
        strokeWidth={22}
        strokeLinecap="round"
        fill="none"
        className="stroke-gray-900 dark:stroke-gray-900"
      />
    </g>
  </svg>
);

export const LogoWithText: React.FC<LogoProps> = ({ className = "", size = 32 }) => {
  const brandName = typeof process !== 'undefined' && process.env && process.env.BRAND_NAME
    ? process.env.BRAND_NAME
    : 'OpenRouter Chat';
  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <Logo size={size} />
      <span className="text-xl font-bold text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
        {brandName}
      </span>
    </div>
  );
};

export default Logo;