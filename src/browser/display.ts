import {
  ClientMessage,
  LogData,
  LogType,
  ServerMessage,
  ServerMessageActiveSlide,
} from '../global-types';

if (window.self !== window.top) {
  document.body.classList.add('inside-iframe');
  document.documentElement.classList.add('inside-iframe');
}

let cursorTimeout: ReturnType<typeof setTimeout> | null = null;
function hideCursor() {
  document.body.style.cursor = 'none';
  document.body.parentElement!.style.cursor = 'none';
  const ipAddress = document.getElementById('ip-address');
  if (ipAddress) ipAddress.style.display = 'none';
}

setTimeout(() => {
  hideCursor();
}, 100);

document.addEventListener('mousemove', () => {
  if (cursorTimeout) {
    clearInterval(cursorTimeout);
  }
  cursorTimeout = setTimeout(() => {
    hideCursor();
  }, 5000);
  document.body.style.cursor = 'default';
  document.body.parentElement!.style.cursor = 'default';
  const ipAddress = document.getElementById('ip-address');
  if (ipAddress) ipAddress.style.display = 'unset';
});

let activeSlide: ServerMessageActiveSlide['slide'] = 'black';
const slideElement = document.getElementById('slide') as HTMLDivElement;

let socket: WebSocket | null = null;
function connect() {
  socket = new WebSocket(window.location.href.replace(/^http/, 'ws'));
  socket.onopen = () => {
    console.log('Display WebSocket opened');
  };
  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        switch (message.type) {
          case 'groups':
            setActiveSlide();
            break;
          case 'activeSlide': {
            activeSlide = message.slide;
            setActiveSlide();
            break;
          }
          case 'playingGroup': {
            break;
          }
          case 'ipAddress': {
            document.getElementById('ip-address')!.innerText = message.address;
            break;
          }
          case 'canReboot': {
            break;
          }
          default:
            // @ts-ignore
            log('error', `Unknown message type: ${message.type}`);
        }
      } catch (err) {
        log('error', 'Error parsing message:', err);
      }
    }
  };
  socket.onclose = () => {
    console.error('Socket closed');
    socket = null;
  };
}
setInterval(() => {
  if (!socket) connect();
}, 1000);

function setActiveSlide() {
  if (typeof activeSlide === 'string') {
    document.body.style.backgroundColor = activeSlide;
    slideElement.style.backgroundImage = '';
    return;
  }
  const url = ['groups', ...activeSlide].join('/');
  const img = new Image();
  console.log('Loading image:', url);
  img.src = url;
  img.onload = () => {
    console.log('Image loaded:', url);
    slideElement.style.backgroundImage = `url(${url})`;
    document.body.style.backgroundColor = '';
  };
  img.onerror = () => {
    log('error', `Error loading image: ${url}`);
  };  
}

function sendMessage(message: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else console.error(`Socket not open, can't send message`);
}

let localLogNumber = 0;
function log(type: LogType, description: string, data?: LogData) {
  localLogNumber++;
  console[type](`Local ${type} LocalLog#:${localLogNumber}, "${description}"`);
  if (data)
    console[type](
      `Local ${type} LocalLog#:${localLogNumber} data: "${JSON.stringify(
        data
      )}"`
    );
  sendMessage({ type: 'log', logType: type, description, data });
}
