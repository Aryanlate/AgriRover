# BLE protocol (single source of truth)
Device name: AgriRover
Service 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
Write (website -> ESP32): 6E400002-B5A3-F393-E0A9-E50E24DCCA9E
Notify (ESP32 -> website): 6E400003-B5A3-F393-E0A9-E50E24DCCA9E
Messages: one JSON object per line, newline terminated, chunked to the MTU.
 
Website -> ESP32 (field c = command):
  hb | drive{l,r} (-100..100) | stop | estop_reset | mode{m: idle|manual|mission}
  move{mm} | turn{deg} | probe{a: down|up|read} | nozzle{pan,tilt}
  camtilt{pose: leaf|stem} | pump{id: water|treat, ms} | cfg{k,v} | selftest
 
ESP32 -> website (field t = type):
  tel{bat,mode,soil,temp,hum,tilt,dist,probe,enc} at 5 Hz
  ack{c,ok,v,reason}   ev{e,...} (arrived, probe_done, mode, ...)
  al{code,msg}         fault{code}
 
Rules:
  - Website sends hb every 300 ms while active.
  - ESP32 stops all motors and pumps if no message for 1000 ms or on BLE disconnect.
  - stop has priority over every other command.
  - drive is refused (ack ok=false, reason auto mode) while mode=mission.
  - Commands are refused with ack ok=false + reason during estop, fault, battery
    cut-off, and for move/turn while the probe is not up.
  - Pump time is capped in firmware, whatever the command says.
 
Fault codes: PROBE_STUCK, LOW_BAT_CUTOFF, TILT, SLIP, HB_LOST, ESTOP,
  OBSTACLE, SENSOR_FAIL
