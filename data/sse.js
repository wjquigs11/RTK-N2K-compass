// Combined SSE and Compass functionality
let globalEventSource = null;
let globalHostname = null;
var container = document.getElementById('nmea-container');
var isFrozen = false;
// Maximum number of NMEA data lines to display before scrolling
var maxNmeaLines = 40;

// Track the three heading sources for chart updates
var headingSources = {
    UNIHEADINGA: null,
    THS: null,
    HPR: null
};

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
        headingDisplay.innerHTML = heading.toFixed(2);
    }
}

// Generic function to map quality value to text (fallback)
function getQualityText(quality) {
    if (quality === undefined) return "";
    
    switch(quality) {
        case 0: return "0/No Fix";
        case 1: return "1/Single";
        case 2: return "2/DGPS";
        case 4: return "4/RTK Fixed";
        case 5: return "5/RTK Float";
        case 6: return "6/Estimated";
        default: return "Unknown";
    }
}

// Shared function to update status elements based on data
function updateStatusElements(data, qualityFunction = getQualityText) {
    // Map quality value to text using the specified function
    // If quality is already a string (like solStatStr from UNIHEADINGA), use it directly
    var qualityText = typeof data.quality === 'string' ? data.quality : qualityFunction(data.quality);
    if (typeof data.quality === 'string') console.log("DEBUG: data.quality string:", data.quality);
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
        latValueElement.textContent = formatDMS(data.latitude, true);
    }
    if (lonValueElement && data.longitude !== undefined) {
        lonValueElement.textContent = formatDMS(data.longitude, false);
    }
    if (primaryAntennaElement && data.primaryAntenna !== undefined) {
        primaryAntennaElement.textContent = getAntennaStatusText(data.primaryAntenna);
    }
    if (secondaryAntennaElement && data.secondaryAntenna !== undefined) {
        secondaryAntennaElement.textContent = getAntennaStatusText(data.secondaryAntenna);
    }
}

// Function to convert decimal degrees to degrees, minutes, seconds format
function formatDMS(decimalDegrees, isLatitude = true) {
    if (decimalDegrees === undefined || decimalDegrees === null) return '-';
    
    var degrees = Math.floor(Math.abs(decimalDegrees));
    var minutes = Math.floor((Math.abs(decimalDegrees) - degrees) * 60);
    var seconds = ((Math.abs(decimalDegrees) - degrees) * 60 - minutes) * 60;
    
    // Determine direction
    var direction;
    if (isLatitude) {
        direction = decimalDegrees >= 0 ? 'N' : 'S';
    } else {
        direction = decimalDegrees >= 0 ? 'E' : 'W';
    }
    
    return `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toFixed(4).padStart(7, '0')}"${direction}`;
}

