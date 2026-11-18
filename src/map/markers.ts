import type { Map } from 'maplibre-gl';
import type { PointStyle } from '../model';

export function markerId(point: PointStyle) {
  return ['cy-marker', point.shape, point.color, point.stroke, point.strokeWidth / point.size].join('|');
}

export function drawMarker(
  context: CanvasRenderingContext2D,
  x: number, y: number, size: number, style: PointStyle,
) {
  const radius = size / 2;
  context.save();
  context.translate(x, y);
  context.beginPath();
  switch (style.shape) {
    case 'square': context.rect(-radius * 0.82, -radius * 0.82, radius * 1.64, radius * 1.64); break;
    case 'diamond':
      context.moveTo(0, -radius);
      context.lineTo(radius, 0);
      context.lineTo(0, radius);
      context.lineTo(-radius, 0);
      context.closePath();
      break;
    case 'triangle':
      context.moveTo(0, -radius);
      context.lineTo(radius * 0.94, radius * 0.74);
      context.lineTo(-radius * 0.94, radius * 0.74);
      context.closePath();
      break;
    default: context.arc(0, 0, radius, 0, Math.PI * 2); break;
  }
  context.fillStyle = style.color;
  context.fill();
  if (style.strokeWidth > 0) {
    context.strokeStyle = style.stroke;
    context.lineWidth = style.strokeWidth * size / style.size;
    context.lineJoin = 'round';
    context.stroke();
  }
  context.restore();
}

export function installMarkers(map: Map) {
  map.setMissingStyleImageResolver(id => {
    if (!id.startsWith('cy-marker|') || map.hasImage(id)) return;
    const [, shape, color, stroke, strokeRatio] = id.split('|');
    if (shape !== 'circle' && shape !== 'square' && shape !== 'diamond' && shape !== 'triangle') return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return;
    drawMarker(context, 64, 64, 88, {
      shape, color, stroke, size: 88, strokeWidth: Math.min(20, Math.max(0, Number(strokeRatio) * 88)),
    });
    map.addImage(id, context.getImageData(0, 0, 128, 128), { pixelRatio: 2 });
  });
}
