// Combined SSE and Compass functionality
// Global variables
let globalEventSource = null;
let globalHostname = null;
var container = document.getElementById('nmea-container');
var isFrozen = false;
// Maximum number of NMEA data lines to display before scrolling
var maxNmeaLines = 50;

// Function to get the hostname from /host endpoint
function getSSEHostname() {
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

// Heading data is now received exclusively via SSE events

function setupEventListeners(eventSource) {
    eventSource.onmessage = function(event) {
        //console.log("DEBUG: Received message event:", event.data);
        if (!isFrozen) {
            try {
                // Parse the JSON data
                var data = JSON.parse(event.data);
                console.log("DEBUG: Parsed JSON data from message event:", data);
                
                // Update compass with heading data
                if (data.heading !== undefined) {
                    updateCompass(data.heading);
                }
                
                // Create formatted display text
                var displayText = `Heading: ${data.heading.toFixed(2)}° | Pitch: ${data.pitch.toFixed(2)}° | Roll: ${data.roll.toFixed(2)}° | Quality: ${data.quality} | UTC: ${data.utc}`;
                
                // Add to display container if it exists
                if (container && container.appendChild) {
                    var newLine = document.createElement('div');
                    newLine.className = 'nmea-line';
                    newLine.textContent = displayText;
                    container.appendChild(newLine);
                    
                    // Limit the number of lines to prevent excessive memory usage
                    while (container.children.length > maxNmeaLines) {
                        container.removeChild(container.firstChild);
                    }
                    
                    container.scrollTop = container.scrollHeight;
                }
                
                // Update status elements based on quality value
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
                
                // Check if DOM elements exist and log their status
                var pitchElement = document.getElementById('pitch-value');
                var rollElement = document.getElementById('roll-value');
                var solStatElement = document.getElementById('sol-stat');
                var posTypeElement = document.getElementById('pos-type');
                var utcValueElement = document.getElementById('utc-value');     
                var qualValueElement = document.getElementById('quality-value');     
                var baseValueElement = document.getElementById('baseline-value');     
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
            } catch (e) {
                //console.log("DEBUG: Non-JSON message event (NMEA sentence):", event.data);
                // Only add NMEA sentences to container if it exists (index.html has it, compass.html doesn't)
                if (container && container.appendChild) {
                    // Non-JSON data is expected; should be NMEA sentences so add them to the scrolling window
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
    };

    // Add listener for "update" events (this is what the server actually sends for JSON data)
    eventSource.addEventListener('update', function(e) {
        console.log("DEBUG: Received update event:", e.data);
        if (!isFrozen) {
            try {
                var data = JSON.parse(e.data);
                console.log("DEBUG: Parsed JSON data from update event:", data);
                
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
                
                // Update status elements if we have PQTMTAR data
                if (data.heading !== undefined && data.pitch !== undefined && data.roll !== undefined) {
                    var qualityText = "";
                    switch(data.quality) {
                        case 0: qualityText = "No Fix"; break;
                        case 1: qualityText = "Single"; break;
                        case 2: qualityText = "DGPS"; break;
                        case 4: qualityText = "RTK Fixed"; break;
                        case 5: qualityText = "RTK Float"; break;
                        default: qualityText = "Unknown";
                    }
                    
                    var pitchElement = document.getElementById('pitch-value');
                    var rollElement = document.getElementById('roll-value');
                    var solStatElement = document.getElementById('sol-stat');
                    var posTypeElement = document.getElementById('pos-type');
                    var utcValueElement = document.getElementById('utc-value');

                    if (solStatElement) {
                        solStatElement.textContent = qualityText;
                    }
                    if (posTypeElement) {
                        posTypeElement.textContent = `${data.usedSV}`;
                    }
                    if (utcValueElement) {
                        utcValueElement.textContent = data.utc;
                    }
                    if (pitchElement) {
                        pitchElement.textContent = data.pitch.toFixed(2);
                    }
                    if (rollElement) {
                        rollElement.textContent = data.roll.toFixed(2);
                    }
                }
            } catch (e) {
                console.error("DEBUG: Error parsing update event JSON:", e, "Data:", e.data);
            }
        }
    }, false);

    // Keep legacy support for heading_update events
    eventSource.addEventListener('heading_update', function(e) {
        console.log("DEBUG: Received heading_update event:", e.data);
        var data = JSON.parse(e.data);
        updateCompass(data.heading);
    }, false);

    eventSource.addEventListener('open', function(e) {
        console.log("Events Connected");
    }, false);
    
    eventSource.addEventListener('error', function(e) {
        if (e.target.readyState != EventSource.OPEN) {
            console.log("Events Disconnected");
        }
    }, false);
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
    getSSEHostname().then(() => {
        // Initialize EventSource after hostname is fetched
        if (!!window.EventSource && !globalEventSource) {
            // Use the hostname for the EventSource URL if available, otherwise fall back to relative path
            globalEventSource = globalHostname ?
                new EventSource(`http://${globalHostname}/events`) :
                new EventSource('/events');
            
            // Set up event listeners for the event source
            setupEventListeners(globalEventSource);
        }
        
        // All heading updates now come exclusively via SSE events
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