#include <WiFi.h>
#include <Preferences.h>
#include <vector>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

// Data structure to represent heading data from PQTMTAR and UNIHEADING
struct HeadingData {
  float heading;       // True heading in degrees
  int RTKorientation;  // orientation adjustment for GPS antennas
  float pitch;         // Pitch angle in degrees (from PQTMTAR)
  float roll;          // Roll angle in degrees (from PQTMTAR)
  int quality;         // Quality indicator (0=invalid, 4=RTK fixed, 6=dead reckoning)
  char utcTime[16];    // UTC time string
  float length;        // Baseline length
  float accPitch;      // Pitch accuracy
  float accRoll;       // Roll accuracy
  float accHeading;    // Heading accuracy
  int usedSV;          // Number of satellites used
};

// Data structure to represent antenna status from PQTMANTENNASTATUS
struct AntennaStatus {
  int msgVer;          // Message version (always 2 for this version)
  int antAStatus;      // GNSS antenna A status: 0=Unknown, 1=Normal, 2=Open circuit, 3=Short circuit
  int antBStatus;      // GNSS antenna B status: 0=Unknown, 1=Normal, 2=Open circuit, 3=Short circuit
};

// Data structure to represent GNRMC (Recommended Minimum Navigation Information)
struct GNRMCData {
  char utcTime[16];      // UTC time (hhmmss.sss)
  char status;           // Status: A=valid, V=invalid
  double latitude;       // Latitude in decimal degrees
  char latDir;           // Latitude direction: N=north, S=south
  double longitude;      // Longitude in decimal degrees
  char lonDir;           // Longitude direction: E=east, W=west
  float speedKnots;      // Speed over ground in knots
  float course;          // Course over ground in degrees
  char date[7];          // Date (ddmmyy)
  float magVar;          // Magnetic variation in degrees (optional)
  char magVarDir;        // Magnetic variation direction: E=east, W=west (optional)
  char modeInd;          // Mode indicator (optional)
  char navStatus;        // Navigational status (optional)
};

struct tBoatData {
  unsigned long DaysSince1970;   // Days since 1970-01-01
  double TrueHeading,SOG,COG,Variation,
         GPSTime,// Secs since midnight,
         Latitude, Longitude, Altitude, HDOP, GeoidalSeparation, DGPSAge;
  int GPSQualityIndicator, SatelliteCount, DGPSReferenceStationID;
  bool MOBActivated;
  HeadingData headingData;
  float THS;
  float HPR;
  GNRMCData gnrmcData;
  AntennaStatus antennaStatus;
};

//extern HeadingData headingData;  // Global heading data structure
//extern GNRMCData gnrmcData;      // Global GNRMC data structure
extern tBoatData boatData;

extern HardwareSerial UMserial;

#define HTTP_PORT 80
extern AsyncWebServer server;
extern AsyncEventSource events;
void startWebServer();
extern bool serverStarted;
extern String host;

// Forward declarations
void setupUMsender();
void initUMSocket();
void notifyTCPclients(const char* data);
void handleTCPConnections();

#define RTK_PORT 4444
extern int port; // TCP port for the server, can be modified via settings page
extern WiFiServer tcpServer; // TCP server instance

extern int uniHeadStatusNum;

#define PRBUF 192
extern char prbuf[];

#define MAXBUF 192  // some sentences can be long
extern char nmeaBuffer[];

#define DEGTORAD 0.01745329252
#define RADTODEG 57.2957795131

extern bool sendNMEA;
extern bool sendJSON;

#ifdef N2K
#include <N2kMsg.h>
#include <NMEA2000.h>
#include <N2kMessages.h>
#include <NMEA2000_esp32.h>
void setupN2K();
void xmitHeading(float);
#endif
extern bool n2kSend;

#ifdef N0183
#include <NMEA0183.h>
#include <NMEA0183Msg.h>
#include <NMEA0183Messages.h>
//#include "NMEA0183Handlers.h"
//void InitNMEA0183Handlers(tNMEA2000 *_NMEA2000, tBoatData *_BoatData);
//void DebugNMEA0183Handlers(Stream* _stream);
//void HandleNMEA0183Msg(const tNMEA0183Msg &NMEA0183Msg);
void setupNMEA();
void loopNMEA();
#endif

#ifdef WEBSERIAL
#include <WebSerialPro.h>
void WebSerialonMessage(uint8_t *data, size_t len);
extern const char* appCommandList[];
extern const char* appToggleList[];
using Handler = void(*)(String*, int);
extern Handler appHandler;
extern Handler togHandler;
#endif

// LittleFS functions
void readlittlefs();

extern bool debugRTK;
#ifdef ELEGANTOTA
#include <ElegantOTA.h>
#endif