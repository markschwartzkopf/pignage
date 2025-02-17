# pi-timer

A project for controlling a timer screen with from a Raspberry Pi, for comedy clubs or anywhere that has performers who need to know how much time they have left

## Setting up this software on Raspberry Pi 4 or 5 with mostly vanilla stuff

- Create SD card with standard Raspberry Pi OS
- Boot and configure Pi
  - Keyboard Layout
  - Account login
  - Connect to wifi
- Update Pi
  - ```
    sudo apt update
    sudo apt full-upgrade
    ```
- Install Node
  - ```
    sudo apt install npm
    ```
- Install this package onto the pi, and allow it to use port 80
  - ```
    git clone https://github.com/markschwartzkopf/pignage.git
    cd pignage
    npm install
    npm run build
    sudo setcap 'cap_net_bind_service=+ep' $(which node)
    ```
- Install pm2:
  - ```
    sudo npm install pm2 -g
    pm2 start index.js
    pm2 save
    sudo pm2 startup
    ```
  - maybe?? copy/paste/run the command that `pm2 startup` gives you to

### Getting the Raspberry Pi to open the browser-source display fullscreen on boot

- Set wallpaper to black
  - Menu -> Preferences -> Appearance Settings -> Desktop
    - Layout -> No image
    - Colour -> black
    - Desktop Folder -> unclick everything
  - Menu -> Preferences -> Appearance Settings -> System
    - Theme -> Dark
- Edit cmdline.txt
  - `sudo nano /boot/firmware/cmdline.txt`
  - change `console=tty1` to `console=tty3`
  - after `console=tty3` add `loglevel=3 vt.global_cursor_default=0`
  - remove `splash`
  - add `logo.nologo consoleblank=1` to the end
  - Ctrl-X and save
- Edit lightdm-gtk-greeter.conf
  - `sudo nano /etc/lightdm/lightdm-gtk-greeter.conf`
  - uncomment `background=` and make it `background=#000000`
  - Ctrl-X and save
- Create the autostart directory
  - `mkdir ~/.config/autostart`
- Copy `chromium.desktop` over to the autostart directory
  - `cp ~/pignage/chromium.desktop ~/.config/autostart/`

## Setting up this software on Raspberry Pi 3 or higher with a more optimized setup

- Create SD card with the appropriate DietPi image from [dietpi.com](https://dietpi.com)
- Boot and configure Pi
  - Go to network settings and connect to wifi if necessary
    - Network settings -> WiFi -> Enable WiFi -> Scan and configure SSID -> Do it -> Apply
    - Go back to DietPi-Update and Retry
    - Configure all the password/locale stuff
    - Search Software and install LXDE
    - Install
    - No web browser at this point. (Chromium and Firefox are too bloaty)
    - You can now ssh in if you couldn't before
    - `sudo apt install -y npm surf unclutter unclutter-startup git`
    - (This may take a while and hang for minutes after the recommended packages list)
    - Install this package onto the pi, and allow it to use port 80
      - ```
        git clone https://github.com/markschwartzkopf/pignage.git
        cd pignage
        npm install
        npm run build
        sudo setcap 'cap_net_bind_service=+ep' $(which node)
        ```
    - Install pm2:
      - ```
        sudo npm install pm2 -g
        pm2 start index.js
        pm2 save
        sudo pm2 startup
        ```
      - maybe?? copy/paste/run the command that `pm2 startup` gives you to
    - `sudo dietpi-config`
      - Set any display options you want
      - AutoStart Options->Desktops Automatic login
      - Select dietpi user
      - Reboot when asked
    - On a Pi 3, it takes a LONG time to boot into a desktop environment

### Getting the Raspberry Pi to open the browser-source display fullscreen on boot

- Set wallpaper to black
  - Menu -> Preferences -> Desktop Preferences
    - Appearance tab -> Wallpaper mode -> Fill with background color only
    - Advanced tab -> unclick "Use desktop as a folder
- Edit cmdline.txt
  - `sudo nano /boot/firmware/cmdline.txt`
  - change `console=tty1` to `console=tty3`
  - after `console=tty3` add `loglevel=3 vt.global_cursor_default=0 consoleblank=1` to the end
  - Ctrl-X and save
- Copy `surf.desktop` over to the autostart directory
  - `cp ~/pignage/surf.desktop ~/.config/autostart/`
