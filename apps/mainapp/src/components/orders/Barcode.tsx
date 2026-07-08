import { encodeCode128B } from './barcode128';

interface BarcodeProps {
  value: string;
  height?: number;
  className?: string;
}

// Renders `value` as a real, scannable Code128B barcode with the human-readable text underneath —
// the standard layout for a shipping label. Pure SVG so it survives print (unlike a canvas, which
// some browsers rasterize blank on `window.print()`).
export function Barcode({ value, height = 50, className }: BarcodeProps) {
  const { bars, totalModules } = encodeCode128B(value);
  const moduleWidth = 2;
  const width = totalModules * moduleWidth;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className={className} role="img" aria-label={`Barcode ${value}`}>
      <rect x={0} y={0} width={width} height={height} fill="white" />
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x * moduleWidth} y={0} width={bar.width * moduleWidth} height={height} fill="black" />
      ))}
    </svg>
  );
}
