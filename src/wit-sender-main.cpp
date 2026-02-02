#include "include.h"

tBoatData boatData = {0};

#define MAXLEN 64
char prbuf[PRBUF];

//#define FIRSTRUN
#ifdef FIRSTRUN
String ssid = "yourSSID";
String pass = "yourPassword";
String host = "yourHostname";
#else
String ssid;
String pass;
String host;
#endif

// Double reset detection
Preferences preferences;
bool doubleReset = false;
#define DRD_TIMEOUT 20  // Double reset detection timeout in seconds
#define WIFI_TIMEOUT 60

#ifdef UM982
// HEADING2 mode appears to be the *only* mode applicable when both antennas are on a moving platform (boat)
// i.e. fixed with respect to each other and both in motion (no base/rover)
// MODE HEADING2 FIXLENGTH
// CONFIG HEADING LENGTH 117 10
// We push these commands at setup()
// Unfortunately some like "GPGSVH" are not "sticky" and don't persist even after SAVECONFIG
// so might as well push all the reporting commands
const char* startupRTKcommands[] = {
  "GPGSV 10",
  "GPGSVH 10",
  "UNIHEADINGA 10",
  "GNGGA 10",
  //"GPHPR 10",
  "GPTHS 0.5",
  "MODE",
  "SAVECONFIG",
  ""
};
#endif
#ifdef WTRTK
// Quectel commands must have checksum so they need to look like "real" NMEA0183 sentences
const char* startupRTKcommands[] = {
  "$PQTMVERNO*",  // $PQTMVERNO,LC02HBANR01A01S_CLQ,2024/04/23,16:07:36*39
  "$PQTMCFGCNST,R*",  // constellation status
  "$PQTMCFGBLD,R*", // baseline
  //"$PQTMRESTOREPAR*", // restore all parameters
  "$PQTMCFGMSGRATE,W,GSV,20*",  // GSV (sat in view) output rate to every 20 position fixes
  "$PQTMCFGMSGRATE,W,GSA,20*",  // GSA (satellites used in fix)
  "$PQTMCFGMSGRATE,W,RMC,10*",  // navigation info
  "$PQTMCFGMSGRATE,W,PQTMANTENNASTATUS,20,2*",  // antenna status
  "$PQTMCFGMSGRATE,W,PQTMTAR,1,1*", // attitude
  "$PQTMSAVEPAR*",
  "$PQTMCFGMSGRATE,R,GSV*", // get GSV output rate
  "$PQTMCFGMSGRATE,R,GSA*", 
  ""
};
#endif
const int startupRTKcommandsLength = sizeof(startupRTKcommands) / sizeof(startupRTKcommands[0]);

// minimum frequency to send SSE messages (seconds) so we don't overload asyncTCP
int SSEfrequency=1;
unsigned long now;

// Global heading data structure is defined in parsers.cpp
//extern HeadingData headingData;

//bool debugRTK = true; // echo RTK to serial
bool otaInProgress = false;  // Flag to indicate OTA update is in progress
#define MAX_NMEA 256

HardwareSerial UMserial(1);
#define RX 26
#define TX 25
#define BAUD 115200

// TCP Socket variables
int port=RTK_PORT;
WiFiServer tcpServer;
std::vector<WiFiClient> tcpClients;
const int MAX_CLIENTS = 10;

// NMEA sentence buffering variables
char nmeaBuffer[MAXBUF];
int nmeaBufferIndex = 0;
bool inSentence = false;

bool sendNMEA = true; // send NMEA to web/TCP clients?

