#include "include.h"

void readlittlefs() {
    Serial.println("=== LittleFS File System Contents ===");
    
    // Open the root directory
    File root = LittleFS.open("/");
    if (!root) {
        Serial.println("Failed to open root directory");
        return;
    }
    
    if (!root.isDirectory()) {
        Serial.println("Root is not a directory");
        return;
    }
    
    // List all files in LittleFS
    Serial.println("Files found on LittleFS:");
    File file = root.openNextFile();
    while (file) {
        if (file.isDirectory()) {
            Serial.printf("  DIR: %s\n", file.name());
        } else {
            Serial.printf("  FILE: %s (size: %d bytes)\n", file.name(), file.size());
        }
        file = root.openNextFile();
    }
    
    Serial.println("\n=== Reading index.html ===");
    
    // Open and read index.html specifically
    File indexFile = LittleFS.open("/index.html", "r");
    if (!indexFile) {
        Serial.println("Failed to open index.html");
        return;
    }
    
    Serial.printf("index.html file size: %d bytes\n", indexFile.size());
    Serial.println("Contents of index.html:");
    Serial.println("----------------------------------------");
    
    // Read and print the entire contents of index.html
    while (indexFile.available()) {
        Serial.write(indexFile.read());
    }
    
    Serial.println("\n----------------------------------------");
    Serial.println("End of index.html contents");
    
    indexFile.close();
    Serial.println("=== LittleFS reading complete ===\n");
}