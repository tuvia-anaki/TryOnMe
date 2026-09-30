import { useId } from "preact/hooks";

/**
 * Tiny pictures of a collection grid for each "what gets its own card" choice:
 * one card per color, per variant, per value of another option, or one per product.
 */

export type SplitKind = "color" | "variant" | "option" | "none";

const TEE = "M8 3L4 5L2 9l3 1.5L6 9v12h12V9l1 1.5L22 9l-2-4-4-2c-1 2-7 2-8 0z";

function Card(props: { x: number; w: number; fill: string; label?: string; dots?: string[] }) {
  const { x, w } = props;
  const size = Math.min(w - 10, 26);
  const scale = size / 24;
  const tx = x + (w - size) / 2;
  return (
    <g>
      <rect x={x} y={3} width={w} height={54} rx={6} fill="#fff" stroke="#e1e1e1" />
      <path d={TEE} transform={`translate(${tx} 9) scale(${scale})`} fill={props.fill} stroke="rgba(0,0,0,.18)" stroke-width={0.8 / scale} />
      {props.label ? (
        <text x={x + w / 2} y={50} text-anchor="middle" font-size="8" font-weight="600" fill="#616161">
          {props.label}
        </text>
      ) : props.dots ? (
        props.dots.map((color, i) => <circle key={color} cx={x + w / 2 + (i - (props.dots!.length - 1) / 2) * 7} cy={47} r={2.6} fill={color} />)
      ) : (
        <rect x={x + 6} y={44} width={w - 12} height={4} rx={2} fill="#e3e3e3" />
      )}
    </g>
  );
}

export function SplitVisual({ kind }: { kind: SplitKind }) {
  const id = useId();
  const stripes = `${id}-stripes`;
  const dots = `${id}-dots`;
  return (
    <svg viewBox="0 0 132 60" class="vc-split-visual">
      <defs>
        <pattern id={stripes} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="#2b3a55" />
          <rect width="4" height="1.6" fill="#c9d3e6" />
        </pattern>
        <pattern id={dots} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#2b3a55" />
          <circle cx="2.5" cy="2.5" r="1" fill="#c9d3e6" />
        </pattern>
      </defs>
      {kind === "color" && (
        <>
          <Card x={4} w={36} fill="#d0312d" />
          <Card x={48} w={36} fill="#2f6fdf" />
          <Card x={92} w={36} fill="#2e8b57" />
        </>
      )}
      {kind === "variant" && (
        <>
          <Card x={4} w={28} fill="#d0312d" label="S" />
          <Card x={36} w={28} fill="#d0312d" label="M" />
          <Card x={68} w={28} fill="#2f6fdf" label="S" />
          <Card x={100} w={28} fill="#2f6fdf" label="M" />
        </>
      )}
      {kind === "option" && (
        <>
          <Card x={4} w={36} fill="#2b3a55" />
          <Card x={48} w={36} fill={`url(#${stripes})`} />
          <Card x={92} w={36} fill={`url(#${dots})`} />
        </>
      )}
      {kind === "none" && <Card x={44} w={44} fill="#d0312d" dots={["#d0312d", "#2f6fdf", "#2e8b57"]} />}
    </svg>
  );
}
