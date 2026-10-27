import React from 'react';

interface LeafLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const LeafLogo: React.FC<LeafLogoProps> = ({
  size = 28,
  className = '',
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-primary flex-shrink-0"
        aria-hidden="true"
      >
        <path
          d="M17.5 2C17.5 2 11 3.5 7.5 7.5C4 11.5 3 17 3 21C7 21 12.5 20 16.5 16.5C20.5 13 22 6.5 22 6.5C22 6.5 17 7 13 11C9 15 8 18 8 18"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 21L8 16"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      {showText && (
        <span className="font-bold text-lg tracking-tight text-text-main">
          Agri<span className="text-primary font-black">Rover</span>
        </span>
      )}
    </div>
  );
};
