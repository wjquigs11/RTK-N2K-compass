#ifdef N0183
#include "include.h"

//HardwareSerial &NMEA0183Port=Serial1;
#define NMEA0183Port UMserial

tNMEA0183Msg NMEA0183Msg;
tNMEA0183 NMEA0183;

struct tNMEA0183Handler {
  const char *Code;
  void (*Handler)(const tNMEA0183Msg &NMEA0183Msg); 
};

void HandleRMC(const tNMEA0183Msg &NMEA0183Msg);
void HandleGGA(const tNMEA0183Msg &NMEA0183Msg) {}
void HandleHDT(const tNMEA0183Msg &NMEA0183Msg) {}
void HandleUNIHEADINGA(const tNMEA0183Msg &NMEA0183Msg);
void HandlePQTMANTENNASTATUS(const tNMEA0183Msg &NMEA0183Msg);
void HandlePQTMTAR(const tNMEA0183Msg &NMEA0183Msg);
void HandleNMEA0183Msg(const tNMEA0183Msg &NMEA0183Msg);

tNMEA0183Handler NMEA0183Handlers[]={
  {"GGA",&HandleGGA},
  {"HDT",&HandleHDT},
  {"RMC",&HandleRMC},
  {"UNIHEADINGA",&HandleUNIHEADINGA},
  {"PQTMANTENNASTATUS",&HandlePQTMANTENNASTATUS},
  {"PQTMTAR",&HandlePQTMTAR},
  {0,0}
};

void setupNMEA() {
  //NMEA0183Port.begin(4800);
  NMEA0183.SetMessageStream(&NMEA0183Port,3);
  NMEA0183.Open();
  NMEA0183.SetMsgHandler(HandleNMEA0183Msg);
}

void loopNMEA() {
  NMEA0183.ParseMessages();
}

void HandleNMEA0183Msg(const tNMEA0183Msg &NMEA0183Msg) {
  char completeMessage[MAX_NMEA0183_MSG_LEN];
  int iHandler;
  // Find handler
  for (iHandler=0; NMEA0183Handlers[iHandler].Code!=0 && !NMEA0183Msg.IsMessageCode(NMEA0183Handlers[iHandler].Code); iHandler++);
  if (NMEA0183Handlers[iHandler].Code!=0) {
    NMEA0183Handlers[iHandler].Handler(NMEA0183Msg); 
  }
  if (serverStarted && sendNMEA) {
    if (NMEA0183Msg.GetMessage(completeMessage, sizeof(completeMessage))) {
      Serial.println(completeMessage);
      events.send(completeMessage, "message", millis()); // Send raw NMEA message via SSE
    }
  }
}

void HandleRMC(const tNMEA0183Msg &NMEA0183Msg) {
  static char rmcJson[MAXBUF]; // Static buffer to hold the JSON string
  double gpsTime;
  char status;
  double courseDouble;
  double speedDouble;
  unsigned long daysSince1970;
  double variation;
  
  if (NMEA0183ParseRMC_nc(NMEA0183Msg,gpsTime,status,boatData.gnrmcData.latitude,boatData.gnrmcData.longitude,
                             courseDouble, speedDouble, daysSince1970, variation))
    if (status == 'A') {  // valid
      snprintf(boatData.gnrmcData.date,16,"%f",gpsTime);
      boatData.gnrmcData.course = (float)courseDouble;
      boatData.gnrmcData.speedKnots = (float)speedDouble;
      boatData.gnrmcData.magVar = (float)fabs(variation);
      boatData.gnrmcData.magVarDir = (variation >= 0) ? 'E' : 'W';
      boatData.gnrmcData.status = status;
     
      Serial.printf("lat: %2.4f lon: %2.4f date: %s\n", boatData.gnrmcData.latitude, boatData.gnrmcData.longitude, boatData.gnrmcData.date);

    } else Serial.println("Failed to parse RMC or invalid data");
}

