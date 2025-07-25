import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import * as satellite from "satellite.js";
import L from "leaflet";
import "./App.css";

function splitAtAntimeridian(points) {
  const segments = [];
  let currentSegment = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    
    if (currentSegment.length > 0) {
      const prevLon = currentSegment[currentSegment.length - 1][1];
      const lonDiff = Math.abs(point[1] - prevLon);
      
      if (lonDiff > 180) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
    
    currentSegment.push(point);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

function App() {
  const [issData, setIssData] = useState({
    latitude: 0,
    longitude: 0,
    altitude: 0,
    velocity: 0,
  });
  const [astronauts, setAstronauts] = useState([]);

  
  useEffect(() => {
    const fetchIssData = async () => {
      try {
        const res = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        setIssData({
          latitude: Number(data.latitude.toFixed(4)),
          longitude: Number(data.longitude.toFixed(4)),
          altitude: Number(data.altitude.toFixed(1)),
          velocity: Number(data.velocity.toFixed(1)),
        });
      } catch (error) {
        console.error("Failed to fetch ISS data", error);
      }
    };

    fetchIssData();
    const interval = setInterval(fetchIssData, 5000);

    return () => clearInterval(interval);
  }, []);

  
  const ISSOrbit = useCallback(() => {
    const [orbitSegments, setOrbitSegments] = useState([]);

    useEffect(() => {
      let isMounted = true;
      
      async function getOrbit() {
        try {
          const res = await fetch(
            "https://api.wheretheiss.at/v1/satellites/25544/tles?format=text"
          );
          if (!res.ok) throw new Error("Network response was not ok");
          
          const tleText = await res.text();
          const tleLines = tleText.split('\n');
          
          if (tleLines.length < 3) throw new Error("Invalid TLE data");

          const satrec = satellite.twoline2satrec(tleLines[1], tleLines[2]);
          const now = new Date();
          const points = [];

          for (let i = 0; i <= 5400; i += 30) {
            const time = new Date(now.getTime() + i * 1000);
            const positionAndVelocity = satellite.propagate(satrec, time);

            if (positionAndVelocity.position) {
              const gmst = satellite.gstime(time);
              const geodeticCoords = satellite.eciToGeodetic(
                positionAndVelocity.position,
                gmst
              );

              const lat = satellite.degreesLat(geodeticCoords.latitude);
              const lon = satellite.degreesLong(geodeticCoords.longitude);

              if (!isNaN(lat) && !isNaN(lon)) {
                points.push([lat, lon]);
              }
            }
          }

          if (isMounted) {
            setOrbitSegments(splitAtAntimeridian(points));
          }
        } catch (error) {
          console.error("Failed to load ISS orbit:", error);
        }
      }

      getOrbit();

      return () => {
        isMounted = false;
      };
    }, []);

    if (orbitSegments.length === 0) return null;

    return (
      <>
        {orbitSegments.map((segment, idx) => (
          <Polyline
            key={idx}
            positions={segment}
            pathOptions={{ color: "blue", weight: 2, dashArray: "8 8" }}
          />
        ))}
      </>
    );
  }, []);

  
  const issIcon = useMemo(() => {
    return new L.Icon({
      iconUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d0/International_Space_Station.svg",
      iconSize: [50, 32],
      iconAnchor: [25, 16],
      popupAnchor: [0, -16],
      className: "iss-icon",
    });
  }, []);

  const horizonRadius = useMemo(() => {
    const earthRadiusKm = 6371;
    const h = issData.altitude;
    const d = Math.sqrt(2 * earthRadiusKm * h + h * h);
    return d * 1000;
  }, [issData.altitude]);

  /*useEffect(() => {
    async function getAstronauts() {
      let res = await fetch("http://api.open-notify.org/astros.json");
      let json = await res.json();
      setAstronauts(json);
    }
    getAstronauts();
  },[])*/

  return (
    <div className="app-container">
      <div className="map-wrapper">
        <MapContainer
          center={[20, 15]}
          zoom={2.5}
          zoomControl={false}
          doubleClickZoom={false}
          keyboard={false}
          minZoom={2}
          maxZoom={4}
          maxBounds={[[-90, -180], [90, 180]]}
          maxBoundsViscosity={1.0}
          style={{backgroundColor: "#aad3df"}}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            noWrap={true}
            bounds={[[-85, -180], [85, 180]]}
          />
          <Marker position={[issData.latitude, issData.longitude]} icon={issIcon} />
          <Circle
            center={[issData.latitude, issData.longitude]}
            radius={horizonRadius}
            pathOptions={{ color: "blue", fillColor: "blue", fillOpacity: 0.1 }}
          />
          <Circle
            center={[issData.latitude, issData.longitude]}
            radius={horizonRadius*0.6}
            pathOptions={{ color: "aqua" }}
          />
          <ISSOrbit />
        </MapContainer>
      </div>
      <div className="panels">
        <div className="info-panel">
          <div>Latitude: <span>{issData.latitude}°</span></div>
          <div>Longitude: <span>{issData.longitude}°</span></div>
          <div>Altitude: <span>{issData.altitude} km</span></div>
          <div>Velocity: <span>{issData.velocity} km/h</span></div>
        </div>
        {/*<div className="info-panel">
          Current people on ISS:
          {astronauts?.people
            ?.filter(person => person.craft === "ISS")
            .map(person => (
              <div key={person.name}>&emsp;- {person.name}</div>
            ))}
        </div>*/}
      </div>
    </div>
  );
}

export default App;