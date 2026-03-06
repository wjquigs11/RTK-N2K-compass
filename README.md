# RTK Sender

ESP32-based NMEA data bridge for RTK GPS receivers with web interface and TCP streaming.

## Overview

This project turns an ESP32 into a network bridge for RTK GPS receivers (Unicore UM982 or WitMotion WTRTK), streaming NMEA sentences over TCP and providing a web-based management interface.

RTK GPS sensors rely on L1/L2/L5 GNSS bands. If you're old enough to remember state-of-the-art 12-channel GPS receivers that cost $700 around 2001, you'll be astounded at the UM982's 1408 channels. These sensors also use every constallation in orbit: GPS, BDS, GLONASS, Galileo, and QZSS. Obviously this gives precise, sub-cm positioning (which, to be fair, isn't particularly important on a boat). But when you add a second antenna, the sensor can calculate the phase difference between signals from a subset of satellites, which indicates the relative position of the two antennas, with respect to each other. This means the sensor can determine heading to tenths or hundredths of a degree, which enables accuracy in determining true wind direction that was previously only available from fluxgate compasses costing thousands of dollars.

## Hardware

- ESP32 DevKit v1
- RTK GPS receiver (UM982 or WTRTK)
- Serial connection: RX=GPIO26, TX=GPIO25, 115200 baud. Configure in rtk-sender-main.cpp

## Quick Start

1. Configure WiFi credentials in rtk-sender-main.cpp and add #define FIRSTRUN or uncomment in platformio.ini
2. Build
3. Upload firmware: `pio run -t upload`
4. Upload filesystem: `pio run -t uploadfs`
5. Access web interface at `http://[hostname].local`
6. Stream NMEA data: `nc [hostname].local 4444`

## Configuration

Edit `data/startup.json` to customize RTK receiver initialization commands. Default commands are used if file is not present.

## Build Flags

- `FIRSTRUN` - Write wifi credentials to preferences.
- `N0183` - NMEA 0183 support
- `UM982` - UM982 receiver support
- `WTRTK` - WTRTK receiver support
- `WEBSERIAL` - Enable web serial console
- `ELEGANTOTA` - Enable OTA updates

## License

See LICENSE file for details.
