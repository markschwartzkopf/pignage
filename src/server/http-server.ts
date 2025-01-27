import http from 'http';
import fs from 'fs';
import { exec } from 'child_process';
import os from 'os';
import path from 'path';
import { WebSocket } from 'ws';
import { ClientMessage, ServerMessage } from '../global-types';
import {
  addGroup,
  getGroups,
  removeSlide,
  renameGroup,
  repopulateGroup,
  setSlideDelay,
} from './file-manager';
import { log } from './logger';
import { updateGroupInfo, updateStateInfo } from './data';

const connections: WebSocket[] = [];
let activeSlide: [string, string] | null = null;
let playingGroup: string | null = null;

let canReboot = false;
if (os.platform() === 'linux') {
  exec('command -v reboot', (error, stdout, stderr) => {
    if (!error && !stderr && stdout) {
      log('server', 'info', 'reboot available, checking permission');
      exec('sudo -n reboot --help', (error, stdout, stderr) => {
        if (!error && !stderr && stdout) {
          log('server', 'info', 'program has reboot permission');
          canReboot = true;
        } else log('server', 'info', 'program does not have reboot permission');
      });
    } else log('server', 'info', 'reboot not available');
  });
} else
  log('server', 'info', 'Not on linux, not checking for reboot permission');

let port = 80;
const args = process.argv.slice(2);
if (args && args.length > 0) {
  const arg = args[0];
  if (parseInt(arg).toString() === arg) {
    port = parseInt(arg);
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
  log('server', 'info', 'Starting server on port ' + port);
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
                log('server', 'info', 'File upload complete');
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('File uploaded successfully');
              })
              .catch((err) => {
                log('server', 'error', `Error writing file: ${err}`);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error writing file');
              });
          });

          req.on('error', (err) => {
            log(
              'server',
              'error',
              `Error receiving file: ${JSON.stringify(err)}`
            );
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
          const fileExtention = String(path.extname(filePath)).toLowerCase();
          let contentType = 'text/html';
          if (fileExtention in mimeTypes)
            contentType = mimeTypes[fileExtention as keyof typeof mimeTypes];
          const localPath = path.join(STATIC_PATH, filePath);
          fs.promises
            .readFile(localPath)
            .then((buf) => {
              res.writeHead(200, { 'Content-Type': contentType });
              res.end(buf, 'utf-8');
            })
            .catch((err) => {
              if (err.code && err.code === 'ENOENT') {
                log(
                  'server',
                  'error',
                  `Missing file requested at ${localPath}`
                );
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
      log('server', 'info', `Http server started on port ${port}`);

      const wss = new WebSocket.Server({ server: httpServer });

      wss.on('connection', (ws, req) => {
        connections.push(ws);
        const ip = req.socket.remoteAddress
          ? req.socket.remoteAddress
          : 'unknown';
        log(
          'server',
          'info',
          `Websocket connection established. Active connections: ${connections.length}`
        );
        sendMessage({ type: 'groups', groups: getGroups() }, ws);
        sendMessage({ type: 'activeSlide', slide: activeSlide }, ws);
        sendMessage({ type: 'playingGroup', group: playingGroup }, ws);
        ws.on('message', (message) => {
          try {
            const msg = JSON.parse(message.toString()) as ClientMessage;
            switch (msg.type) {
              case 'activeSlide': {
                setActiveSlide(msg.slide);
                break;
              }
              case 'log':
                log(
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
                  log(
                    'server',
                    'error',
                    'Cannot remove slide from playing group'
                  );
                  break;
                }
                log(
                  'server',
                  'info',
                  `Removing slide: ${msg.group}/${msg.slide}`
                );
                removeSlide(msg.group, msg.slide);
                break;
              }
              default:
                log(
                  'server',
                  'error',
                  `Unknown message type: ${JSON.stringify(msg)})`
                );
            }
          } catch (err) {
            log('server', 'error', `Error parsing message from client: ${err}`);
          }
        });
        ws.on('close', () => {
          log(
            'server',
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
      'server',
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
    log('server', 'error', `Group not found: "${groupName}"`);
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

export function setActiveSlide(slide: [string, string] | null) {
  if (!slide) {
    activeSlide = null;
    updateStateInfo();
    sendMessage({ type: 'activeSlide', slide: null });
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
    log(
      'server',
      'error',
      `Requested slide not found: ${realSlide[0]}/${realSlide[1]}`
    );
}

export function getPlayingGroup() {
  return playingGroup;
}

export function getActiveSlide() {
  return JSON.parse(JSON.stringify(activeSlide)) as [string, string] | null;
}

export function refreshGroups() {
  updateGroupInfo();
  sendMessage({ type: 'groups', groups: getGroups() });
}
