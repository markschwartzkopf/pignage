import http from 'http';
import fs from 'fs';
//import { exec } from 'child_process';
import os from 'os';
import path from 'path';
import { WebSocket } from 'ws';
import {
  ClientMessage,
  ServerMessage,
  ServerMessageActiveSlide,
} from '../global-types';
import {
  addGroup,
  getGroups,
  removeGroup,
  removeSlide,
  renameGroup,
  repopulateGroup,
  setSlideDelay,
} from './file-manager';
import { log, logBrowser } from './logger';
import { updateGroupInfo, updateStateInfo } from './data';
import { exec } from 'child_process';

const connections: WebSocket[] = [];
let activeSlide: ServerMessageActiveSlide['slide'] = 'black';
let playingGroup: string | null = null;

let canReboot = false;
if (os.platform() === 'linux') {
  exec('command -v reboot', (error, stdout, stderr) => {
    if (!error && !stderr && stdout) {
      log('info', 'reboot available, checking permission');
      exec('sudo -n reboot --help', (error, stdout, stderr) => {
        if (!error && !stderr && stdout) {
          log('info', 'program has reboot permission');
          canReboot = true;
        } else log('info', 'program does not have reboot permission');
      });
    } else log('info', 'reboot not available');
  });
} else log('info', 'Not on linux, not checking for reboot permission');

let port = 80;
const args = process.argv.slice(2);
if (args && args.length > 0) {
  const arg = args[0];
  if (parseInt(arg).toString() === arg) {
    port = parseInt(arg);
  }
}

let slowMode = false;
if (args && args.length > 1) {
  const argument = args[1];
  switch (argument) {
    case 'slow':
      slowMode = true;
      log('info', 'Slow mode enabled');
      break;
    default:
      log('error', 'Invalid argument: ' + argument);
  }
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
};

const STATIC_PATH = path.join(__dirname, '../../dist/browser/');

