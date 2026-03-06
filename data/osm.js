// OpenStreetMap Position Drift functionality
// Extracted and adapted from SignalK UM982 plugin

// OpenLayers map variables
let map = null;
let positionMarker = null;
let currentPosition = [-0.0005, 51.4769]; // Default: Greenwich, London, UK [lon, lat]
let positionTrail = []; // Array to store position history
let trailLayer = null; // Layer for trail dots
let scaleLineControl = null; // ScaleLine control reference
let headingArrow = null; // Feature for heading arrow
let currentHeading = null; // Current heading in radians
let headingTrue = null; // True heading in degrees
let positionType = null; // RTK position type string
const maxTrailPoints = 200;
const maxTrailAge = 5 * 60 * 1000; // 5 minutes in milliseconds

// Position Type color mapping
const positionTypeColors = {
  NARROW_INT: "#8B2DF7", // brighter blue
  WIDE_INT: "#2D37F7", // brighter mid blue
  L1_INT: "#2D95F7", // brighter light blue
  NARROW_FLOAT: "#E6AE08", // brighter orange
  L1_FLOAT: "#E23809", // brighter light orange
  RTK_FIXED: "#8B2DF7", // Same as NARROW_INT
  RTK_FLOAT: "#E6AE08", // Same as NARROW_FLOAT
  DGPS: "#2D95F7", // Same as L1_INT
  AUTONOMOUS: "#666666", // Grey for autonomous
};

function getPositionTypeColor(posType) {
  return positionTypeColors[posType] || "#666666"; // default grey
}

// Initialize OpenLayers map
function initializeMap() {
  // Create the map
  map = new ol.Map({
    target: "position-drift-map",
    layers: [
      new ol.layer.Tile({
        source: new ol.source.OSM(),
      }),
    ],
    view: new ol.View({
      center: ol.proj.fromLonLat(currentPosition), // [lon, lat]
      zoom: 19,
    }),
  });

  // Add scale control
  scaleLineControl = new ol.control.ScaleLine({
    units: "metric",
    bar: true,
    steps: 2,
    minWidth: 80,
  });
  map.addControl(scaleLineControl);

  // Remove default zoom control since we have custom buttons
  map.getControls().forEach((control) => {
    if (control instanceof ol.control.Zoom) {
      map.removeControl(control);
    }
  });

  // Create trail layer for position history
  const trailSource = new ol.source.Vector();
  trailLayer = new ol.layer.Vector({
    source: trailSource,
  });
  map.addLayer(trailLayer);

  // Create position marker
  const positionFeature = new ol.Feature({
    geometry: new ol.geom.Point(ol.proj.fromLonLat(currentPosition)),
  });

  const positionStyle = new ol.style.Style({
    image: new ol.style.Circle({
      radius: 6,
      fill: new ol.style.Fill({
        color: "#ff0000", // Will be updated dynamically based on position type
      }),
    }),
  });

  positionFeature.setStyle(positionStyle);

  const vectorSource = new ol.source.Vector({
    features: [positionFeature],
  });

  // Create heading arrow
  const arrowCoord = ol.proj.fromLonLat(currentPosition);
  const headingLine = new ol.geom.LineString([arrowCoord, arrowCoord]);

  headingArrow = new ol.Feature({
    geometry: headingLine,
  });

  const arrowStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: "#0000ff",
      width: 3,
    }),
  });

  headingArrow.setStyle(arrowStyle);
  vectorSource.addFeature(headingArrow);

  const vectorLayer = new ol.layer.Vector({
    source: vectorSource,
  });

  map.addLayer(vectorLayer);
  positionMarker = positionFeature;
}

function updateMapPosition(lat, lon) {
  if (!map || !positionMarker || !trailLayer) {
    return;
  }

  const newPosition = [lon, lat]; // OpenLayers expects [lon, lat]
  const newCoord = ol.proj.fromLonLat(newPosition);
  const timestamp = Date.now();

  // Add current position to trail history with position type color
  positionTrail.push({
    coordinates: newCoord,
    timestamp: timestamp,
    positionType: positionType,
    color: getPositionTypeColor(positionType),
  });

  // Clean up old trail points
  const cutoffTime = timestamp - maxTrailAge;
  positionTrail = positionTrail.filter(
    (point) => point.timestamp > cutoffTime
  );

  // Keep only the most recent points if we exceed maxTrailPoints
  if (positionTrail.length > maxTrailPoints) {
    positionTrail = positionTrail.slice(-maxTrailPoints);
  }

  // Update trail layer
  updateTrailLayer();

  // Update marker position
  positionMarker.getGeometry().setCoordinates(newCoord);

  // Center map on new position
  map.getView().setCenter(newCoord);

  // Store current position
  currentPosition = newPosition;

  // Update heading arrow with new position
  updateHeadingArrow();

  // Update position marker color based on current position type
  updatePositionMarkerColor();
}

