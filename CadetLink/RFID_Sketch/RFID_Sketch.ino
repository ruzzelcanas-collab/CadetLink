#include <SPI.h>
#include <MFRC522.h>
#include <LiquidCrystal.h>
#include <EEPROM.h>
#include <string.h>

#define SS_PIN  10
#define RST_PIN 9

// Arduino Mega pins reserved for the 16x2 LCD's 4-bit interface.
const int LCD_RS_PIN = 22;
const int LCD_ENABLE_PIN = 23;
const int LCD_D4_PIN = 24;
const int LCD_D5_PIN = 25;
const int LCD_D6_PIN = 26;
const int LCD_D7_PIN = 27;

MFRC522 rfid(SS_PIN, RST_PIN);
LiquidCrystal lcd(LCD_RS_PIN, LCD_ENABLE_PIN, LCD_D4_PIN, LCD_D5_PIN, LCD_D6_PIN, LCD_D7_PIN);

const int BTN_MARINERS_PIN = 2;
const int BTN_ACADEMIC_PIN = 3;
const unsigned long debounceDelay = 200;
const int EEPROM_WELCOME_ADDRESS = 0;
const uint16_t EEPROM_WELCOME_MAGIC = 0xCA7E;
const size_t LCD_NAME_LENGTH = 16;

struct SavedWelcome {
  uint16_t magic;
  char name[LCD_NAME_LENGTH + 1];
};

unsigned long lastDebounceTime1 = 0;
unsigned long lastDebounceTime2 = 0;
bool lastState1 = HIGH;
bool lastState2 = HIGH;

String serialCommandBuffer;
String pendingWelcomeName;
unsigned long welcomeDisplayAt = 0;
bool welcomePending = false;

void setup() {
  Serial.begin(9600);
  while (!Serial) { ; }

  SPI.begin();
  rfid.PCD_Init();
  setupEmergencyButtons();

  lcd.begin(16, 2);
  restoreWelcomeMessage();

  Serial.println("=========================================");
  Serial.println("  CadetLink RFID Reader Ready (Arduino Mega)");
  Serial.println("  Scan card to read UID over USB...");
  Serial.println("=========================================");
  Serial.println("LCD_READY");
}

void loop() {
  checkEmergencyButtons();
  readLcdCommands();
  showWelcomeWhenReady();

  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  String uidString = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) {
      uidString += "0";
    }
    uidString += String(rfid.uid.uidByte[i], HEX);
  }
  uidString.toUpperCase();
  Serial.println(uidString);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

void readLcdCommands() {
  while (Serial.available() > 0) {
    const char incoming = (char)Serial.read();
    if (incoming == '\r') {
      continue;
    }
    if (incoming == '\n') {
      handleLcdCommand(serialCommandBuffer);
      serialCommandBuffer = "";
      continue;
    }

    serialCommandBuffer += incoming;
    if (serialCommandBuffer.length() > 120) {
      serialCommandBuffer = "";
    }
  }
}

void handleLcdCommand(const String& line) {
  if (!line.startsWith("LCD|")) {
    return;
  }

  const int commandEnd = line.indexOf('|', 4);
  const String command = commandEnd < 0 ? line.substring(4) : line.substring(4, commandEnd);
  const String name = commandEnd < 0 ? "" : line.substring(commandEnd + 1);

  if (command == "HOME") {
    welcomePending = false;
    clearSavedWelcome();
    showCenteredMessage("CadetLink", "");
  } else if (command == "SIGNUP") {
    welcomePending = false;
    showCenteredMessage("Sign up", "");
  } else if (command == "LOGIN_SUCCESS") {
    showCenteredMessage("Login", "Successful");
    pendingWelcomeName = saveWelcomeName(name);
    welcomeDisplayAt = millis() + 3000;
    welcomePending = true;
  } else if (command == "SIGNUP_SUCCESS") {
    showCenteredMessage("Sign up", "Successful");
    pendingWelcomeName = saveWelcomeName(name);
    welcomeDisplayAt = millis() + 3000;
    welcomePending = true;
  } else if (command == "WELCOME") {
    welcomePending = false;
    showCenteredMessage("Welcome", saveWelcomeName(name));
  }
}

String saveWelcomeName(const String& name) {
  String displayName = name;
  displayName.trim();
  if (displayName.length() > LCD_NAME_LENGTH) {
    displayName = displayName.substring(0, LCD_NAME_LENGTH);
  }

  SavedWelcome savedWelcome = {};
  savedWelcome.magic = EEPROM_WELCOME_MAGIC;
  displayName.toCharArray(savedWelcome.name, sizeof(savedWelcome.name));

  SavedWelcome currentWelcome;
  EEPROM.get(EEPROM_WELCOME_ADDRESS, currentWelcome);
  if (currentWelcome.magic != savedWelcome.magic
      || strncmp(currentWelcome.name, savedWelcome.name, sizeof(savedWelcome.name)) != 0) {
    EEPROM.put(EEPROM_WELCOME_ADDRESS, savedWelcome);
  }
  return displayName;
}

void restoreWelcomeMessage() {
  SavedWelcome savedWelcome;
  EEPROM.get(EEPROM_WELCOME_ADDRESS, savedWelcome);
  if (savedWelcome.magic == EEPROM_WELCOME_MAGIC) {
    savedWelcome.name[LCD_NAME_LENGTH] = '\0';
    showCenteredMessage("Welcome", String(savedWelcome.name));
  } else {
    showCenteredMessage("CadetLink", "");
  }
}

void clearSavedWelcome() {
  EEPROM.update(EEPROM_WELCOME_ADDRESS, 0);
  EEPROM.update(EEPROM_WELCOME_ADDRESS + 1, 0);
}

void showWelcomeWhenReady() {
  if (welcomePending && (long)(millis() - welcomeDisplayAt) >= 0) {
    welcomePending = false;
    showCenteredMessage("Welcome", pendingWelcomeName);
    pendingWelcomeName = "";
  }
}

void showCenteredMessage(String firstLine, String secondLine) {
  firstLine.trim();
  secondLine.trim();
  if (firstLine.length() > 16) {
    firstLine = firstLine.substring(0, 16);
  }
  if (secondLine.length() > 16) {
    secondLine = secondLine.substring(0, 16);
  }

  lcd.clear();
  printCenteredLine(0, firstLine);
  printCenteredLine(1, secondLine);
}

void printCenteredLine(byte row, const String& text) {
  const int column = (16 - text.length()) / 2;
  lcd.setCursor(column, row);
  lcd.print(text);
}

void setupEmergencyButtons() {
  pinMode(BTN_MARINERS_PIN, INPUT_PULLUP);
  pinMode(BTN_ACADEMIC_PIN, INPUT_PULLUP);
}

void checkEmergencyButtons() {
  const int currentState1 = digitalRead(BTN_MARINERS_PIN);
  const int currentState2 = digitalRead(BTN_ACADEMIC_PIN);

  if (currentState1 == LOW && lastState1 == HIGH) {
    if ((millis() - lastDebounceTime1) > debounceDelay) {
      Serial.println("EMERGENCY_MARINERS");
      lastDebounceTime1 = millis();
    }
  }
  lastState1 = currentState1;

  if (currentState2 == LOW && lastState2 == HIGH) {
    if ((millis() - lastDebounceTime2) > debounceDelay) {
      Serial.println("EMERGENCY_ACADEMIC");
      lastDebounceTime2 = millis();
    }
  }
  lastState2 = currentState2;
}