// Function to parse NMEA0183 checksum
function validateNMEAChecksum(sentence) {
    if (!sentence.includes('*')) return false;
    
    var parts = sentence.split('*');
    var data = parts[0].substring(1); // Remove the $ or # at the beginning
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

// Function to parse GNGGA sentence (GPS Fix Data)
// Format: $GNGGA,<Time>,<Lat>,<LatDir>,<Lon>,<LonDir>,<Quality>,<NumSV>,<HDOP>,<Alt>,<AltUnit>,<Sep>,<SepUnit>,<DiffAge>,<DiffStation>*
function parseGNGGA(sentence) {
    if (!validateNMEAChecksum(sentence)) return null;
    
    var fields = sentence.split(',');
    if (fields.length < 15) return null;
    
    // Check if GPS quality is valid (0 = invalid, 1+ = valid)
    var quality = parseInt(fields[6]);
    if (quality === 0) {
        console.log("GGA: Invalid GPS quality:", quality);
        return null;
    }
    
    var lat = parseFloat(fields[2]);
    var latDir = fields[3];
    var lon = parseFloat(fields[4]);
    var lonDir = fields[5];
    
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
        latitude: lat,
        longitude: lon,
        //quality: quality,
        numSV: parseInt(fields[7]),
        hdop: parseFloat(fields[8]),
        altitude: parseFloat(fields[9]),
        altUnit: fields[10],
        geoidSep: parseFloat(fields[11]),
        sepUnit: fields[12],
        diffAge: parseFloat(fields[13]),
        diffStation: fields[14].split('*')[0]
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

// Function to parse UNIHEADINGA sentence
// Real-world format: #UNIHEADINGA,<port>,<sequence>,<idle_time>,<time_status>,<week>,<seconds>,<receiver_status>,<reserved>,<receiver_sw_version>;<solStat>,<posType>,<length>,<heading>,<pitch>,<reserved>,<hdgstddev>,<ptchstddev>,<stn_id>,<#SVs>,<#solnSVs>,<#obs>,<#multi>,<reserved>,<ext_sol_stat>,<galileo_bds3_sig_mask>,<gps_glonass_bds2_sig_mask>*<checksum>
// Example: #UNIHEADINGA,97,GPS,FINE,2190,365174000,0,0,18,12;INSUFFICIENT_OBS,NONE,0.000 0,0.0000,0.0000,0.0000,0.0000,0.0000,"",0,0,0,0,0,00,0,0*ee072604
function parseUNIHEADINGA(sentence) {
    console.log("DEBUG parseUNIHEADINGA: sentence =", sentence);
    
    // Skip checksum validation for UNIHEADINGA sentences
    console.log("DEBUG: skipping checksum validation for UNIHEADINGA");
    // Find the semicolon separator
    var semicolonPos = sentence.indexOf(';');
    console.log("DEBUG parseUNIHEADINGA: semicolon position =", semicolonPos);
    if (semicolonPos === -1) return null;
    
    // Get the part after semicolon and before checksum
    var afterSemicolon = sentence.substring(semicolonPos + 1);
    console.log("DEBUG parseUNIHEADINGA: after semicolon =", afterSemicolon);
    
    var checksumPos = afterSemicolon.indexOf('*');
    console.log("DEBUG parseUNIHEADINGA: checksum position in afterSemicolon =", checksumPos);
    if (checksumPos !== -1) {
        afterSemicolon = afterSemicolon.substring(0, checksumPos);
        console.log("DEBUG parseUNIHEADINGA: after removing checksum =", afterSemicolon);
    }
    
    var fields = afterSemicolon.split(',');
    console.log("DEBUG parseUNIHEADINGA: fields =", fields);
    console.log("DEBUG parseUNIHEADINGA: fields.length =", fields.length);
    if (fields.length < 5) {
        console.log("DEBUG parseUNIHEADINGA: not enough fields, returning null");
        return null; // Need at least solStat, posType, length, heading, pitch
    }
    
    // Helper function to clean field values (remove quotes, handle malformed data)
    function cleanField(field) {
        if (!field) return field;
        // Remove quotes
        if (field.startsWith('"') && field.endsWith('"')) {
            return field.slice(1, -1);
        }
        return field;
    }
    
    // Helper function to parse length field that might be malformed like "0.000 0"
    function parseLength(field) {
        if (!field) return 0.0;
        var cleaned = cleanField(field);
        var spacePos = cleaned.indexOf(' ');
        if (spacePos !== -1) {
            cleaned = cleaned.substring(0, spacePos); // Take part before space
        }
        return parseFloat(cleaned) || 0.0;
    }
    
    var result = {
        solStatStr: cleanField(fields[0]) || '',                    // Solution status as string
        posTypeStr: cleanField(fields[1]) || '',                    // Position type as string
        posType: parseInt(cleanField(fields[1])) || 0,              // Position type (fallback to numeric)
        length: parseLength(fields[2]),                             // Baseline length (handle malformed)
        heading: parseFloat(fields[3]) || 0.0,                      // Heading (0 to 360.0 degrees)
        pitch: parseFloat(fields[4]) || 0.0                         // Pitch (± 90 degrees)
    };
    
    // Parse additional fields if available
    if (fields.length > 6) result.hdgStdDev = parseFloat(fields[6]) || 0.0;      // Standard deviation of heading
    if (fields.length > 7) result.ptchStdDev = parseFloat(fields[7]) || 0.0;     // Standard deviation of pitch
    if (fields.length > 8) {
        result.stnIdStr = cleanField(fields[8]) || '';                            // Base station ID as string
        result.stnId = parseInt(cleanField(fields[8])) || 0;                      // Base station ID as number
    }
    if (fields.length > 9) result.numSVs = parseInt(fields[9]) || 0;             // Number of satellites tracked
    if (fields.length > 10) result.numSolnSVs = parseInt(fields[10]) || 0;       // Number of satellites used in solution
    if (fields.length > 11) result.numObs = parseInt(fields[11]) || 0;           // Number of satellites above elevation mask
    if (fields.length > 12) result.numMulti = parseInt(fields[12]) || 0;         // Number of satellites with L2 signal
    if (fields.length > 14) result.extSolStat = parseInt(fields[14]) || 0;       // Extended solution status
    
    console.log("DEBUG parseUNIHEADINGA: final result =", result);
    return result;
}

// Function to parse GNTHS sentence (True Heading and Status)
// Format: $GNTHS,<heading>,<mode>*<checksum>
// Example: $GNTHS,341.3344,A*1F
function parseGNTHS(sentence) {
    if (!validateNMEAChecksum(sentence)) return null;
    
    var fields = sentence.split(',');
    if (fields.length < 3) return null;
    
    var heading = parseFloat(fields[1]);
    if (isNaN(heading)) return null;
    
    var mode = fields[2].split('*')[0];
    
    return {
        heading: heading,
        mode: mode, // A=Autonomous, E=Estimated, M=Manual, S=Simulator, V=Invalid
        valid: mode !== 'V' // Data is valid if mode is not 'V'
    };
}

// Function to parse HPR sentence (Heave, Pitch, Roll)
// Format: $--HPR,<time>,<heading>,<pitch>,<roll>*<checksum>
// Example: $GPHPR,123456.00,45.5,2.3,1.5*hh
function parseHPR(sentence) {
    if (!validateNMEAChecksum(sentence)) return null;
    
    var fields = sentence.split(',');
    if (fields.length < 3) return null;
    
    // Field 0 is sentence ID, Field 1 is time (optional), Field 2 is heading
    var heading = parseFloat(fields[2]);
    if (isNaN(heading)) return null;
    
    return {
        heading: heading,
        time: fields[1]
    };
}

// Helper function to update chart from all heading sources
function updateChartFromHeadingSources() {
    if (typeof addChartDataPoint === 'function') {
        addChartDataPoint(
            headingSources.UNIHEADINGA || 0,
            headingSources.THS || 0,
            headingSources.HPR || 0
        );
    }
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
            
            // Update heading source and chart
            headingSources.UNIHEADINGA = data.heading;
            updateChartFromHeadingSources();
            
            // Update OpenStreetMap heading
            if (window.osmMap && typeof window.osmMap.updateHeading === 'function') {
                window.osmMap.updateHeading(data.heading);
            }
            
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
            }, getQualityText);
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
            
            // Update OpenStreetMap position
            if (window.osmMap && typeof window.osmMap.updatePosition === 'function') {
                window.osmMap.updatePosition(data.latitude, data.longitude);
            }
        }
    } else if (sentence.startsWith('$GNGGA,')) {
        data = parseGNGGA(sentence);
        if (data) {
            console.log("GGA parsed data:", data);
            displayText = `GNGGA - UTC: ${data.utc} | Lat: ${data.latitude.toFixed(6)} | Lon: ${data.longitude.toFixed(6)} | Quality: ${data.quality} | Sats: ${data.numSV} | Alt: ${data.altitude}${data.altUnit}`;
            updateStatusElements({
                latitude: data.latitude,
                longitude: data.longitude,
                utc: data.utc,
                quality: data.quality,
                usedSV: data.numSV
            });
            
            // Update OpenStreetMap position
            if (window.osmMap && typeof window.osmMap.updatePosition === 'function') {
                window.osmMap.updatePosition(data.latitude, data.longitude);
            }
            
            // Update position type for color coding
            if (window.osmMap && typeof window.osmMap.updatePositionType === 'function') {
                // Map GGA quality to position type
                const qualityToType = {
                    0: 'AUTONOMOUS',
                    1: 'AUTONOMOUS',
                    2: 'DGPS',
                    4: 'RTK_FIXED',
                    5: 'RTK_FLOAT'
                };
                window.osmMap.updatePositionType(qualityToType[data.quality] || 'AUTONOMOUS');
            }
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
    } else if (sentence.startsWith('#UNIHEADINGA,')) {
        data = parseUNIHEADINGA(sentence);
        if (data) {
            // Update compass with heading data
            updateCompass(data.heading);
            
            // Update heading source and chart
            headingSources.UNIHEADINGA = data.heading;
            updateChartFromHeadingSources();
            
            // Update OpenStreetMap heading
            if (window.osmMap && typeof window.osmMap.updateHeading === 'function') {
                window.osmMap.updateHeading(data.heading);
            }
            
            // Update position type for color coding
            if (window.osmMap && typeof window.osmMap.updatePositionType === 'function') {
                // Map position type string to our color scheme
                let posType = data.posTypeStr || 'AUTONOMOUS';
                if (posType === 'NONE') posType = 'AUTONOMOUS';
                window.osmMap.updatePositionType(posType);
            }
            
            // Create comprehensive display text with all available fields
            var displayParts = [
                `Heading: ${data.heading.toFixed(4)}°`,
                `Pitch: ${data.pitch.toFixed(4)}°`,
                `Length: ${data.length.toFixed(3)}m`
            ];
            
            // Use string values for solution status and position type if available
            if (data.solStatStr) {
                displayParts.push(`Sol: ${data.solStatStr}`);
            } else {
                displayParts.push(`Sol: ${data.solStat}`);
            }
            
            if (data.posTypeStr && data.posTypeStr !== 'NONE') {
                displayParts.push(`Pos: ${data.posTypeStr}`);
            } else if (data.posType) {
                displayParts.push(`Pos: ${data.posType}`);
            }
            
            // Add optional fields if available
            if (data.numSolnSVs !== undefined && data.numSVs !== undefined) {
                displayParts.push(`SVs: ${data.numSolnSVs}/${data.numSVs}`);
            }
            if (data.hdgStdDev !== undefined && data.hdgStdDev > 0) {
                displayParts.push(`HdgAcc: ${data.hdgStdDev.toFixed(4)}°`);
            }
            if (data.stnIdStr && data.stnIdStr !== '') {
                displayParts.push(`Stn: ${data.stnIdStr}`);
            } else if (data.stnId !== undefined && data.stnId > 0) {
                displayParts.push(`Stn: ${data.stnId}`);
            }
            
            displayText = `UNIHEADINGA - ${displayParts.join(' | ')}`;
            
            // Update status elements with comprehensive data
            updateStatusElements({
                heading: data.heading,
                pitch: data.pitch,
                length: data.length,
                quality: data.solStatStr + '|' + data.posTypeStr, // Concatenate solution status and position type
                usedSV: data.numSolnSVs || data.posType, // Use numSolnSVs if available, fallback to posType
                hdgAccuracy: data.hdgStdDev,
                ptchAccuracy: data.ptchStdDev,
                baseStationId: data.stnIdStr || data.stnId,
                totalSVs: data.numSVs,
                solStatStr: data.solStatStr, // Pass string version for display
                posTypeStr: data.posTypeStr  // Pass string version for display
            });
        }
    } else if (sentence.startsWith('$GNTHS,')) {
        data = parseGNTHS(sentence);
        if (data && data.valid) {
            // Update compass with heading data
            updateCompass(data.heading);
            
            // Update heading source and chart
            headingSources.THS = data.heading;
            updateChartFromHeadingSources();
            
            // Update OpenStreetMap heading
            if (window.osmMap && typeof window.osmMap.updateHeading === 'function') {
                window.osmMap.updateHeading(data.heading);
            }
            
            var modeText = '';
            switch(data.mode) {
                case 'A': modeText = 'Autonomous'; break;
                case 'E': modeText = 'Estimated'; break;
                case 'M': modeText = 'Manual'; break;
                case 'S': modeText = 'Simulator'; break;
                default: modeText = data.mode;
            }
            
            displayText = `GNTHS - True Heading: ${data.heading.toFixed(4)}° | Mode: ${modeText}`;
            
            // Update status elements
            updateStatusElements({
                heading: data.heading
            });
        }
    } else if (sentence.startsWith('$GPHPR,') || sentence.startsWith('$GNHPR,')) {
        data = parseHPR(sentence);
        if (data) {
            // Update heading source and chart
            headingSources.HPR = data.heading;
            updateChartFromHeadingSources();
            
            displayText = `HPR - Heading: ${data.heading.toFixed(4)}°`;
        }
    }
    
    // Add to display container (freeze only affects scrolling window, not parsing)
    if (container && container.appendChild) {
        if (!isFrozen) {
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
}

function setupEventListeners(eventSource) {
    // Handle raw NMEA sentences (sent as "message" events from server)
    eventSource.onmessage = function(event) {
        // Always process NMEA data (freeze only affects scrolling window)
        processNMEAData(event.data);
    };

    // Handle parsed JSON data (sent as "update" events from server)
    eventSource.addEventListener('update', function(e) {
        // Always process update events (freeze only affects scrolling window)
        try {
            var data = JSON.parse(e.data);
            console.log(`DEBUG: Processing JSON data from update event:`, data);
            
            // Update compass with heading data
            if (data.heading !== undefined) {
                updateCompass(data.heading);
            }
            
            // Update status elements
            updateStatusElements(data);
            
        } catch (e) {
            console.error("DEBUG: Error parsing update event JSON:", e, "Data:", e.data);
        }
    }, false);

    eventSource.addEventListener('open', function(e) {
        console.log("SSE Events Connected");
    }, false);
    
    eventSource.addEventListener('error', function(e) {
        if (e.target.readyState != EventSource.OPEN) {
            console.log("SSE Events Disconnected");
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
// This function gives us the option of creating a 'host' file in the /data directory
// When the page loads, it will fetch /data/host
// cd data; python3 -m http.server 8000 
// can browse to localhost:8000 and view the html pages, but the event source will be e.g. um982 (esp32) from 'host' file
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