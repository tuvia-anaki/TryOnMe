/**
 * Inline SVG provider marks for the AI provider picker.
 * Self-drawn (no external logo assets, no network requests) — simplified
 * marks in each brand's recognizable style.
 */

function OpenAIMark({ size }: { size: number }) {
  // Hexagonal knot: six elongated petals arranged in a ring.
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g fill="none" stroke="#0f0f0f" strokeWidth="4.4" strokeLinejoin="round">
        {petals.map((deg) => (
          <path
            key={deg}
            d="M24 6 L33.5 11.4 L33.5 22.5 L24 28 L14.5 22.5 L14.5 11.4 Z"
            transform={`rotate(${deg} 24 24)`}
            opacity="0.92"
          />
        ))}
      </g>
    </svg>
  );
}

function GeminiMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="tryon-gemini-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="55%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M24 3 C25.6 14.5 33.5 22.4 45 24 C33.5 25.6 25.6 33.5 24 45 C22.4 33.5 14.5 25.6 3 24 C14.5 22.4 22.4 14.5 24 3 Z"
        fill="url(#tryon-gemini-g)"
      />
    </svg>
  );
}

function VertexMark({ size }: { size: number }) {
  // Vertex AI-style spark: colored facets meeting at a point.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g>
        <path d="M24 44 L8 12 L16 12 L24 30 Z" fill="#4285F4" />
        <path d="M24 44 L40 12 L32 12 L24 30 Z" fill="#34A853" />
        <circle cx="24" cy="8" r="4" fill="#FBBC05" />
        <circle cx="8" cy="8" r="3" fill="#EA4335" />
        <circle cx="40" cy="8" r="3" fill="#4285F4" />
      </g>
    </svg>
  );
}

function FashnMark({ size }: { size: number }) {
  // Minimal clothes-hanger mark.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g fill="none" stroke="#0f0f0f" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 10 a4 4 0 1 1 4 -4" />
        <path d="M24 10 v5" />
        <path d="M24 15 L5 30 h38 Z" />
      </g>
    </svg>
  );
}

const MARKS: Record<string, (props: { size: number }) => JSX.Element> = {
  openai: OpenAIMark,
  gemini: GeminiMark,
  vertex: VertexMark,
  fashn: FashnMark,
};

export function ProviderMark({ id, size = 36 }: { id: string; size?: number }) {
  const Mark = MARKS[id];
  if (!Mark) return null;
  return <Mark size={size} />;
}

/** Providers we recommend to merchants (shown as a badge). */
export const PROVIDER_RECOMMENDED: Record<string, boolean> = {
  openai: true,
};

/** Short merchant-facing caption per provider. */
export const PROVIDER_CAPTIONS: Record<string, string> = {
  openai: "GPT Image models",
  gemini: "Gemini image models",
  vertex: "Virtual Try-On model",
  fashn: "Dedicated try-on API",
};
