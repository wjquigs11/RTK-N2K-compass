#include "include.h"

// Global data structures
HeadingData headingData = {0};
AntennaStatus antennaStatus = {0};
GNRMCData gnrmcData = {0};

#ifdef UM982
// Unicore UM982
// Parse UNIHEADINGA message to extract heading and return a formatted string for web clients
char* parseUNIHEADING(char* nmeaLine) {
  static char headingJson[MAXBUF]; // Static buffer to hold the JSON string
  static char buffer[MAXBUF]; // Buffer for modifiable copy
  
  // Create a modifiable copy of the input string
  strncpy(buffer, nmeaLine, MAXBUF - 1);
  buffer[MAXBUF - 1] = '\0'; // Ensure null termination
  
  char* parts = strstr(buffer, ";");
  if (parts != NULL) {
    parts++; // Skip the semicolon
    char* fields = strtok(parts, ",");
    if (fields != NULL) {
      // Skip solStat
      fields = strtok(NULL, ",");
      if (fields != NULL) {
        // Skip posType
        fields = strtok(NULL, ",");
        if (fields != NULL) {
          headingData.heading = atof(fields);
          // Format heading update for web clients
          snprintf(headingJson, sizeof(headingJson), "{\"heading\":%.1f}", headingData.heading);
          return headingJson;
        }
      }
    }
  }
  
  // If we reach here, parsing failed but we'll return a valid JSON with the current heading
  snprintf(headingJson, sizeof(headingJson), "{\"heading\":%.1f}", headingData.heading);
  return NULL; // Return NULL if parsing failed or it's not a UNIHEADINGA message
}
#endif

#ifdef WTRTK
// Quectel LC02HBA
// Parse PQTMANTENNASTATUS message to extract antenna status information
// Sample: $PQTMANTENNASTATUS,2,1,2,2,2*4E
// Format: $PQTMANTENNASTATUS,<MsgVer>,<AntA>,<Reserved>,<AntB>,<Reserved>*
char* parsePQTMANTENNASTATUS(char* nmeaLine) {
  static char statusJson[MAXBUF]; // Static buffer to hold the JSON string
  static char buffer[MAXBUF]; // Buffer for modifiable copy
  
  // Create a modifiable copy of the input string
  strncpy(buffer, nmeaLine, MAXBUF - 1);
  buffer[MAXBUF - 1] = '\0'; // Ensure null termination

  // Remove the checksum part
  char* checksumPtr = strstr(buffer, "*");
  if (checksumPtr) {
    *checksumPtr = '\0'; // Terminate the string at the asterisk
  }
  
  // Parse the NMEA message directly using sscanf
  // Format: $PQTMANTENNASTATUS,<MsgVer>,<AntA>,<Reserved>,<AntB>,<Reserved>*
  char msgId[20];
  int fields = sscanf(buffer, "$%[^,],%*d,%d,%*d,%d,%*d",
                     msgId, &antennaStatus.antAStatus, &antennaStatus.antBStatus);
  
  if (fields < 3) {
    if (debugRTK)
      Serial.printf("parsePQTMANTENNASTATUS parsed a mere %d fields\n", fields);
    // If parsing failed, return formatted JSON with current values
    snprintf(statusJson, sizeof(statusJson),
           "{\"antennaStatus\":{\"primary\":%d,\"secondary\":%d}}",
           antennaStatus.antAStatus, antennaStatus.antBStatus);
    return NULL; // Return NULL to indicate parsing failure
  }
  
  // Format antenna status update for web clients
  snprintf(statusJson, sizeof(statusJson),
           "{\"antennaStatus\":{\"primary\":%d,\"secondary\":%d}}",
           antennaStatus.antAStatus, antennaStatus.antBStatus);
  return statusJson;
}

// Parse PQTMTAR message to extract heading, pitch, roll and related information
// Format: $PQTMTAR,<MsgVer>,<Time>,<Quality>,<Res>,<Length>,<Pitch>,<Roll>,<Heading>,<Acc_Pitch>,<Acc_Roll>,<Acc_Heading>,<UsedSV>*<Checksum><CR><LF>
// Sample: $PQTMTAR,1,221221.000,4,,0.009,-31.372406,66.720642,76.387589,0.009525,0.004112,0.036630,11*79
// Fields: message version, UTC time, quality (0=invalid, 4=RTK fixed, 6=dead reckoning),
//         reserved (null), baseline length, pitch angle, roll angle, heading angle,
//         pitch accuracy, roll accuracy, heading accuracy, number of satellites used
char* parsePQTMTAR(char* nmeaLine) {
  static char tarJson[MAXBUF]; // Static buffer to hold the JSON string
  static char buffer[MAXBUF]; // Buffer for modifiable copy

  strncpy(buffer, nmeaLine, MAXBUF - 1);
  buffer[MAXBUF - 1] = '\0';

  // Remove the checksum part...TBD, actually calculate and verify checksum
  char* checksumPtr = strstr(buffer, "*");
  if (checksumPtr) {
    *checksumPtr = '\0'; // Terminate the string at the asterisk
  }
  // Parse the NMEA message directly into headingData fields
  // Format: $PQTMTAR,<MsgVer>,<Time>,<Quality>,<Res>,<Length>,<Pitch>,<Roll>,<Heading>,<Acc_Pitch>,<Acc_Roll>,<Acc_Heading>,<UsedSV>*
  char msgId[16];
  int msgVer;
  int fields = sscanf(buffer, "$%[^,],%d,%15[^,],%d,,%f,%f,%f,%f,%f,%f,%f,%d",
                     msgId, &msgVer, headingData.utcTime, &headingData.quality,
                     &headingData.length, &headingData.pitch, &headingData.roll,
                     &headingData.heading, &headingData.accPitch, &headingData.accRoll,
                     &headingData.accHeading, &headingData.usedSV);
  if (fields < 8) {
    if (debugRTK)
      Serial.printf("parsePQTMTAR parsed %d fields; a mere pittance!\n", fields);
    return NULL;
  }
  // adjust reported heading for orientation of antennas
  headingData.heading += headingData.RTKorientation;
  snprintf(tarJson, sizeof(tarJson),
           "{\"heading\":%.3f,\"pitch\":%.6f,\"roll\":%.6f,\"quality\":%d,\"utc\":\"%s\",\"length\":%.3f,"
           "\"accPitch\":%.6f,\"accRoll\":%.6f,\"accHeading\":%.1f,\"usedSV\":%d}",
           headingData.heading, headingData.pitch, headingData.roll, headingData.quality,
           headingData.utcTime, headingData.length, headingData.accPitch, headingData.accRoll,
           headingData.accHeading, headingData.usedSV);
  
  return tarJson;
}
#endif

