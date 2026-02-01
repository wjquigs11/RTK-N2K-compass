// Combined WebSocket and Compass functionality
// Global variables
let globalWebSocket = null;
let globalHostname = null;
var container = document.getElementById('nmea-container');
var isFrozen = false;
// Maximum number of NMEA data lines to display before scrolling
var maxNmeaLines = 40;

// Function to get the hostname from /host endpoint
function getWSHostname() {
    return fetch('/host')
        .then(response => response.text())
        .then(hostname => {
            hostname = hostname.trim() + '.local';
            globalHostname = hostname;
            console.log("Hostname set to:", globalHostname);
            return hostname;
        })
        .catch(error => {
            console.error('Error fetching hostname:', error);
            globalHostname = null;
            return null;
        });
}

// Function to update the compass display with the given heading
function updateCompass(heading) {
    const compassCircle = document.querySelector(".compass-circle");
    const headingDisplay = document.getElementById("heading-value");
    
    // Rotate the compass card in the opposite direction of the heading
    if (compassCircle) {
        compassCircle.style.transform = `rotate(${-heading}deg)`;
    }
    
    // Update the heading display if it exists
    if (headingDisplay) {
        headingDisplay.innerHTML = Math.round(heading);
    }
}

// Shared function to update status elements based on data
function updateStatusElements(data) {
    // Map quality value to text
    var qualityText = "";
    if (data.quality !== undefined) {
        switch(data.quality) {
            case 0: qualityText = "0/No Fix"; break;
            case 1: qualityText = "1/Single"; break;
            case 2: qualityText = "2/DGPS"; break;
            case 4: qualityText = "4/RTK Fixed"; break;
            case 5: qualityText = "5/RTK Float"; break;
            case 6: qualityText = "6/Estimated"; break;
            default: qualityText = "Unknown";
        }
    }
    
    // Map antenna status values to text
    function getAntennaStatusText(status) {
        switch(status) {
            case 0: return "0/Disconnected";
            case 1: return "1/Connected";
            case 2: return "2/Short Circuit";
            case 3: return "3/Open Circuit";
            default: return "Unknown";
        }
    }
    
    // Get DOM elements
    var pitchElement = document.getElementById('pitch-value');
    var rollElement = document.getElementById('roll-value');
    var solStatElement = document.getElementById('sol-stat');
    var posTypeElement = document.getElementById('pos-type');
    var utcValueElement = document.getElementById('utc-value');
    var baseValueElement = document.getElementById('baseline-value');
    var latValueElement = document.getElementById('latitude-value');
    var lonValueElement = document.getElementById('longitude-value');
    var primaryAntennaElement = document.getElementById('primary-antenna-status');
    var secondaryAntennaElement = document.getElementById('secondary-antenna-status');

    // Update DOM elements if they exist
    if (solStatElement && data.quality !== undefined) {
        solStatElement.textContent = qualityText;
    }
    if (posTypeElement && data.usedSV !== undefined) {
        posTypeElement.textContent = `${data.usedSV}`;
    }
    if (utcValueElement && data.utc !== undefined) {
        utcValueElement.textContent = data.utc;
    }
    if (baseValueElement && data.length !== undefined) {
        baseValueElement.textContent = data.length;
    }
    if (pitchElement && data.pitch !== undefined) {
        pitchElement.textContent = data.pitch.toFixed(2);
        console.log("Pitch element updated to:", pitchElement.textContent);
    }
    if (rollElement && data.roll !== undefined) {
        rollElement.textContent = data.roll.toFixed(2);
        console.log("Roll element updated to:", rollElement.textContent);
    }
    if (latValueElement && data.latitude !== undefined) {
        latValueElement.textContent = data.latitude;
    }
    if (lonValueElement && data.longitude !== undefined) {
        lonValueElement.textContent = data.longitude;
    }
    if (primaryAntennaElement && data.primaryAntenna !== undefined) {
        primaryAntennaElement.textContent = getAntennaStatusText(data.primaryAntenna);
    }
    if (secondaryAntennaElement && data.secondaryAntenna !== undefined) {
        secondaryAntennaElement.textContent = getAntennaStatusText(data.secondaryAntenna);
    }
}

// Function to parse NMEA0183 checksum
function validateNMEAChecksum(sentence) {
    if (!sentence.includes('*')) return false;
    
    var parts = sentence.split('*');
    var data = parts[0].substring(1); // Remove the $ at the beginning
    var providedChecksum = parts[1];
    
    var calculatedChecksum = 0;
    for (var i = 0; i < data.length; i++) {
        calculatedChecksum ^= data.charCodeAt(i);
    }
    
    return calculatedChecksum.toString(16).toUpperCase().padStart(2, '0') === providedChecksum.toUpperCase();
}

