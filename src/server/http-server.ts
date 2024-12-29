import http from 'http';
import fs from 'fs/promises';
import { exec } from 'child_process';
import os from 'os';
import path from 'path';
import { WebSocket } from 'ws';
import { ClientMessage, ServerMessage } from '../global-types';
import { getGroups, renameGroup, setSlideDelay } from './file-manager';
import { log } from './logger';
import { updateGroupInfo } from './data';

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
      let filePath = '.' + req.url;
      if (filePath == './') {
        filePath = './index.html';
      }
      const fileExtention = String(path.extname(filePath)).toLowerCase();
      let contentType = 'text/html';
      if (fileExtention in mimeTypes)
        contentType = mimeTypes[fileExtention as keyof typeof mimeTypes];
      const localPath = path.join(STATIC_PATH, filePath);
      fs.readFile(localPath)
        .then((buf) => {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(buf, 'utf-8');
        })
        .catch((err) => {
          if (err.code && err.code === 'ENOENT') {
            log('server', 'error', `Missing file requested at ${localPath}`);
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('File not found', 'utf-8');
          } else {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('Unknown error: ' + JSON.stringify(err), 'utf-8');
          }
        });
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
                if (!msg.slide) {
                  activeSlide = null;
                  sendMessage({ type: 'activeSlide', slide: null });
                  break;
                }
                const realSlide = msg.slide;
                const groups = getGroups();
                const group = groups.find((g) => g.name === realSlide[0]);
                if (group && group.files.find((f) => f.name === realSlide[1])) {
                  activeSlide = msg.slide;
                  sendMessage({ type: 'activeSlide', slide: msg.slide });
                } else
                  log(
                    'server',
                    'error',
                    `Requested slide not found: ${msg.slide[0]}/${msg.slide[1]}`
                  );
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
function playGroup(groupName: string | null) {
  if (playGroupInterval) {
    clearInterval(playGroupInterval);
    playGroupInterval = null;
  }
  if (!groupName) {
    playingGroup = null;
    sendMessage({ type: 'playingGroup', group: null });
    return;
  }
  const maybeGroup = getGroups().find((g) => g.name === groupName);
  if (!maybeGroup || maybeGroup.files.length === 0) {
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
    sendMessage({ type: 'playingGroup', group: null });
    return;
  }
  playingGroup = groupName;
  const group = maybeGroup;
  sendMessage({ type: 'playingGroup', group: groupName });
  if (group.files.length === 1) {
    activeSlide = [group.name, group.files[0].name];
    sendMessage({
      type: 'activeSlide',
      slide: [group.name, group.files[0].name],
    });
    return;
  }
  let slideIndex = -1;
  if (activeSlide && activeSlide[0] === group.name) {
    const fileName = activeSlide[1];
    slideIndex = group.files.findIndex((f) => f.name === fileName);
  }
  function nextSlide(slideIndex: number, name: string) {
    const curGroup = getGroups().find((g) => g.name === name);
    if (!curGroup || curGroup.files.length === 0) {
      log('server', 'error', `Group not found: "${name}"`);
      return;
    }
    slideIndex = (slideIndex + 1) % curGroup.files.length;
    activeSlide = [name, curGroup.files[slideIndex].name];
    sendMessage({
      type: 'activeSlide',
      slide: [name, curGroup.files[slideIndex].name],
    });
    playGroupInterval = setTimeout(() => {
      nextSlide(slideIndex, name);
    }, curGroup.slideDelay * 1000);
  }
  nextSlide(slideIndex, group.name);
}

export function refreshGroups() {
  updateGroupInfo();
  sendMessage({ type: 'groups', groups: getGroups() });
}
