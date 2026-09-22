# Advanced Patterns

## Contents

- Controlled vs uncontrolled maps
- Real-time drag synchronization
- User-drawn geometry
- Synchronized maps
- Marker clustering
- Heatmaps
- Fit bounds
- Custom overlays
- 3D maps
- Error boundaries
- Next.js considerations

## Controlled vs Uncontrolled Maps

### Uncontrolled (Default)

Map manages its own viewport. Use `default*` props for initial values:

```tsx
<Map
  defaultCenter={{ lat: 40.7128, lng: -74.006 }}
  defaultZoom={12}
  defaultMapTypeId="roadmap"
/>
```

User can freely pan/zoom. React doesn't track viewport changes.

### Controlled

React controls the viewport. Map always syncs to props:

```tsx
function ControlledMap() {
  const [camera, setCamera] = useState({
    center: { lat: 40.7128, lng: -74.006 },
    zoom: 12,
  });

  return (
    <Map
      center={camera.center}
      zoom={camera.zoom}
      onCameraChanged={(e) => setCamera(e.detail)}
    />
  );
}
```

### Hybrid: Track without Lock

Track viewport in state but don't force it:

```tsx
function TrackedMap() {
  const [viewport, setViewport] = useState({
    center: { lat: 40.7128, lng: -74.006 },
    zoom: 12,
  });

  return (
    <>
      <Map
        defaultCenter={viewport.center}
        defaultZoom={viewport.zoom}
        onCameraChanged={(e) => setViewport(e.detail)}
      />
      <p>Current zoom: {viewport.zoom}</p>
    </>
  );
}
```

---

## Real-Time Drag Synchronization

The key to making shapes follow markers during drag is using `onDrag` (not just `onDragEnd`):

### Single Shape Following Marker

```tsx
function MarkerWithCircle() {
  const [position, setPosition] = useState({ lat: 40.7128, lng: -74.006 });

  return (
    <>
      <AdvancedMarker
        position={position}
        draggable
        onDrag={(e) => {
          // This fires continuously during drag
          if (e.latLng) {
            setPosition({
              lat: e.latLng.lat(),
              lng: e.latLng.lng(),
            });
          }
        }}
      />
      <Circle
        center={position}
        radius={500}
        strokeColor="#4285F4"
        fillColor="#4285F4"
        fillOpacity={0.2}
      />
    </>
  );
}
```

### Multiple Dependent Shapes

```tsx
function MarkerWithDependentShapes() {
  const [center, setCenter] = useState({ lat: 40.7128, lng: -74.006 });

  // Derived positions for polygon vertices
  const polygonPath = useMemo(() => {
    const d = 0.005; // offset in degrees
    return [
      { lat: center.lat + d, lng: center.lng },
      { lat: center.lat, lng: center.lng + d },
      { lat: center.lat - d, lng: center.lng },
      { lat: center.lat, lng: center.lng - d },
    ];
  }, [center]);

  // Polyline from center to a fixed point
  const polylinePath = useMemo(() => [
    center,
    { lat: 40.72, lng: -73.99 }, // fixed endpoint
  ], [center]);

  return (
    <>
      <AdvancedMarker
        position={center}
        draggable
        onDrag={(e) => {
          if (e.latLng) {
            setCenter({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          }
        }}
      />
      <Circle center={center} radius={200} fillColor="#FF0000" fillOpacity={0.3} />
      <Polygon paths={polygonPath} fillColor="#00FF00" fillOpacity={0.3} />
      <Polyline path={polylinePath} strokeColor="#0000FF" strokeWeight={2} />
    </>
  );
}
```

### Performance: Throttled Updates

For complex shapes, throttle updates:

```tsx
import { useCallback, useRef } from 'react';

function useThrottledDrag(callback: (pos: google.maps.LatLngLiteral) => void, delay = 16) {
  const lastCall = useRef(0);
  
  return useCallback((e: google.maps.MapMouseEvent) => {
    const now = Date.now();
    if (now - lastCall.current >= delay && e.latLng) {
      lastCall.current = now;
      callback({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, [callback, delay]);
}

// Usage
function OptimizedDrag() {
  const [position, setPosition] = useState({ lat: 40.7128, lng: -74.006 });
  const handleDrag = useThrottledDrag(setPosition, 32); // ~30fps

  return (
    <AdvancedMarker position={position} draggable onDrag={handleDrag} />
  );
}
```

---

## User-drawn geometry

The former Maps JavaScript drawing library is unavailable in current releases. For editable user-drawn shapes, verify Google’s current deprecation guidance and use a supported integration such as Terra Draw rather than restoring retired Maps JS drawing code.

Primary source: https://developers.google.com/maps/deprecations

---

## Synchronized Maps

Keep multiple maps in sync:

```tsx
function SyncedMaps() {
  const [camera, setCamera] = useState({
    center: { lat: 40.7128, lng: -74.006 },
    zoom: 12,
  });

  return (
    <div className="grid grid-cols-2 gap-4">
      <Map
        id="map-1"
        center={camera.center}
        zoom={camera.zoom}
        onCameraChanged={(e) => setCamera(e.detail)}
        mapId="MAP_ID_1"
      >
        <AdvancedMarker position={camera.center} />
      </Map>
      
      <Map
        id="map-2"
        center={camera.center}
        zoom={camera.zoom}
        onCameraChanged={(e) => setCamera(e.detail)}
        mapTypeId="satellite"
        mapId="MAP_ID_2"
      />
    </div>
  );
}
```