// Format: $PQTMANTENNASTATUS,<MsgVer>,<AntA>,<Reserved>,<AntB>,<Reserved>*
// Sample: $PQTMANTENNASTATUS,2,1,2,2,2*4E
bool NMEA0183ParsePQTMANTENNASTATUS_nc(const tNMEA0183Msg &NMEA0183Msg, int &MsgVer, int &AntAStatus, int &AntBStatus) {
  bool result = (NMEA0183Msg.FieldCount() >= 5);

  if (result) {
    MsgVer = atoi(NMEA0183Msg.Field(0));
    AntAStatus = atoi(NMEA0183Msg.Field(1));
    // Skip reserved field at index 2
    AntBStatus = atoi(NMEA0183Msg.Field(3));
    // Skip reserved field at index 4
  }

  return result;
}

void HandlePQTMANTENNASTATUS(const tNMEA0183Msg &NMEA0183Msg) {
  static char statusJson[MAXBUF]; // Static buffer to hold the JSON string
  int msgVer, antAStatus, antBStatus;
  
  if (NMEA0183ParsePQTMANTENNASTATUS_nc(NMEA0183Msg, msgVer, antAStatus, antBStatus)) {
    // Populate boatData fields with the parsed results
    boatData.antennaStatus.msgVer = msgVer;
    boatData.antennaStatus.antAStatus = antAStatus;
    boatData.antennaStatus.antBStatus = antBStatus;
   
    Serial.printf("PQTMANTENNASTATUS: MsgVer=%d, AntA=%d, AntB=%d\n",
                  msgVer, antAStatus, antBStatus);

  } else {
    Serial.println("Failed to parse PQTMANTENNASTATUS");
  }
}

// Format: $PQTMTAR,<MsgVer>,<Time>,<Quality>,<Res>,<Length>,<Pitch>,<Roll>,<Heading>,<Acc_Pitch>,<Acc_Roll>,<Acc_Heading>,<UsedSV>*
// Sample: $PQTMTAR,1,221221.000,4,,0.009,-31.372406,66.720642,76.387589,0.009525,0.004112,0.036630,11*79
bool NMEA0183ParsePQTMTAR_nc(const tNMEA0183Msg &NMEA0183Msg, int &MsgVer, char *UtcTime, int &Quality,
                            float &Length, float &Pitch, float &Roll, float &Heading,
                            float &AccPitch, float &AccRoll, float &AccHeading, int &UsedSV) {
  bool result = (NMEA0183Msg.FieldCount() >= 12);

  if (result) {
    MsgVer = atoi(NMEA0183Msg.Field(0));
    strncpy(UtcTime, NMEA0183Msg.Field(1), 15);
    UtcTime[15] = '\0';
    Quality = atoi(NMEA0183Msg.Field(2));
    // Skip reserved field at index 3
    Length = atof(NMEA0183Msg.Field(4));
    Pitch = atof(NMEA0183Msg.Field(5));
    Roll = atof(NMEA0183Msg.Field(6));
    Heading = atof(NMEA0183Msg.Field(7));
    AccPitch = atof(NMEA0183Msg.Field(8));
    AccRoll = atof(NMEA0183Msg.Field(9));
    AccHeading = atof(NMEA0183Msg.Field(10));
    UsedSV = atoi(NMEA0183Msg.Field(11));
  }

  return result;
}

void HandlePQTMTAR(const tNMEA0183Msg &NMEA0183Msg) {
  static char mtarJson[MAXBUF]; // Static buffer to hold the JSON string
  int msgVer, quality, usedSV;
  char utcTime[16];
  float length, pitch, roll, heading, accPitch, accRoll, accHeading;
  
  if (NMEA0183ParsePQTMTAR_nc(NMEA0183Msg, msgVer, utcTime, quality, length, pitch, roll, heading,
                             accPitch, accRoll, accHeading, usedSV)) {
    // Populate boatData fields with the parsed results
    strncpy(boatData.headingData.utcTime, utcTime, sizeof(boatData.headingData.utcTime) - 1);
    boatData.headingData.utcTime[sizeof(boatData.headingData.utcTime) - 1] = '\0';
    boatData.headingData.quality = quality;
    boatData.headingData.length = length;
    boatData.headingData.pitch = pitch;
    boatData.headingData.roll = roll;
    boatData.headingData.heading = heading + boatData.headingData.RTKorientation; // Apply orientation adjustment
    boatData.headingData.accPitch = accPitch;
    boatData.headingData.accRoll = accRoll;
    boatData.headingData.accHeading = accHeading;
    boatData.headingData.usedSV = usedSV;

    Serial.printf("PQTMTAR: Heading=%.3f, Pitch=%.6f, Roll=%.6f, Quality=%d, UTC=%s\n",
                  boatData.headingData.heading, pitch, roll, quality, utcTime);
  } else {
    Serial.println("Failed to parse PQTMTAR");
  }
}