void setup() {
  Serial.begin(115200); delay(333);
  preferences.begin("ESPprefs", false);
  doubleReset = preferences.getBool("DRD", false);
  preferences.putBool("DRD", true);
  if (doubleReset) {
    Serial.println("Double reset detected - entering OTA-only mode");
    preferences.putBool("DRD", false);
  } else {
    // Set up DRD if another reboot happens in 10 seconds
    preferences.putBool("DRD", true);
  }
  if (LittleFS.begin()) {
    Serial.println("opened LittleFS");
    readlittlefs();
  } else {
    Serial.println("failed to open LittleFS");
  }
  Serial.println("Starting WiFi connection...");
#ifdef FIRSTRUN
  preferences.putString("ssid",ssid);
  ssid = preferences.getString("ssid");
  Serial.printf("ssid = %s\n",ssid);
  preferences.putString("pass",pass);
  preferences.putString("host",host);
#else
  ssid = preferences.getString("ssid");
  Serial.printf("ssid = %s\n",ssid);
  pass = preferences.getString("pass");
  host = preferences.getString("host","wit");
#endif
  preferences.end();
  if (ssid.isEmpty()) {
    Serial.println("no SSID in preferences");
  } else {
    WiFi.begin(ssid, pass);
    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED) {
      delay(1000);
      Serial.print(".");
      if ((WiFi.status() != WL_CONNECTED) && ((millis() - startTime) > (WIFI_TIMEOUT * 1000))) {
        preferences.putBool("DRD", false);
        Serial.println("WiFi disconnected for too long. Restarting ESP32...");
        ESP.restart();
      }
    }
    Serial.println();
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    Serial.printf("Starting MDNS with hostname: %s\n",host);
    if (!MDNS.begin(host)) {
      Serial.println(F("Error starting MDNS responder"));
    } else {
      Serial.printf("MDNS started successfully as %s.local\n",host);
      if (!MDNS.addService("http", "tcp", HTTP_PORT)) {
        Serial.println("MDNS add service failed");
      } else {
        Serial.println("MDNS service added successfully");
      }
    }
    startWebServer();
#ifdef ELEGANTOTA
    ElegantOTA.onStart([]() {
      Serial.println("OTA update started");
      otaInProgress = true;  // Stop other processes
    });
    server.begin();
    ElegantOTA.begin(&server);
#endif
#ifdef ARDUINOOTA
    ArduinoOTA.onStart([]() {
      otaInProgress = true;
      Serial.println("Starting Arduino OTA");
      // Stop TCP clients and server
      for (auto& client : tcpClients) {
          if (client.connected()) {
              client.println("OTA update starting - disconnecting");
              client.stop();
          }
      }
      tcpClients.clear();
      tcpServer.stop();
      // Clear buffers
      nmeaBufferIndex = 0;
      events.close();
    });
    ArduinoOTA.setHostname(host);
    ArduinoOTA.setPassword("admin");
    ArduinoOTA.begin();
#endif
    Serial.println("OTA Ready");
  }
  // Initialize UM serial and TCP socket only if not in double reset mode
  if (!doubleReset) {
    setupUMsender();
#ifdef N0183
    setupNMEA();
#endif
  } else {
    Serial.println("Skipping TCP server initialization...DRD");
  }
#ifdef N2K
  setupN2K();
#endif
}

byte calculateNMEAChecksum(const char* sentence) {
  byte checksum = 0;
  // start after the '$' and continue until '*' or end of string
  for (int i = 1; sentence[i] != '\0' && sentence[i] != '*'; i++) {
    //Serial.printf("%c(%d)[%d] ", sentence[i], sentence[i], checksum);
    checksum ^= sentence[i];
  }
  //Serial.printf("\n d:%d x:%02X\n",checksum,checksum);
  return checksum;
}

// Initialize TCP socket server
void initUMSocket() {
  if (WiFi.status() == WL_CONNECTED) {
    tcpServer.begin(port);
    Serial.println("TCP server started on port " + String(port));
    Serial.println("Waiting for TCP clients to connect...");
  }
}

