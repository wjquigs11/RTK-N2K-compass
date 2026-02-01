bool n2kSend = false;
#ifdef N2K
#include "include.h"

#define CAN_RX_PIN GPIO_NUM_34
#define CAN_TX_PIN GPIO_NUM_32

tNMEA2000 *nmea2000;
int num_n2k_xmit, num_n2k_fail;
tN2kMsg n2kMsg;

void setupN2K() {
  // instantiate the NMEA2000 object
  nmea2000 = new tNMEA2000_esp32(CAN_TX_PIN, CAN_RX_PIN);
  Serial.println("starting CAN");
  nmea2000->SetN2kCANSendFrameBufSize(250);
  // Set Product information
  nmea2000->SetProductInformation(
      "20260131",  // Manufacturer's Model serial code (max 32 chars)
      99,         // Manufacturer's product code
      "NMEA 2000 RTK Compass",  // Manufacturer's Model ID (max 33 chars)
      "0.1.0.0 (2026-01-31)",  // Manufacturer's Software version code (max 40 chars)
      "0.0.0.1 (2026-01-31)"   // Manufacturer's Model version (max 24 chars)
  );
  // Set device information
  nmea2000->SetDeviceInformation(
      20260131,    // Unique number. Use e.g. Serial number.
      129,  // Device function=Heading Sensor
      64,   // Device class=Electronic Heading Sensor
      2999  // Just choosen free from code list on
            // http://www.nmea.org/Assets/20121020%20nmea%202000%20registration%20list.pdf
  );
  nmea2000->SetMode(tNMEA2000::N2km_NodeOnly);
  nmea2000->Open();
}

void xmitHeading(float heading) {
  if (nmea2000 != NULL) {
    SetN2kPGN127250(n2kMsg, 255, heading*DEGTORAD, 0, 0, N2khr_true);
    if (nmea2000->SendMsg(n2kMsg)) num_n2k_xmit++; else num_n2k_fail++;
  }
}
#endif