---

## Marker Clustering

Use `@googlemaps/markerclusterer`:

```bash
npm install @googlemaps/markerclusterer
```

```tsx
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useMap, AdvancedMarker } from '@vis.gl/react-google-maps';

function ClusteredMarkers({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  const [markers, setMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);
  const clusterer = useRef<MarkerClusterer | null>(null);

  // Initialize clusterer
  useEffect(() => {
    if (!map) return;
    
    clusterer.current = new MarkerClusterer({ map });
    
    return () => {
      clusterer.current?.clearMarkers();
    };
  }, [map]);

  // Update markers in clusterer
  useEffect(() => {
    if (!clusterer.current) return;
    
    clusterer.current.clearMarkers();
    clusterer.current.addMarkers(markers);
  }, [markers]);

  // Collect marker refs
  const setMarkerRef = useCallback((marker: google.maps.marker.AdvancedMarkerElement | null, key: string) => {
    setMarkers((prev) => {
      if (marker) {
        return [...prev.filter((m) => m.title !== key), marker];
      }
      return prev.filter((m) => m.title !== key);
    });
  }, []);

  return (
    <>
      {points.map((point, i) => (
        <AdvancedMarker
          key={i}
          position={point}
          title={`marker-${i}`}
          ref={(marker) => setMarkerRef(marker, `marker-${i}`)}
        />
      ))}
    </>
  );
}
```

---

## Heatmaps

The former Maps JavaScript heatmap implementation is unavailable in current releases. Use a supported third-party integration such as deck.gl when a heatmap is required, and verify the current Google deprecation guidance before implementation.

Primary source: https://developers.google.com/maps/deprecations

---

## Fit Bounds to Markers

```tsx
function useFitBounds(positions: google.maps.LatLngLiteral[], padding = 50) {
  const map = useMap();

  useEffect(() => {
    if (!map || positions.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    positions.forEach((pos) => bounds.extend(pos));
    
    map.fitBounds(bounds, padding);
  }, [map, positions, padding]);
}

// Usage
function MapWithMarkers({ markers }: { markers: google.maps.LatLngLiteral[] }) {
  useFitBounds(markers);

  return (
    <>
      {markers.map((pos, i) => (
        <AdvancedMarker key={i} position={pos} />
      ))}
    </>
  );
}
```

---

## Custom Overlay (Advanced)

For completely custom rendering:

```tsx
import { useMap } from '@vis.gl/react-google-maps';
import { createPortal } from 'react-dom';

function useCustomOverlay(position: google.maps.LatLngLiteral) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map) return;

    class CustomOverlay extends google.maps.OverlayView {
      private div: HTMLDivElement | null = null;
      private position: google.maps.LatLng;

      constructor(position: google.maps.LatLngLiteral) {
        super();
        this.position = new google.maps.LatLng(position.lat, position.lng);
      }

      onAdd() {
        this.div = document.createElement('div');
        this.div.style.position = 'absolute';
        const panes = this.getPanes();
        panes?.overlayMouseTarget.appendChild(this.div);
        setContainer(this.div);
      }

      draw() {
        if (!this.div) return;
        const projection = this.getProjection();
        const point = projection.fromLatLngToDivPixel(this.position);
        if (point) {
          this.div.style.left = `${point.x}px`;
          this.div.style.top = `${point.y}px`;
        }
      }

      onRemove() {
        this.div?.remove();
        setContainer(null);
      }
    }

    const overlay = new CustomOverlay(position);
    overlay.setMap(map);

    return () => overlay.setMap(null);
  }, [map, position]);

  return container;
}

// Usage
function CustomMarker({ position, children }: { position: google.maps.LatLngLiteral; children: React.ReactNode }) {
  const container = useCustomOverlay(position);
  
  if (!container) return null;
  
  return createPortal(children, container);
}
```

---

## 3D Maps (Experimental)

```tsx
function Map3D() {
  useMapsLibrary('maps3d');

  return (
    <gmp-map-3d
      center="40.7128,-74.006"
      range="1000"
      heading="0"
      tilt="60"
      mode="SATELLITE"
      style={{ width: '100%', height: '400px' }}
    />
  );
}
```

Requires `@types/google.maps` and proper API configuration.

---

## Error Boundaries

Wrap map components to handle errors gracefully:

```tsx
import { ErrorBoundary } from 'react-error-boundary';

function MapErrorFallback({ error }: { error: Error }) {
  return (
    <div className="p-4 bg-red-100 text-red-700">
      <h3>Map failed to load</h3>
      <p>{error.message}</p>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={MapErrorFallback}>
      <APIProvider apiKey={API_KEY}>
        <Map {...props} />
      </APIProvider>
    </ErrorBoundary>
  );
}
```

---

## Next.js Considerations

### Client Component

Maps must be client components:

```tsx
'use client';

import { APIProvider, Map } from '@vis.gl/react-google-maps';

export function MapComponent() {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <Map {...props} />
    </APIProvider>
  );
}
```

### Dynamic Import (Avoid SSR Issues)

```tsx
import dynamic from 'next/dynamic';

const MapComponent = dynamic(
  () => import('@/components/map').then((mod) => mod.MapComponent),
  { ssr: false, loading: () => <div>Loading map...</div> }
);
```

### Environment Variables

Use `NEXT_PUBLIC_` prefix for client-side access:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=your_map_id
```