void setupUMsender() {
  UMserial.begin(BAUD, SERIAL_8N1, RX, TX);
  Serial.println("Starting UM Serial TCP Bridge");
  Serial.println("UMserial configured on RX: " + String(RX) + ", TX: " + String(TX) + ", BAUD: " + String(BAUD));
  initUMSocket();
  Serial.println("Sending initalization commands:");
  char command[MAXLEN];
  for (int i=0; i<startupRTKcommandsLength; i++) {
#ifdef WTRTK
    int cksum = calculateNMEAChecksum(startupRTKcommands[i]);
    snprintf(command,MAXLEN,"%s%02X",startupRTKcommands[i],cksum);
    Serial.println(command);
#else
    strcpy(command,startupRTKcommands[i]);
#endif
    UMserial.println(command);
    notifyTCPclients(command);
  }
  Serial.println("UM-sender setup complete");
#ifdef WEBSERIAL
  WebSerial.begin(&server);
  //WebSerial.onMessage(WebSerialonMessage);
#endif
}

void notifyTCPclients(const char* data) {
  // Clean up disconnected clients
  for (int i = tcpClients.size() - 1; i >= 0; i--) {
    if (!tcpClients[i].connected()) {
      Serial.println("TCP client disconnected");
      tcpClients[i].stop();
      tcpClients.erase(tcpClients.begin() + i);
    }
  }
  // Send data to all connected clients
  for (auto& client : tcpClients) {
    if (client.connected()) {
      client.println(data);
      client.flush(); // no buffering
    }
  }
}

void handleTCPConnections() {
  WiFiClient newClient = tcpServer.available();
  if (newClient) {
    if (tcpClients.size() < MAX_CLIENTS) {
      tcpClients.push_back(newClient);
      Serial.println("New TCP client connected from " + newClient.remoteIP().toString() + ":" + String(newClient.remotePort()));
      Serial.println("Total connected clients: " + String(tcpClients.size()));
#ifdef WEBSERIAL
      WebSerial.println("New TCP client connected from " + newClient.remoteIP().toString() + ":" + String(newClient.remotePort()));
      WebSerial.println("Total connected clients: " + String(tcpClients.size()));
#endif
    } else {
      Serial.println("Maximum clients reached, rejecting connection");
      newClient.stop();
    }
  }
}

void loop() {
  static bool drdCleared = false;
  static unsigned long lastDotTime = 0;
  static int remainingSeconds = DRD_TIMEOUT;
  
  now = millis();
  if (doubleReset && !drdCleared) {
    if (now - lastDotTime >= 1000) {
      Serial.printf("%d ", remainingSeconds);
      remainingSeconds--;
      lastDotTime = now;
    }
  }
  // Clear DRD flag after DRD_TIMEOUT seconds for all boot scenarios
  if (!drdCleared && (now > (DRD_TIMEOUT * 1000))) {
    preferences.begin("ESPprefs", false);
    preferences.putBool("DRD", false);
    preferences.end();
    drdCleared = true;
    Serial.println("DRD timeout - cleared double reset flag");
    // If we were in doubleReset mode, now start the TCP server
    if (doubleReset) {
      doubleReset = false;
      Serial.println("Starting TCP server after DRD timeout");
      setupUMsender();
    }
  }
  // Handle UM serial communication and TCP clients only if OTA is not in progress and not in doubleReset mode
  if (!otaInProgress && !doubleReset) {
    handleTCPConnections();
#ifdef N0183
    loopNMEA();
#endif
#ifdef WEBSERIAL
    WebSerial.loop();
#endif
  }
  if (Serial.available()) {
    String inputLine = Serial.readStringUntil('\n');
    inputLine.trim(); // Remove any trailing whitespace
    
    if (inputLine.length() > 0) {
      // Create NMEA sentence with $ at beginning and * at end
      String nmeaSentence = "$" + inputLine + "*";
      
      // Calculate checksum
      int cksum = calculateNMEAChecksum(nmeaSentence.c_str());
      
      // Create final command with checksum
      char command[MAXLEN];
      snprintf(command, MAXLEN, "%s%02X", nmeaSentence.c_str(), cksum);
      
      Serial.printf("sending: %s\n", command);
      UMserial.println(command);
    }
  }
#ifdef ARDUINOOTA
  ArduinoOTA.handle();
#endif
#ifdef ELEGANTOTA
  ElegantOTA.loop();
#endif
  // SSE connections are managed automatically by AsyncEventSource
}