// Parse UNIHEADINGA message to extract heading and related information
// Real-world format: #UNIHEADINGA,<port>,<sequence>,<idle_time>,<time_status>,<week>,<seconds>,<receiver_status>,<reserved>,<receiver_sw_version>;<solStat>,<posType>,<length>,<heading>,<pitch>,<reserved>,<hdgstddev>,<ptchstddev>,<stn_id>,<#SVs>,<#solnSVs>,<#obs>,<#multi>,<reserved>,<ext_sol_stat>,<galileo_bds3_sig_mask>,<gps_glonass_bds2_sig_mask>*<checksum>
// Example: #UNIHEADINGA,97,GPS,FINE,2190,365174000,0,0,18,12;INSUFFICIENT_OBS,NONE,0.000 0,0.0000,0.0000,0.0000,0.0000,0.0000,"",0,0,0,0,0,00,0,0*ee072604
bool NMEA0183ParseUNIHEADINGA_nc(const tNMEA0183Msg &NMEA0183Msg, char *solStatStr, char *posTypeStr, float &length, float &heading, float &pitch, float &hdgStdDev, float &ptchStdDev, char *stnIdStr, int &numSVs, int &numSolnSVs, int &numObs, int &numMulti, int &extSolStat) {
  char completeMessage[MAX_NMEA0183_MSG_LEN];
  
  // Get the complete message
  if (!NMEA0183Msg.GetMessage(completeMessage, sizeof(completeMessage))) {
    return false;
  }
  
  // Find the semicolon separator
  char* semicolonPos = strchr(completeMessage, ';');
  if (semicolonPos == NULL) {
    return false;
  }
  
  // Move past the semicolon
  semicolonPos++;
  
  // Parse the fields after semicolon - handle both text and numeric values
  char* token = strtok(semicolonPos, ",");
  int fieldIndex = 0;
  
  while (token != NULL && fieldIndex < 17) {
    // Remove checksum if present (for last field)
    char* checksumPos = strchr(token, '*');
    if (checksumPos != NULL) {
      *checksumPos = '\0';
    }
    
    // Remove quotes if present
    if (token[0] == '"' && token[strlen(token)-1] == '"') {
      token[strlen(token)-1] = '\0';
      token++;
    }
    
    switch (fieldIndex) {
      case 0: // Solution status - can be text like "INSUFFICIENT_OBS"
        strncpy(solStatStr, token, 31);
        solStatStr[31] = '\0';
        break;
      case 1: // Position type - can be text like "NONE"
        strncpy(posTypeStr, token, 31);
        posTypeStr[31] = '\0';
        break;
      case 2: // Baseline length - handle malformed "0.000 0"
        {
          char* spacePos = strchr(token, ' ');
          if (spacePos) *spacePos = '\0'; // Truncate at space
          length = atof(token);
        }
        break;
      case 3: heading = atof(token); break;           // Heading (0 to 360.0 degrees)
      case 4: pitch = atof(token); break;             // Pitch (± 90 degrees)
      case 5: /* reserved */ break;                   // Reserved field
      case 6: hdgStdDev = atof(token); break;         // Standard deviation of heading
      case 7: ptchStdDev = atof(token); break;        // Standard deviation of pitch
      case 8: // Base station ID - can be quoted empty string
        strncpy(stnIdStr, token, 31);
        stnIdStr[31] = '\0';
        break;
      case 9: numSVs = atoi(token); break;            // Number of satellites tracked
      case 10: numSolnSVs = atoi(token); break;       // Number of satellites used in solution
      case 11: numObs = atoi(token); break;           // Number of satellites above elevation mask
      case 12: numMulti = atoi(token); break;         // Number of satellites with L2 signal
      case 13: /* reserved */ break;                  // Reserved field
      case 14: extSolStat = atoi(token); break;       // Extended solution status
      case 15: /* galileo_bds3_sig_mask */ break;     // Galileo and BDS-3 signal mask
      case 16: /* gps_glonass_bds2_sig_mask */ break; // GPS, GLONASS and BDS-2 signal mask
    }
    
    token = strtok(NULL, ",");
    fieldIndex++;
  }
  
  // Check if we parsed at least the essential fields (solStat, posType, length, heading, pitch)
  return (fieldIndex >= 5);
}