// Parse GNRMC message to extract navigation data
// Format: $GNRMC,<time>,<status>,<lat>,<lat dir>,<lon>,<lon dir>,<speed>,<course>,<date>,<mag var>,<mag dir>,<mode>,<nav status>*<checksum>
// Sample: $GNRMC,012206.000,A,4740.257509,N,12219.454718,W,0.006,340.31,290126,,,A,V*2B
// Fields: UTC time, status (A=valid, V=void), latitude, N/S, longitude, E/W, speed (knots),
//         course over ground (degrees), date (ddmmyy), magnetic variation, E/W, mode indicator, nav status
char* parseGNRMC(char* nmeaLine) {
  static char rmcJson[MAXBUF]; // Static buffer to hold the JSON string
  static char buffer[MAXBUF];  // Buffer for modifiable copy
  
  // Create a modifiable copy of the input string
  strncpy(buffer, nmeaLine, MAXBUF - 1);
  buffer[MAXBUF - 1] = '\0'; // Ensure null termination
  
  // Remove the checksum part
  char* checksumPtr = strstr(buffer, "*");
  if (checksumPtr) {
    *checksumPtr = '\0'; // Terminate the string at the asterisk
  }
  
  // Parse the NMEA message
  char msgId[8];
  char latStr[16], lonStr[16];
  
  int fields = sscanf(buffer, "$%[^,],%15[^,],%c,%15[^,],%c,%15[^,],%c,%f,%f,%6[^,],%f,%c,%c,%c",
                     msgId,
                     gnrmcData.utcTime,
                     &gnrmcData.status,
                     latStr,
                     &gnrmcData.latDir,
                     lonStr,
                     &gnrmcData.lonDir,
                     &gnrmcData.speedKnots,
                     &gnrmcData.course,
                     gnrmcData.date,
                     &gnrmcData.magVar,
                     &gnrmcData.magVarDir,
                     &gnrmcData.modeInd,
                     &gnrmcData.navStatus);
  
  if (fields < 9) { // At minimum we need time, status, lat, lon, speed, course and date
    return NULL;    // Return NULL to indicate parsing failure
  }
  
  // Convert NMEA latitude/longitude format (DDMM.MMMMM) to decimal degrees
  // Latitude: first 2 chars are degrees, rest is minutes
  if (strlen(latStr) > 0) {
    char degStr[3] = {0};
    strncpy(degStr, latStr, 2);
    double degrees = atof(degStr);
    double minutes = atof(latStr + 2);
    gnrmcData.latitude = degrees + (minutes / 60.0);
    if (gnrmcData.latDir == 'S') {
      gnrmcData.latitude = -gnrmcData.latitude;
    }
  }
  
  // Longitude: first 3 chars are degrees, rest is minutes
  if (strlen(lonStr) > 0) {
    char degStr[4] = {0};
    strncpy(degStr, lonStr, 3);
    double degrees = atof(degStr);
    double minutes = atof(lonStr + 3);
    gnrmcData.longitude = degrees + (minutes / 60.0);
    if (gnrmcData.lonDir == 'W') {
      gnrmcData.longitude = -gnrmcData.longitude;
    }
  }
  
  // Format navigation data update for web clients
  snprintf(rmcJson, sizeof(rmcJson),
          "{\"gnrmc\":{\"utc\":\"%s\",\"status\":\"%c\",\"lat\":%.6f,\"lon\":%.6f,\"speed\":%.3f,"
          "\"course\":%.2f,\"date\":\"%s\"}}",
          gnrmcData.utcTime,
          gnrmcData.status,
          gnrmcData.latitude,
          gnrmcData.longitude,
          gnrmcData.speedKnots,
          gnrmcData.course,
          gnrmcData.date);
  
  return rmcJson;
}
