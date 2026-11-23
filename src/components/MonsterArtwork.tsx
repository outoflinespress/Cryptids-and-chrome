import { useState } from 'react';
import { RiderDef } from '../game/types';

interface MonsterArtworkProps {
  rider: RiderDef;
  className?: string;
  locked?: boolean;
}

/**
 * Renders the authentic coloring-book card illustration cropped cleanly
 * from the uploaded Out of Lines Press Free Pack & Pool Card sheets,
 * with a crisp styled SVG fallback if an image fails to load.
 */
export function MonsterArtwork({ rider, className = '', locked = false }: MonsterArtworkProps) {
  const [errored, setErrored] = useState(false);
  const { sheet, sheetW, sheetH, x, y, w, h } = rider.art;

  if (errored) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#141720] text-[#f4efe6] p-3 text-center ${className}`}
      >
        <span
          className="font-display text-2xl tracking-wide uppercase"
          style={{ color: rider.accentColor }}
        >
          {rider.name}
        </span>
        <span className="text-xs text-[#9aa3b2] mt-1">{rider.poolNumber}</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#f4efe6] ${className}`}>
      <svg
        viewBox={`${x} ${y} ${w} ${h}`}
        preserveAspectRatio="xMidYMid slice"
        className={`w-full h-full block transition-transform duration-200 ${
          locked ? 'grayscale contrast-125 brightness-50' : 'contrast-110'
        }`}
        role="img"
        aria-label={`${rider.name} coloring book illustration`}
      >
        <image
          href={sheet}
          width={sheetW}
          height={sheetH}
          onError={() => setErrored(true)}
        />
      </svg>
      {locked && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0e18]/65 px-2 text-center"
        >
          <span className="font-mono text-[11px] font-bold tracking-wider text-[#ff7a29]">
            CAPTIVE IN TRUCK
          </span>
        </div>
      )}
    </div>
  );
}