function updatePositionMarkerColor() {
  if (!positionMarker) {
    return;
  }

  const color = getPositionTypeColor(positionType);

  // Update the fill color of the position marker
  const newStyle = new ol.style.Style({
    image: new ol.style.Circle({
      radius: 6,
      fill: new ol.style.Fill({
        color: color,
      }),
    }),
  });

  positionMarker.setStyle(newStyle);
}

function updateTrailLayer() {
  if (!trailLayer || positionTrail.length === 0) {
    return;
  }

  const trailSource = trailLayer.getSource();
  trailSource.clear();

  const now = Date.now();
  const oldestTime = Math.min(...positionTrail.map((p) => p.timestamp));
  const timeRange = now - oldestTime;

  positionTrail.forEach((point, index) => {
    // Calculate age-based opacity (newer = more opaque)
    const age = now - point.timestamp;
    const ageRatio = timeRange > 0 ? age / timeRange : 0;
    const opacity = Math.max(0.1, 1 - ageRatio);

    // Create trail dot feature
    const trailFeature = new ol.Feature({
      geometry: new ol.geom.Point(point.coordinates),
    });

    // Use position type color, fallback to red for older points without color data
    const baseColor = point.color || "#FF0000"; // default red for old trail points

    // Convert hex color to RGB for opacity
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 255, g: 0, b: 0 }; // fallback red
    };

    const rgb = hexToRgb(baseColor);
    const colorWithOpacity = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;

    // Style trail dot with age-based opacity and position type color
    const trailStyle = new ol.style.Style({
      image: new ol.style.Circle({
        radius: 3,
        fill: new ol.style.Fill({
          color: colorWithOpacity,
        }),
      }),
    });

    trailFeature.setStyle(trailStyle);
    trailSource.addFeature(trailFeature);
  });
}

function updateHeadingArrow() {
  if (!headingArrow || headingTrue === null || headingTrue === undefined) {
    return;
  }

  const currentCoord = ol.proj.fromLonLat(currentPosition);

  // Calculate line length based on viewport - make it 1/4 of the viewport width
  const view = map.getView();
  const extent = view.calculateExtent(map.getSize());
  const viewportWidth = extent[2] - extent[0]; // right - left
  const arrowLength = viewportWidth * 0.25; // 25% of viewport width

  // Convert heading from degrees to radians and adjust for map coordinates
  // headingTrue is in degrees where 0° = North, clockwise positive
  // For OpenLayers: 0° = East, so we subtract 90° and negate to correct direction
  const bearing = (-(headingTrue - 90) * Math.PI) / 180;

  // Calculate end point of arrow
  const endCoord = [
    currentCoord[0] + arrowLength * Math.cos(bearing),
    currentCoord[1] + arrowLength * Math.sin(bearing),
  ];

  // Update the line geometry
  const lineGeometry = headingArrow.getGeometry();
  lineGeometry.setCoordinates([currentCoord, endCoord]);
}

function zoomIn() {
  if (map) {
    const view = map.getView();
    view.setZoom(view.getZoom() + 1);
  }
}

function zoomOut() {
  if (map) {
    const view = map.getView();
    view.setZoom(view.getZoom() - 1);
  }
}

// Update position type for color coding
function updatePositionType(newPositionType) {
  positionType = newPositionType;
  updatePositionMarkerColor();
}

// Update heading for arrow display
function updateHeading(newHeading) {
  // Convert from radians to degrees if needed
  if (typeof newHeading === 'number') {
    headingTrue = newHeading; // Assume it's already in degrees
    updateHeadingArrow();
  }
}

// Initialize map when DOM is ready
function initPositionDriftMap() {
  // Wait a bit for DOM to be ready
  setTimeout(() => {
    if (document.getElementById('position-drift-map')) {
      initializeMap();
    }
  }, 100);
}

// Export functions for use in main application
window.osmMap = {
  init: initPositionDriftMap,
  updatePosition: updateMapPosition,
  updatePositionType: updatePositionType,
  updateHeading: updateHeading,
  zoomIn: zoomIn,
  zoomOut: zoomOut
};