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
void HandlePQTMANTENNASTATUS(const tNMEA0183Msg &NMEA0183Msg);
void HandlePQTMTAR(const tNMEA0183Msg &NMEA0183Msg);
void HandleNMEA0183Msg(const tNMEA0183Msg &NMEA0183Msg);

tNMEA0183Handler NMEA0183Handlers[]={
  {"GGA",&HandleGGA},
  {"HDT",&HandleHDT},
  {"RMC",&HandleRMC},
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
      ws.textAll(completeMessage); // Send raw NMEA message via WebSocket  
    }
  }
}

void HandleRMC(const tNMEA0183Msg &NMEA0183Msg) {  
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
#endif