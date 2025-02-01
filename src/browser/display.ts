import {
  ClientMessage,
  FileGroup,
  LogData,
  LogType,
  ServerMessage,
  ServerMessageActiveSlide,
} from '../global-types';

if (window.self !== window.top) {
  document.body.classList.add('inside-iframe');
  document.documentElement.classList.add('inside-iframe');
}

let ipAddressText = 'No IP address yet';
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

type clientFile = FileGroup['files'][number] & { element: HTMLElement };
type clientFileGroup = {
  name: string;
  files: clientFile[];
};
let groups: clientFileGroup[] = [];
let activeSlide: ServerMessageActiveSlide['slide'] = 'black';
let activeSlideElement: HTMLElement | null = null;

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
            populateGroups(message.groups);
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
            ipAddressText = message.address;
            document.getElementById('ip-address')!.innerText = ipAddressText;
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
    if (activeSlideElement) activeSlideElement.style.display = 'none';
    activeSlideElement = null;
    document.body.style.backgroundColor = activeSlide;
    return;
  }
  document.body.style.backgroundColor = '';
  const realSlide = activeSlide;
  const group = groups.find((g) => g.name === realSlide[0]);
  const clientFile = group
    ? group.files.find((f) => f.name === realSlide[1])
    : null;
  if (clientFile) {
    const oldActiveSlideElement = activeSlideElement;
    activeSlideElement = clientFile.element;
    activeSlideElement.style.display = '';
    if (oldActiveSlideElement && oldActiveSlideElement !== activeSlideElement)
      oldActiveSlideElement.style.display = 'none';
  }
}

function populateGroups(serverGroups: FileGroup[]) {
  //should figure out if any clientFile elements need to be removed and do it, and then create new groups, slotting in elements as is appropriate
  document.body.innerHTML = '';
  const ipAddress = document.createElement('div');
  ipAddress.id = 'ip-address';
  ipAddress.innerText = ipAddressText;
  document.body.appendChild(ipAddress);
  groups = serverGroups.map((group) => {
    const clientGroup: clientFileGroup = {
      name: group.name,
      files: group.files.map((file) => {
        const image = document.createElement('div');
        image.style.backgroundImage = `url(${file.url})`;
        image.style.backgroundSize = 'contain';
        image.style.backgroundRepeat = 'no-repeat';
        image.style.backgroundPosition = 'center';
        image.style.width = '100%';
        image.style.height = '100%';
        image.style.display = 'none';

        document.body.appendChild(image);
        return { ...file, element: image };
      }),
    };
    return clientGroup;
  });
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
