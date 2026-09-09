WingletReader Portable
======================

What this is
------------
WingletReader Portable is the Windows x64 run-in-place copy of WingletReader.
It keeps its library, settings, segments, and app data beside the app on this
drive instead of in the host PC user profile, so your reading setup can move
between eligible Windows PCs.

How to launch
-------------
1. Open this drive or folder in File Explorer.
2. Double-click WingletReader.cmd.
3. Keep the app folder in place; the launcher starts app\WingletReader.exe.

Windows SmartScreen
-------------------
This alpha build is unsigned. On a new PC, Windows may show a one-time
SmartScreen warning. Choose "More info", then "Run anyway" if you trust this
copy.

Safe eject
----------
Close WingletReader before pulling out or ejecting the USB stick. The app saves
library and settings data on this drive, and removing the drive while the app is
running can interrupt a save.

Eligible device
---------------
- Windows 10 or Windows 11, x64
- USB storage allowed by the PC
- Roughly 500 MB free on the drive
- No administrator access required

Note
----
Windows does not auto-launch portable apps from removable drives. The reliable
flow is: plug in the drive, open it, then double-click WingletReader.cmd.
