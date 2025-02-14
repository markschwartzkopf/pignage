# pi-timer

A project for controlling a timer screen with from a Raspberry Pi, for comedy clubs or anywhere that has performers who need to know how much time they have left

## Setting up this software on Raspberry Pi

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
    pm2 startup
    ```
  - copy/paste/run the command that `pm2 startup` gives you to


## Getting the Raspberry Pi to open the browser-source display fullscreen on boot
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
- copy `browser.desktop` over to the autostart directory
  - `cp ~/pignage/browser.desktop ~/.config/autostart/`
