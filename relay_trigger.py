"""
Simple relay trigger script for Scoreboard app
Called via child_process from Electron
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from relay_control import RelayController
import time

def main():
    if len(sys.argv) < 3:
        print("Usage: python relay_trigger.py <port> <duration>")
        sys.exit(1)
    
    port = sys.argv[1]
    duration = float(sys.argv[2])
    
    relay = RelayController()
    
    # Connect
    if not relay.connect(port):
        print("ERROR: Failed to connect to relay")
        sys.exit(1)
    
    # Trigger buzzer (NC mode: relay OFF = siren ON)
    relay.relay_off()
    print(f"BUZZER_ON:{duration}")
    sys.stdout.flush()
    
    # Wait
    time.sleep(duration)
    
    # Turn off (NC mode: relay ON = siren OFF)
    relay.relay_on()
    print("BUZZER_OFF")
    sys.stdout.flush()
    
    relay.disconnect()
    print("SUCCESS")

if __name__ == "__main__":
    main()
