import React from 'react';

export interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', { container: string; svg: string }> = {
  sm: {
    container: 'w-7 h-7 rounded-lg',
    svg: 'w-4 h-4',
  },
  md: {
    container: 'w-8 h-8 rounded-xl',
    svg: 'w-[18px] h-[18px]',
  },
  lg: {
    container: 'w-11 h-11 rounded-2xl',
    svg: 'w-6 h-6',
  },
};

/**
 * Geometric postal-telemetry monogram for MiSender ("Telemetría Postal de Precisión").
 */
export function BrandMark({ size = 'md', className = '' }: BrandMarkProps): React.JSX.Element {
  const dimensions = SIZE_CLASSES[size];

  return (
    <div
      role="img"
      aria-label="MiSender"
      className={`${dimensions.container} bg-[#171B26] border border-[#232938] inline-flex items-center justify-center shrink-0 shadow-sm ${className}`.trim()}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={dimensions.svg}
        aria-hidden="true"
      >
        {/* Envelope perimeter leaving top-right open for the telemetry signal beacon */}
        <path
          d="M3 8.5C3 7.395 3.895 6.5 5 6.5H13.5M21 11.5V16.5C21 17.605 20.105 18.5 19 18.5H5C3.895 18.5 3 17.605 3 16.5V8.5Z"
          stroke="#F3F5F8"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Clean postal fold meeting the outgoing vector */}
        <path
          d="M3.75 7.5L12 13.1L15.75 10.55"
          stroke="#F3F5F8"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Directional telemetry trajectory vector */}
        <path
          d="M12 13.1L16.3 8.4"
          stroke="#E85D2A"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Precision telemetry reticle arc & beacon core */}
        <path
          d="M14.75 3.75A5.25 5.25 0 0 1 20.75 9.75"
          stroke="#E85D2A"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="18" cy="6.5" r="2" fill="#E85D2A" />
      </svg>
    </div>
  );
}

export default BrandMark;