// Function to parse PQTMTAR sentence
// Format: $PQTMTAR,<MsgVer>,<Time>,<Quality>,<Res>,<Length>,<Pitch>,<Roll>,<Heading>,<Acc_Pitch>,<Acc_Roll>,<Acc_Heading>,<UsedSV>*
function parsePQTMTAR(sentence) {
    if (!validateNMEAChecksum(sentence)) return null;
    
    var fields = sentence.split(',');
    if (fields.length < 12) return null;
    
    return {
        msgVer: parseInt(fields[1]),
        utc: fields[2],
        quality: parseInt(fields[3]),
        length: parseFloat(fields[5]),
        pitch: parseFloat(fields[6]),
        roll: parseFloat(fields[7]),
        heading: parseFloat(fields[8]),
        accPitch: parseFloat(fields[9]),
        accRoll: parseFloat(fields[10]),
        accHeading: parseFloat(fields[11]),
        usedSV: parseInt(fields[12].split('*')[0])
    };
}

// Function to parse GNRMC sentence
// Format: $GNRMC,<Time>,<Status>,<Lat>,<LatDir>,<Lon>,<LonDir>,<Speed>,<Course>,<Date>,<MagVar>,<MagVarDir>,<Mode>,<NavStatus>*
function parseGNRMC(sentence) {
    if (!validateNMEAChecksum(sentence)) return null;
    
    var fields = sentence.split(',');
    if (fields.length < 13) return null;
    
    // Check if GPS fix is valid (A = active/valid, V = void/invalid)
    if (fields[2] !== 'A') {
        console.log("RMC: Invalid GPS fix status:", fields[2]);
        return null;
    }
    
    var lat = parseFloat(fields[3]);
    var latDir = fields[4];
    var lon = parseFloat(fields[5]);
    var lonDir = fields[6];
    
    // Convert DDMM.MMMM format to decimal degrees
    if (lat && latDir) {
        var latDeg = Math.floor(lat / 100);
        var latMin = lat - (latDeg * 100);
        lat = latDeg + (latMin / 60);
        if (latDir === 'S') lat = -lat;
    }
    
    if (lon && lonDir) {
        var lonDeg = Math.floor(lon / 100);
        var lonMin = lon - (lonDeg * 100);
        lon = lonDeg + (lonMin / 60);
        if (lonDir === 'W') lon = -lon;
    }
    
    return {
        utc: fields[1],
        status: fields[2],
        latitude: lat,
        longitude: lon,
        speed: parseFloat(fields[7]),
        course: parseFloat(fields[8]),
        date: fields[9]
    };
}

// Function to parse PQTMANTENNASTATUS sentence
// Format: $PQTMANTENNASTATUS,<MsgVer>,<AntA>,<Reserved>,<AntB>,<Reserved>*
function parsePQTMANTENNASTATUS(sentence) {
    if (!validateNMEAChecksum(sentence)) return null;
    
    var fields = sentence.split(',');
    if (fields.length < 6) return null;
    
    return {
        msgVer: parseInt(fields[1]),
        primary: parseInt(fields[2]),
        secondary: parseInt(fields[4])
    };
}

// Shared function to process NMEA0183 data
function processNMEAData(sentence) {
    console.log(`DEBUG: Processing NMEA sentence:`, sentence);
    
    var data = null;
    var displayText = sentence; // Default to showing raw sentence
    
    if (sentence.startsWith('$PQTMTAR,')) {
        data = parsePQTMTAR(sentence);
        if (data) {
            // Update compass with heading data
            updateCompass(data.heading);
            
            displayText = `Heading: ${data.heading.toFixed(2)}° | Pitch: ${data.pitch.toFixed(2)}° | Roll: ${data.roll.toFixed(2)}° | Quality: ${data.quality} | UTC: ${data.utc}`;
            
            // Update status elements
            updateStatusElements({
                heading: data.heading,
                pitch: data.pitch,
                roll: data.roll,
                quality: data.quality,
                utc: data.utc,
                length: data.length,
                usedSV: data.usedSV
            });
        }
    } else if (sentence.startsWith('$GNRMC,')) {
        data = parseGNRMC(sentence);
        if (data) {
            console.log("RMC parsed data:", data);
            displayText = `GNRMC - UTC: ${data.utc} | Lat: ${data.latitude.toFixed(6)} | Lon: ${data.longitude.toFixed(6)} | Speed: ${data.speed} kts`;
            updateStatusElements({
                latitude: data.latitude,
                longitude: data.longitude,
                utc: data.utc
            });
        }
    } else if (sentence.startsWith('$PQTMANTENNASTATUS,')) {
        data = parsePQTMANTENNASTATUS(sentence);
        if (data) {
            displayText = `Antenna Status - Primary: ${data.primary} | Secondary: ${data.secondary}`;
            updateStatusElements({
                primaryAntenna: data.primary,
                secondaryAntenna: data.secondary
            });
        }
    }
    
    // Add to display container if it exists
    if (container && container.appendChild) {
        var newLine = document.createElement('div');
        newLine.className = 'nmea-line nmea-data';
        newLine.textContent = displayText;
        container.appendChild(newLine);
        
        // Limit the number of lines to prevent excessive memory usage
        while (container.children.length > maxNmeaLines) {
            container.removeChild(container.firstChild);
        }
        
        container.scrollTop = container.scrollHeight;
    }
}

