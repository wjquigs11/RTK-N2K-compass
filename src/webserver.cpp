#include "include.h"

AsyncWebServer server(HTTP_PORT);
AsyncEventSource events("/events");

bool serverStarted;

void startWebServer() {
  Serial.println("starting web server");

  server.on("/", HTTP_GET, [](AsyncWebServerRequest * request) {
    Serial.println("index.html");
    request->send(LittleFS, "/index.html", "text/html; charset=UTF-8");
  });

  server.on("/compass", HTTP_GET, [](AsyncWebServerRequest * request) {
    Serial.println("compass.html");
    request->send(LittleFS, "/compass.html", "text/html; charset=UTF-8");
  });

  server.on("/settings.html", HTTP_GET, [](AsyncWebServerRequest * request) {
    Serial.println("settings.html");
    request->send(LittleFS, "/settings.html", "text/html; charset=UTF-8");
  });

  server.on("^.*\\.png$", HTTP_GET, [](AsyncWebServerRequest *request){
    Serial.println("Serving PNG: " + request->url());
    request->send(LittleFS, request->url(), "image/png");
  });

  // Set up static file serving with content type mapping for HTML files
  server.serveStatic("/", LittleFS, "/")
    .setDefaultFile("index.html");
    //.setTemplateProcessor([](const String& var) -> String {
    //  return String();
    //});
  
  // Add content type mapping for HTML files and CORS headers
  //DefaultHeaders::Instance().addHeader("Content-Type", "text/html; charset=UTF-8");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Credentials", "true");
  
  // Heading data is now sent via SSE events only

  server.on("/commands", HTTP_POST, [](AsyncWebServerRequest * request) {}, NULL,
    [](AsyncWebServerRequest * request, uint8_t *data, size_t len, size_t index, size_t total) {
      String command = "";
      for (size_t i = 0; i < len; i++) {
        command += (char)data[i];
      }
      command.trim();
      
      if (command.length() > 0) {
        Serial.println("Web command received: " + command);
        UMserial.println(command);
        request->send(200, "text/plain", "Command sent: " + command);
      } else {
        request->send(400, "text/plain", "Empty command");
      }
    });

  // Add settings endpoint for GET and POST
  server.on("/settings", HTTP_GET, [](AsyncWebServerRequest * request) {
    char settingsJson[100];
    snprintf(settingsJson, sizeof(settingsJson), "{\"port\":%d,\"n2kSend\":%s}", port, n2kSend ? "true" : "false");
    request->send(200, "application/json", settingsJson);
  });

  server.on("/settings", HTTP_POST, [](AsyncWebServerRequest * request) {}, NULL,
    [](AsyncWebServerRequest * request, uint8_t *data, size_t len, size_t index, size_t total) {
      String jsonData = "";
      for (size_t i = 0; i < len; i++) {
        jsonData += (char)data[i];
      }
      int newPort = 0;
      int portPos = jsonData.indexOf("\"port\":");
      if (portPos >= 0) {
        int valueStart = portPos + 7; // Length of "\"port\":"
        int valueEnd = jsonData.indexOf(",", valueStart);
        if (valueEnd < 0) valueEnd = jsonData.indexOf("}", valueStart);
        if (valueEnd > valueStart) {
          String portValue = jsonData.substring(valueStart, valueEnd);
          portValue.trim();
          newPort = portValue.toInt();
        }
      }
      // Extract n2kSend value
      bool newN2kSend = n2kSend;
      int n2kPos = jsonData.indexOf("\"n2kSend\":");
      if (n2kPos >= 0) {
        int valueStart = n2kPos + 10; // Length of "\"n2kSend\":"
        int valueEnd = jsonData.indexOf(",", valueStart);
        if (valueEnd < 0) valueEnd = jsonData.indexOf("}", valueStart);
        if (valueEnd > valueStart) {
          String n2kValue = jsonData.substring(valueStart, valueEnd);
          n2kValue.trim();
          newN2kSend = (n2kValue == "true");
        }
      }
      bool valid = true;
      String message = "";
      if (newPort < 1 || newPort > 65535) {
        valid = false;
        message = "Invalid port number";
      }
      if (valid) {
        // Update port if changed
        if (port != newPort) {
          port = newPort;
          Serial.println("TCP port updated to: " + String(port));
          // Restart TCP server with new port
          tcpServer.end();
          tcpServer.begin(port);
        }
        // Update n2kSend if changed
        if (n2kSend != newN2kSend) {
          n2kSend = newN2kSend;
          Serial.println("NMEA 2000 Heading transmission set to: " + String(n2kSend ? "ON" : "OFF"));
        }
        request->send(200, "application/json", "{\"success\":true,\"port\":" + String(port) + ",\"n2kSend\":" + (n2kSend ? "true" : "false") + "}");
      } else {
        request->send(400, "application/json", "{\"success\":false,\"message\":\"" + message + "\"}");
      }
    });

  server.on("/host", HTTP_GET, [](AsyncWebServerRequest * request) {
    request->send(200, "text/plain", host);
  });

  // Set headers for SSE
  DefaultHeaders::Instance().addHeader("Cache-Control", "no-cache");
  DefaultHeaders::Instance().addHeader("Connection", "keep-alive");
  
  events.onConnect([](AsyncEventSourceClient *client){
    if(client->lastId()){
      Serial.printf("SSE client reconnected! Last message ID that it got is: %u\n", client->lastId());
    }
    client->send("hello!", NULL, millis(), 1000);
  });
  server.addHandler(&events);
  
  server.begin();
  Serial.println("Web server started on port " + String(HTTP_PORT));
  serverStarted = true;
}

