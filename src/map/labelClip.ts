import type { Position } from 'geojson';
import type { Collection } from '../model';

export type ClipPolygons = Position[][][];
type ScreenPoint = { x: number; y: number };

function signedArea<T>(ring: T[], coordinates: (point: T) => [number, number]) {
  const [originX, originY] = coordinates(ring[0]);
  let area = 0;
  for (let index = 0; index < ring.length; index++) {
    const [x, y] = coordinates(ring[index]);
    const [nextX, nextY] = coordinates(ring[(index + 1) % ring.length]);
    area += (x - originX) * (nextY - originY) - (nextX - originX) * (y - originY);
  }
  return area;
}

function orient(ring: Position[], outer: boolean) {
  const area = signedArea(ring, ([x, y]) => [x, y]);
  return (area > 0) === outer ? ring : [...ring].reverse();
}

export function clipPolygons(boundary: Collection): ClipPolygons {
  return boundary.features.flatMap(({ geometry }) => {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    return polygons.filter(polygon => polygon[0]?.length >= 3).map(polygon => [
      orient(polygon[0], true),
      ...polygon.slice(1).filter(ring => ring.length >= 3).map(ring => orient(ring, false)),
    ]);
  });
}

const pixel = (value: number) => Number(value.toFixed(2));
const xy = (x: number, y: number) => `${pixel(x)} ${pixel(y)}`;

function borderStrip(from: ScreenPoint, to: ScreenPoint, radius: number, clockwise: boolean) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.05) return '';
  const offset = (clockwise ? -radius : radius) / length;
  const nx = -dy * offset, ny = dx * offset;
  const arc = `A${radius} ${radius} 0 0 ${clockwise ? 1 : 0} `;
  return `M${xy(from.x + nx, from.y + ny)} L${xy(to.x + nx, to.y + ny)} ${arc}${xy(to.x - nx, to.y - ny)} L${xy(from.x - nx, from.y - ny)} ${arc}${xy(from.x + nx, from.y + ny)} Z`;
}

/** The rounded strips use the exterior winding, so the clip includes the district and a margin along each boundary. */
export function labelClipPath(polygons: ClipPolygons, project: (point: [number, number]) => ScreenPoint, padding = 0): string {
  const commands: string[] = [];
  for (const polygon of polygons) {
    const rings = polygon.map(ring => ring.map(([lon, lat]) => project([lon, lat])));
    const clockwise = padding > 0 && signedArea(rings[0], ({ x, y }) => [x, y]) > 0;
    for (const ring of rings) {
      for (let index = 0; index < ring.length; index++) {
        const { x, y } = ring[index];
        commands.push(`${index === 0 ? 'M' : 'L'}${xy(x, y)}`);
      }
      commands.push('Z');
      if (padding > 0) {
        for (let index = 0; index < ring.length; index++) {
          const strip = borderStrip(ring[index], ring[(index + 1) % ring.length], padding, clockwise);
          if (strip) commands.push(strip);
        }
      }
    }
  }
  return commands.join(' ');
}
