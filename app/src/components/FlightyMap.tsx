import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Types
interface FlightData {
  id: string;
  callsign: string;
  origin: string;
  destination: string;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  heading: number;
  aircraftType: string;
  status: string;
  path?: Array<{ lat: number; lng: number }>;
}

interface FlightyMapProps {
  flights: FlightData[];
  selectedFlightId?: string | null;
  onFlightSelect?: (flightId: string | null) => void;
}

const FlightyMap: React.FC<FlightyMapProps> = ({
  flights,
  selectedFlightId = null,
  onFlightSelect
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [viewport, setViewport] = useState({
    latitude: 39.8283,
    longitude: -98.5795,
    zoom: 3
  });

  useEffect(() => {
    // Initialize map if not already done
    if (!mapRef.current) {
      const map = new mapboxgl.Map({
        accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
        container: 'map-container',
        style: 'mapbox://styles/mapbox/light-v10',
        center: [viewport.longitude, viewport.latitude],
        zoom: viewport.zoom
      });

      mapRef.current = map;

      // Load custom layers when map is ready
      map.on('load', () => {
        setMapLoaded(true);
        
        // Add flight paths layer
        if (!map.getLayer('flight-paths')) {
          map.addLayer({
            id: 'flight-paths',
            type: 'line',
            source: {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: []
              }
            },
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#FF6B6B',
              'line-width': 2,
              'line-opacity': 0.7
            }
          });
        }
        
        // Add aircraft markers layer
        if (!map.getLayer('aircraft-markers')) {
          map.addLayer({
            id: 'aircraft-markers',
            type: 'circle',
            source: {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: []
              }
            },
            paint: {
              'circle-radius': 8,
              'circle-color': [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                '#4ECDC4',
                '#FF6B6B'
              ],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
              'circle-opacity': 0.9
            }
          });
        }
        
        // Add aircraft labels layer
        if (!map.getLayer('aircraft-labels')) {
          map.addLayer({
            id: 'aircraft-labels',
            type: 'symbol',
            source: {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: []
              }
            },
            layout: {
              'text-field': ['get', 'callsign'],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 12,
              'text-offset': [0, 1.5],
              'text-anchor': 'top'
            },
            paint: {
              'text-color': '#FFFFFF',
              'text-halo-color': '#000000',
              'text-halo-width': 2
            }
          });
        }
      });

      // Handle map clicks to select flights
      map.on('click', 'aircraft-markers', (e) => {
        const features = e.features;
        if (features.length > 0) {
          const flightId = features[0].properties.id;
          if (onFlightSelect) {
            onFlightSelect(flightId);
          }
          // Update selected state
          map.getSource('aircraft-markers')?.setData(features[0]);
        }
      });

      map.on('click', (e) => {
        // Clicking on map background deselects flight
        const features = map.queryRenderedFeatures(e.point, {
          layers: ['aircraft-markers']
        });
        if (features.length === 0 && onFlightSelect) {
          onFlightSelect(null);
        }
      });
    }

    // Update map viewport if changed externally
    if (mapRef.current && !mapLoaded) {
      mapRef.current.jumpTo({
        center: [viewport.longitude, viewport.latitude],
        zoom: viewport.zoom
      });
    }

    // Update flight data on map
    if (mapRef.current && mapLoaded) {
      updateFlightData(flights, selectedFlightId);
    }

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [flights, selectedFlightId, onFlightSelect, mapLoaded, viewport]);

  const updateFlightData = (flights: FlightData[], selectedFlightId: string | null) => {
    if (!mapRef.current) return;

    // Create GeoJSON features for flights
    const features = flights.map(flight => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point',
        coordinates: [flight.longitude, flight.latitude]
      } as const,
      properties: {
        id: flight.id,
        callsign: flight.callsign,
        origin: flight.origin,
        destination: flight.destination,
        altitude: flight.altitude,
        speed: flight.speed,
        heading: flight.heading,
        aircraftType: flight.aircraftType,
        status: flight.status,
        selected: flight.id === selectedFlightId
      }
    }));

    // Update aircraft markers source
    mapRef.current.getSource('aircraft-markers')?.setData({
      type: 'FeatureCollection',
      features
    });

    // Update aircraft labels source (same data)
    mapRef.current.getSource('aircraft-labels')?.setData({
      type: 'FeatureCollection',
      features
    });

    // Update flight paths if available
    const pathFeatures = flights
      .filter(flight => flight.path && flight.path.length > 1)
      .map(flight => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString',
          coordinates: flight.path!.map(point => [point.lng, point.lat])
        } as const,
        properties: {
          id: flight.id,
          callsign: flight.callsign
        }
      }));

    mapRef.current.getSource('flight-paths')?.setData({
      type: 'FeatureCollection',
      features: pathFeatures
    });
  };

  // Reset view button handler
  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.jumpTo({
        center: [viewport.longitude, viewport.latitude],
        zoom: viewport.zoom
      });
    }
  };

  // Follow selected flight handler
  const handleFollowFlight = () => {
    if (!selectedFlightId || !mapRef.current) return;
    
    const selectedFlight = flights.find(f => f.id === selectedFlightId);
    if (selectedFlight) {
      mapRef.current.easeTo({
        center: [selectedFlight.longitude, selectedFlight.latitude],
        zoom: 8,
        duration: 1000
      });
    }
  };

  if (!mapLoaded) {
    return <div className="w-full h-[600px]">Loading map...</div>;
  }

  return (
    <div className="relative w-full h-[600px]">
      <div id="map-container" className="w-full h-full" />
      
      {/* Map controls */}
      <div className="absolute top-4 left-4 flex space-x-2 z-10">
        <button
          onClick={handleResetView}
          className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-md px-3 py-2 text-sm font-medium hover:bg-white/90 transition-colors shadow-sm"
        >
          Reset View
        </button>
        {selectedFlightId && (
          <button
            onClick={handleFollowFlight}
            className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-md px-3 py-2 text-sm font-medium hover:bg-white/90 transition-colors shadow-sm"
          >
            Follow Flight
          </button>
        )}
      </div>
      
      {/* Flight info panel */}
      {selectedFlightId && (
        <div className="absolute bottom-4 left-4 right-4 max-w-md mx-auto bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg p-4 shadow-lg z-10">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{selectedFlightId}</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Callsign</p>
                <p className="font-medium">{flights.find(f => f.id === selectedFlightId)?.callsign || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500">Route</p>
                <p className="font-medium">
                  {flights.find(f => f.id === selectedFlightId)?.origin} → 
                  {flights.find(f => f.id === selectedFlightId)?.destination}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Altitude</p>
                <p className="font-medium">
                  {flights.find(f => f.id === selectedFlightId)?.altitude?.toLocaleString()} ft
                </p>
              </div>
              <div>
                <p className="text-gray-500">Speed</p>
                <p className="font-medium">
                  {flights.find(f => f.id === selectedFlightId)?.speed?.toLocaleString()} knots
                </p>
              </div>
              <div>
                <p className="text-gray-500">Aircraft</p>
                <p className="font-medium">
                  {flights.find(f => f.id === selectedFlightId)?.aircraftType || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <p className={`font-medium ${flights.find(f => f.id === selectedFlightId)?.status === 'active' ? 'text-green-600' : 'text-gray-600'}`}>
                  {flights.find(f => f.id === selectedFlightId)?.status || 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlightyMap;