import React, { useId } from 'react';

interface TerriMapLogoProps {
  className?: string;
  ariaLabel?: string;
}

export const TerriMapLogo: React.FC<TerriMapLogoProps> = ({
  className = 'w-9 h-9',
  ariaLabel = 'TerriMap',
}) => {
  const gradId = useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="55%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>

      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill={`url(#${gradId})`}
        stroke="#60a5fa"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      {/* Top subtle map-block strips */}
      <rect x="11" y="9" width="16" height="5" rx="2.5" fill="#93c5fd" fillOpacity="0.22" />
      <rect x="37" y="9" width="16" height="5" rx="2.5" fill="#93c5fd" fillOpacity="0.22" />

      {/* Bottom-left block */}
      <rect x="11" y="30" width="13" height="22" rx="4" fill="#60a5fa" fillOpacity="0.3" />

      {/* Bottom-right completed block */}
      <rect x="40" y="30" width="13" height="22" rx="4" fill="#10b981" fillOpacity="0.92" />
      <path
        d="M43.4 41.2 L45.6 43.4 L49.8 38.8"
        stroke="#ffffff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Intersecting street lines forming the "T" */}
      <rect x="11" y="18" width="42" height="8" rx="4" fill="#ffffff" />
      <rect x="28" y="18" width="8" height="35" rx="4" fill="#ffffff" />

      {/* Amber GPS pin marker at the T-intersection */}
      <circle cx="32" cy="22" r="8.5" fill="#f59e0b" fillOpacity="0.28" />
      <circle cx="32" cy="22" r="6" fill="#f59e0b" stroke="#1e3a8a" strokeWidth="2" />
      <circle cx="32" cy="22" r="2.2" fill="#fffbeb" />
    </svg>
  );
};