// WebSocket functions
function initWebSocket() {
    console.log('Trying to open a WebSocket connection…');
    
    // Use the hostname for the WebSocket URL if available, otherwise fall back to relative path
    var gateway = globalHostname ? 
        `ws://${globalHostname}/ws` : 
        `ws://${window.location.hostname}/ws`;
    
    globalWebSocket = new WebSocket(gateway);
    globalWebSocket.onopen = onOpen;
    globalWebSocket.onclose = onClose;
    globalWebSocket.onmessage = onMessage;
}

// When websocket is established
function onOpen(event) {
    console.log('WebSocket connection opened');
}

function onClose(event) {
    console.log('WebSocket connection closed');
    setTimeout(initWebSocket, 2000);
}

// Function that receives messages from the ESP32
function onMessage(event) {
    if (!isFrozen) {
        var message = event.data.trim();
        
        // Check if it's a valid NMEA sentence (starts with $ and contains *)
        if (message.startsWith('$') && message.includes('*')) {
            // Process as NMEA0183 sentence
            processNMEAData(message);
        } else {
            // Try to parse as JSON for backward compatibility
            try {
                var data = JSON.parse(message);
                // For backward compatibility, convert JSON back to display format
                var displayText = JSON.stringify(data);
                if (container && container.appendChild) {
                    var newLine = document.createElement('div');
                    newLine.className = 'nmea-line json-fallback';
                    newLine.textContent = displayText;
                    container.appendChild(newLine);
                    
                    // Limit the number of lines to prevent excessive memory usage
                    while (container.children.length > maxNmeaLines) {
                        container.removeChild(container.firstChild);
                    }
                    
                    container.scrollTop = container.scrollHeight;
                }
            } catch (e) {
                // Neither NMEA nor JSON - display as raw text
                if (container && container.appendChild) {
                    var newLine = document.createElement('div');
                    newLine.className = 'nmea-line raw-data';
                    newLine.textContent = message;
                    container.appendChild(newLine);
                    
                    // Limit the number of lines to prevent excessive memory usage
                    while (container.children.length > maxNmeaLines) {
                        container.removeChild(container.firstChild);
                    }
                    
                    container.scrollTop = container.scrollHeight;
                }
            }
        }
    }
}

function freezeData() {
    isFrozen = true;
    const freezeBtn = document.getElementById('freeze-btn');
    const resumeBtn = document.getElementById('resume-btn');
    if (freezeBtn) freezeBtn.disabled = true;
    if (resumeBtn) resumeBtn.disabled = false;
    console.log('Data updates frozen');
}

function resumeData() {
    isFrozen = false;
    const freezeBtn = document.getElementById('freeze-btn');
    const resumeBtn = document.getElementById('resume-btn');
    if (freezeBtn) freezeBtn.disabled = false;
    if (resumeBtn) resumeBtn.disabled = true;
    console.log('Data updates resumed');
}

function sendCommand() {
    var input = document.getElementById('command-input');
    var command = input.value.trim();
    if (command) {
        fetch('/commands', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: command
        }).then(response => {
            if (response.ok) {
                input.value = '';
                console.log('Command sent:', command);
            } else {
                console.error('Failed to send command');
            }
        }).catch(error => {
            console.error('Error sending command:', error);
        });
    }
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // First get the hostname
    getWSHostname().then(() => {
        // Initialize WebSocket after hostname is fetched
        initWebSocket();
    });
    
    // Set up command input event listener
    const commandInput = document.getElementById('command-input');
    if (commandInput) {
        commandInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendCommand();
            }
        });
    }
});