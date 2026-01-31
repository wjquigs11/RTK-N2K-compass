#include <WiFi.h>
#include <Preferences.h>
#include <vector>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESPmDNS.h>
#include <SPIFFS.h>

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

extern HardwareSerial UMserial;

#define HTTP_PORT 80
extern AsyncWebServer server;
extern AsyncEventSource events;
void startWebServer();
extern bool serverStarted;
//void sendNMEAtoWebClients(const char* nmeaLine);
//char* parseUNIHEADING(const char* nmeaLine);
//char* parsePQTMANTENNASTATUS(const char* nmeaLine);
//char* parsePQTMTAR(const char* nmeaLine);
extern String host;

void sendNMEAtoWebClients(char* nmeaLine);
char* parseUNIHEADING(char* nmeaLine);
char* parsePQTMANTENNASTATUS(char* nmeaLine);
char* parsePQTMTAR(char* nmeaLine);
char* parseGNRMC(char* nmeaLine);

#define RTK_PORT 4444
extern int port; // TCP port for the server, can be modified via settings page
extern WiFiServer tcpServer; // TCP server instance

extern int uniHeadStatusNum;

#define PRBUF 192
extern char prbuf[];

#define MAXBUF 192  // some sentences can be long
extern char nmeaBuffer[];

extern HeadingData headingData;  // Global heading data structure
extern GNRMCData gnrmcData;      // Global GNRMC data structure

#define DEGTORAD 0.01745329252
#define RADTODEG 57.2957795131

#ifdef N2K
void setupN2K();
void xmitHeading(float);
#endif
extern bool n2kSend;

#ifdef WEBSERIAL
#include <WebSerialPro.h>
void WebSerialonMessage(uint8_t *data, size_t len);
extern const char* appCommandList[];
extern const char* appToggleList[];
using Handler = void(*)(String*, int);
extern Handler appHandler;
extern Handler togHandler;
#endif

// SPIFFS functions
void readspiffs();

extern bool debugRTK;
#ifdef ELEGANTOTA
#include <ElegantOTA.h>
#endif