export function initializeServer() {
  log('info', 'Starting server on port ' + port);
  const httpServer = http
    .createServer((req, res) => {
      switch (req.method) {
        case 'POST': {
          const filePath = '.' + req.url;
          const localPath = path.join(STATIC_PATH, 'groups', filePath);
          console.log(`File upload request: ${localPath}`);
          if (!req.headers['content-type']) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('No content type header found');
            break;
          }
          const chunks: Buffer[] = [];

          req.on('data', (chunk) => {
            chunks.push(chunk);
          });
          req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const headerEndIndex = buffer.indexOf('\r\n\r\n') + 4;
            const fileBuffer = buffer.subarray(headerEndIndex);
            fs.promises
              .writeFile(localPath, fileBuffer)
              .then(() => {
                repopulateGroup(filePath.split('/')[1]);
                log('info', 'File upload complete');
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('File uploaded successfully');
              })
              .catch((err) => {
                log('error', `Error writing file: ${err}`);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error writing file');
              });
          });

          req.on('error', (err) => {
            log('error', `Error receiving file: ${JSON.stringify(err)}`);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error uploading file');
          });

          break;
        }
        case 'GET': {
          let filePath = '.' + req.url;
          if (filePath == './') {
            filePath = './index.html';
          }
          const apiStrings = filePath.split('/');
          if (apiStrings[1] === 'api') {
            apiStrings.shift(); //remove "."
            apiStrings.shift(); //remove "api"
            switch (apiStrings[0]) {
              case 'set-slide': {
                if (apiStrings.length < 3) {
                  const color = apiStrings[1];
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end('Setting active slide to ' + color);
                  setActiveSlide(color);
                } else if (apiStrings.length < 4) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(
                    'Setting active slide to ' +
                      apiStrings[1] +
                      '/' +
                      apiStrings[2]
                  );
                  setActiveSlide([apiStrings[1], apiStrings[2]]);
                } else {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end('Invalid slide request');
                }
                break;
              }
              case 'get-slide': {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                if (typeof activeSlide === 'string') {
                  res.end(JSON.stringify({ slide: activeSlide }));
                } else
                  res.end(JSON.stringify({ slide: activeSlide.join('/') }));
                break;
              }
              case 'play-group': {
                const groupName = apiStrings[1];
                if (groupName) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end('Playing group ' + groupName);
                  playGroup(groupName);
                } else {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end('Invalid group request');
                }
                break;
              }
              case 'pause': {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('Pausing playback');
                playGroup(null);
                break;
              }
              default: {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Bad API command: ' + apiStrings[0]);
              }
            }
            break;
          }
          //remove arguments
          const queryIndex = filePath.indexOf('?');
          if (queryIndex > -1) {
            filePath = filePath.substring(0, queryIndex);
          }
          const fileExtention = String(path.extname(filePath)).toLowerCase();
          let contentType = 'text/html';
          if (fileExtention in mimeTypes)
            contentType = mimeTypes[fileExtention as keyof typeof mimeTypes];
          const localPath = path.join(STATIC_PATH, filePath);
          fs.promises
            .readFile(localPath)
            .then((buf) => {
              res.writeHead(200, { 'Content-Type': contentType });
              if (slowMode) {
                const chunkSize = 1024; // 1KB per chunk
                let offset = 0;
                const interval = setInterval(() => {
                  if (offset < buf.length) {
                    const end = Math.min(offset + chunkSize, buf.length);
                    res.write(buf.slice(offset, end));
                    offset = end;
                  } else {
                    clearInterval(interval);
                    res.end(); // Finish response when all chunks are sent
                  }
                }, 5);
              } else res.end(buf, 'utf-8');
            })
            .catch((err) => {
              if (err.code && err.code === 'ENOENT') {
                log('error', `Missing file requested at ${localPath}`);
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('File not found', 'utf-8');
              } else {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('Unknown error: ' + JSON.stringify(err), 'utf-8');
              }
            });
          break;
        }
      }
    })
    .listen(port, () => {
      log('info', `Http server started on port ${port}`);
      const wss = new WebSocket.Server({ server: httpServer });
      wss.on('connection', (ws, req) => {
        connections.push(ws);
        const ip = req.socket.remoteAddress
          ? req.socket.remoteAddress
          : 'unknown';
        log(
          'info',
          `Websocket connection established. Active connections: ${connections.length}`
        );
        sendMessage({ type: 'groups', groups: getGroups() }, ws);
        sendMessage({ type: 'activeSlide', slide: activeSlide }, ws);
        sendMessage({ type: 'playingGroup', group: playingGroup }, ws);
        sendMessage({ type: 'ipAddress', address: getLocalIP() }, ws);
        sendMessage({ type: 'canReboot', canReboot: canReboot }, ws);
        ws.on('message', (message) => {
          try {
            const msg = JSON.parse(message.toString()) as ClientMessage;
            switch (msg.type) {
              case 'activeSlide': {
                setActiveSlide(msg.slide);
                break;
              }
              case 'log':
                logBrowser(
                  `Client #${connections.indexOf(ws)}, address: "${ip}"`,
                  msg.logType,
                  msg.description,
                  msg.data
                );
                break;
              case 'playGroup': {
                if (msg.group === playingGroup) break;
                playGroup(msg.group);
                break;
              }
              case 'renameGroup': {
                renameGroup(msg.oldName, msg.newName);
                break;
              }
              case 'setSlideDelay': {
                setSlideDelay(msg.group, msg.delay);
                break;
              }
              case 'addGroup': {
                addGroup(msg.name);
                break;
              }
              case 'removeSlide': {
                if (playingGroup === msg.group) {
                  log('error', 'Cannot remove slide from playing group');
                  break;
                }
                log('info', `Removing slide: ${msg.group}/${msg.slide}`);
                removeSlide(msg.group, msg.slide);
                break;
              }
              case 'removeGroup': {
                if (playingGroup === msg.group) {
                  log('error', 'Cannot remove currently playing group');
                  break;
                }
                log('info', `Removing group: ${msg.group}`);
                removeGroup(msg.group);
                break;
              }
              case 'reboot':
                if (canReboot) {
                  log('info', 'Rebooting...');
                  exec('sudo reboot');
                }
                break;
              default:
                log('error', `Unknown message type: ${JSON.stringify(msg)})`);
            }
          } catch (err) {
            log('error', `Error parsing message from client: ${err}`);
          }
        });
        ws.on('close', () => {
          log(
            'info',
            `Websocket connection closed. Active connections: ${connections.length}`
          );
          const index = connections.indexOf(ws);
          if (index > -1) {
            connections.splice(index, 1);
          }
        });
      });
    });
}
function sendMessage(message: ServerMessage, socket?: WebSocket) {
  const msg = JSON.stringify(message);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(msg);
  } else {
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }
}

