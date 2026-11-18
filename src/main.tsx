import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/700.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/700.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { App } from './App';

setWorkerUrl(mapWorkerUrl);

createRoot(document.getElementById('root')!).render(<App />);
