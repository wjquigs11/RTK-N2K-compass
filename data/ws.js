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
    switch(data.quality) {
        case 0: qualityText = "No Fix"; break;
        case 1: qualityText = "Single"; break;
        case 2: qualityText = "DGPS"; break;
        case 4: qualityText = "RTK Fixed"; break;
        case 5: qualityText = "RTK Float"; break;
        case 6: qualityText = "Estimated"; break;
        default: qualityText = "Unknown";
    }
    
    // Get DOM elements
    var pitchElement = document.getElementById('pitch-value');
    var rollElement = document.getElementById('roll-value');
    var solStatElement = document.getElementById('sol-stat');
    var posTypeElement = document.getElementById('pos-type');
    var utcValueElement = document.getElementById('utc-value');
    var qualValueElement = document.getElementById('quality-value');
    var baseValueElement = document.getElementById('baseline-value');
    var latValueElement = document.getElementById('latitude-value');
    var lonValueElement = document.getElementById('longitude-value');

    // Update DOM elements if they exist
    if (solStatElement) {
        solStatElement.textContent = qualityText;
    }
    if (posTypeElement) {
        posTypeElement.textContent = `${data.usedSV}`;
    }
    if (utcValueElement) {
        utcValueElement.textContent = data.utc;
    }
    if (qualValueElement) {
        qualValueElement.textContent = data.quality;
    }
    if (baseValueElement) {
        baseValueElement.textContent = data.length;
    }
    if (pitchElement) {
        pitchElement.textContent = data.pitch.toFixed(2);
        console.log("Pitch element updated to:", pitchElement.textContent);
    }
    if (rollElement) {
        rollElement.textContent = data.roll.toFixed(2);
        console.log("Roll element updated to:", rollElement.textContent);
    }
    if (latValueElement) {
        latValueElement.textContent = data.latitude;
    }
    if (lonValueElement) {
        lonValueElement.textContent = data.longitude;
    }
}

// Shared function to process JSON data
function processJSONData(data) {
    console.log(`DEBUG: Processing JSON data:`, data);
    
    // Update compass with heading data
    if (data.heading !== undefined) {
        updateCompass(data.heading);
    }
    
    // Create formatted display text based on data structure
    var displayText = "";
    if (data.heading !== undefined && data.pitch !== undefined && data.roll !== undefined) {
        // PQTMTAR data
        displayText = `Heading: ${data.heading.toFixed(2)}° | Pitch: ${data.pitch.toFixed(2)}° | Roll: ${data.roll.toFixed(2)}° | Quality: ${data.quality} | UTC: ${data.utc}`;
    } else if (data.antennaStatus) {
        // PQTMANTENNASTATUS data
        displayText = `Antenna Status - Primary: ${data.antennaStatus.primary} | Secondary: ${data.antennaStatus.secondary}`;
    } else if (data.gnrmc) {
        // GNRMC data
        displayText = `GNRMC - UTC: ${data.gnrmc.utc} | Lat: ${data.gnrmc.lat.toFixed(6)} | Lon: ${data.gnrmc.lon.toFixed(6)} | Speed: ${data.gnrmc.speed} kts`;
    } else {
        displayText = JSON.stringify(data);
    }
    
    // Add to display container if it exists
    if (container && container.appendChild) {
        var newLine = document.createElement('div');
        newLine.className = 'nmea-line json-data';
        newLine.textContent = displayText;
        container.appendChild(newLine);
        
        // Limit the number of lines to prevent excessive memory usage
        while (container.children.length > maxNmeaLines) {
            container.removeChild(container.firstChild);
        }
        
        container.scrollTop = container.scrollHeight;
    }
    
    // Update status elements if we have PQTMTAR data (heading/pitch/roll data)
    if (data.heading !== undefined && data.pitch !== undefined && data.roll !== undefined) {
        updateStatusElements(data);
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
        try {
            // Try to parse as JSON first
            var data = JSON.parse(event.data);
            processJSONData(data);
        } catch (e) {
            // Non-JSON data - should be raw NMEA sentences
            if (container && container.appendChild) {
                var newLine = document.createElement('div');
                newLine.className = 'nmea-line';
                newLine.textContent = event.data;
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