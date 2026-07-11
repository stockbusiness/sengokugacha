"use client";

import { useRef, useState } from "react";

export type PolygonItem = {
  id: string;
  points: [number, number][];
  color: string;
  label: string;
};

// SVGのviewBox座標系に対応したクリック位置を返す(拡大縮小・トリミングされていても正確)。
function screenToViewBoxPoint(svg: SVGSVGElement, clientX: number, clientY: number): [number, number] {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return [0, 0];
  const transformed = point.matrixTransform(ctm.inverse());
  return [Math.round(transformed.x), Math.round(transformed.y)];
}

export function PolygonCanvas({
  imageUrl,
  viewBox,
  polygons,
  drawing,
  onAddPoint,
  onSelectPolygon,
}: {
  imageUrl: string;
  viewBox: { x: number; y: number; width: number; height: number };
  polygons: PolygonItem[];
  drawing: [number, number][];
  onAddPoint: (point: [number, number]) => void;
  onSelectPolygon?: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [imgError, setImgError] = useState(false);

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    onAddPoint(screenToViewBoxPoint(svg, e.clientX, e.clientY));
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      onClick={handleClick}
      className="w-full cursor-crosshair rounded-lg border border-zinc-700 bg-zinc-900"
      style={{ maxHeight: 520 }}
    >
      {!imgError && (
        <image
          href={imageUrl}
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          preserveAspectRatio="none"
          onError={() => setImgError(true)}
        />
      )}
      {polygons.map((p) => (
        <polygon
          key={p.id}
          points={p.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={p.color}
          fillOpacity={0.3}
          stroke={p.color}
          strokeWidth={viewBox.width / 400}
          onClick={(e) => {
            if (!onSelectPolygon) return;
            e.stopPropagation();
            onSelectPolygon(p.id);
          }}
        />
      ))}
      {drawing.length > 0 && (
        <polyline
          points={drawing.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="#facc15"
          strokeDasharray="8 6"
          strokeWidth={viewBox.width / 300}
        />
      )}
      {drawing.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={viewBox.width / 250} fill="#facc15" />
      ))}
    </svg>
  );
}

export function polygonBoundingBox(points: [number, number][], padding = 0.1) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    x: Math.round(minX - width * padding),
    y: Math.round(minY - height * padding),
    width: Math.round(width * (1 + padding * 2)),
    height: Math.round(height * (1 + padding * 2)),
  };
}