let playGroupInterval: NodeJS.Timeout | null = null;

let slideIndex = -1;
export function playGroup(groupName: string | null) {
  if (playGroupInterval) {
    clearInterval(playGroupInterval);
    playGroupInterval = null;
  }
  if (!groupName) {
    playingGroup = null;
    updateStateInfo();
    sendMessage({ type: 'playingGroup', group: null });
    return;
  }
  const maybeGroup = getGroups().find((g) => g.name === groupName);
  if (!maybeGroup || maybeGroup.files.length === 0) {
    playingGroup = null;
    updateStateInfo();
    sendMessage({ type: 'playingGroup', group: null });
    log(
      'error',
      `Group not found: "${groupName}". Setting playingGroup to null.`
    );
  }
  if (
    typeof groupName !== 'string' ||
    !maybeGroup ||
    maybeGroup.files.length === 0
  ) {
    playingGroup = null;
    updateStateInfo();
    sendMessage({ type: 'playingGroup', group: null });
    return;
  }
  playingGroup = groupName;
  updateStateInfo();
  sendMessage({ type: 'playingGroup', group: groupName });
  const group = maybeGroup;
  if (group.files.length === 1) {
    activeSlide = [group.name, group.files[0].name];
    sendMessage({
      type: 'activeSlide',
      slide: [group.name, group.files[0].name],
    });
    return;
  }
  slideIndex = -1;
  if (activeSlide && activeSlide[0] === group.name) {
    const fileName = activeSlide[1];
    slideIndex = group.files.findIndex((f) => f.name === fileName);
  }
  nextSlide(group.name);
}

function nextSlide(groupName: string) {
  const curGroup = getGroups().find((g) => g.name === groupName);
  if (!curGroup || curGroup.files.length === 0) {
    log('error', `Group not found: "${groupName}"`);
    return;
  }
  slideIndex = (slideIndex + 1) % curGroup.files.length;
  activeSlide = [groupName, curGroup.files[slideIndex].name];
  sendMessage({
    type: 'activeSlide',
    slide: [groupName, curGroup.files[slideIndex].name],
  });
  playGroupInterval = setTimeout(() => {
    nextSlide(groupName);
  }, curGroup.slideDelay * 1000);
}

export function setActiveSlide(slide: ServerMessageActiveSlide['slide']) {
  if (typeof slide === 'string') {
    activeSlide = slide;
    playingGroup = null;
    if (playGroupInterval) {
      clearInterval(playGroupInterval);
      playGroupInterval = null;
    }
    updateStateInfo();
    sendMessage({ type: 'activeSlide', slide: slide });
    sendMessage({ type: 'playingGroup', group: null });
    return;
  }
  const realSlide = slide;
  const groups = getGroups();
  const group = groups.find((g) => g.name === realSlide[0]);
  if (group && group.files.find((f) => f.name === realSlide[1])) {
    if (playGroupInterval) {
      clearInterval(playGroupInterval);
      playGroupInterval = null;
      if (playingGroup === realSlide[0]) {
        slideIndex = group.files.findIndex((f) => f.name === realSlide[1]) - 1;
        nextSlide(realSlide[0]);
        return;
      }
    }
    if (playingGroup && playingGroup !== realSlide[0]) {
      playingGroup = null;
      sendMessage({ type: 'playingGroup', group: null });
    }
    activeSlide = realSlide;
    updateStateInfo();
    sendMessage({ type: 'activeSlide', slide: realSlide });
  } else
    log('error', `Requested slide not found: ${realSlide[0]}/${realSlide[1]}`);
}

export function getPlayingGroup() {
  return playingGroup;
}

export function getActiveSlide() {
  return JSON.parse(
    JSON.stringify(activeSlide)
  ) as ServerMessageActiveSlide['slide'];
}

export function refreshGroups() {
  updateGroupInfo();
  sendMessage({ type: 'groups', groups: getGroups() });
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'No IP address found';
}