void HandleUNIHEADINGA(const tNMEA0183Msg &NMEA0183Msg) {
  char solStatStr[32], posTypeStr[32], stnIdStr[32];
  int numSVs, numSolnSVs, numObs, numMulti, extSolStat;
  float length, heading, pitch, hdgStdDev, ptchStdDev;
  
  // Initialize string buffers
  solStatStr[0] = '\0';
  posTypeStr[0] = '\0';
  stnIdStr[0] = '\0';
  
  if (NMEA0183ParseUNIHEADINGA_nc(NMEA0183Msg, solStatStr, posTypeStr, length, heading, pitch, hdgStdDev, ptchStdDev, stnIdStr, numSVs, numSolnSVs, numObs, numMulti, extSolStat)) {
    // Update the boat data with the parsed values
    boatData.headingData.heading = heading + boatData.headingData.RTKorientation; // Apply orientation adjustment
    boatData.headingData.pitch = pitch;
    boatData.headingData.length = length;
    
    // Map solution status text to numeric quality
    int quality = 0;
    if (strcmp(solStatStr, "SOL_COMPUTED") == 0) quality = 4;
    else if (strcmp(solStatStr, "INSUFFICIENT_OBS") == 0) quality = 0;
    else if (strcmp(solStatStr, "NO_CONVERGENCE") == 0) quality = 1;
    else if (strcmp(solStatStr, "SINGULARITY") == 0) quality = 1;
    else if (strcmp(solStatStr, "COV_TRACE") == 0) quality = 2;
    else if (strcmp(solStatStr, "TEST_DIST") == 0) quality = 3;
    else if (strcmp(solStatStr, "COLD_START") == 0) quality = 1;
    else if (strcmp(solStatStr, "V_H_LIMIT") == 0) quality = 2;
    else if (strcmp(solStatStr, "VARIANCE") == 0) quality = 2;
    else if (strcmp(solStatStr, "RESIDUALS") == 0) quality = 3;
    else if (strcmp(solStatStr, "DELTA_POS") == 0) quality = 3;
    else if (strcmp(solStatStr, "NEGATIVE_VAR") == 0) quality = 1;
    else if (strcmp(solStatStr, "INTEGRITY_WARNING") == 0) quality = 5;
    else if (strcmp(solStatStr, "INS_INACTIVE") == 0) quality = 6;
    else if (strcmp(solStatStr, "INS_ALIGNING") == 0) quality = 6;
    else if (strcmp(solStatStr, "INS_BAD") == 0) quality = 1;
    else if (strcmp(solStatStr, "IMU_UNPLUGGED") == 0) quality = 0;
    
    boatData.headingData.quality = quality;
    boatData.headingData.usedSV = numSolnSVs; // Number of satellites used in solution
    boatData.headingData.accHeading = hdgStdDev; // Standard deviation as accuracy
    boatData.headingData.accPitch = ptchStdDev;
    
    Serial.printf("UNIHEADINGA: Heading=%.4f° (adj=%.4f°), Pitch=%.4f°, Length=%.3fm, SolStat=%s, PosTy=%s, SVs=%d/%d, Stn=%s\n",
                  heading, boatData.headingData.heading, pitch, length, solStatStr, posTypeStr, numSolnSVs, numSVs, stnIdStr);
  } else {
    Serial.println("Failed to parse UNIHEADINGA");
  }
}

#endif