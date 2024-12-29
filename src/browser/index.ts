import {
  ClientMessage,
  FileGroup,
  LogData,
  LogType,
  ServerMessage,
} from '../global-types';
const svgNS = 'http://www.w3.org/2000/svg'; // SVG namespace
const playPolygon = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
const pausePolygon = `<rect x="3" y="3" width="6" height="18"></rect><rect x="15" y="3" width="6" height="18"></rect>`;

let groups: (FileGroup & { scrollEl?: HTMLElement; playEl?: SVGElement })[] =
  [];
let activeSlideIndicator: HTMLElement | null = null;
let activeSlide: [string, string] | null = null;
let playingGroup: string | null = null;

const socket = new WebSocket(window.location.href.replace(/^http/, 'ws'));
socket.onmessage = (event) => {
  if (typeof event.data === 'string') {
    try {
      const message: ServerMessage = JSON.parse(event.data);
      switch (message.type) {
        case 'groups':
          groups = message.groups;
          populateGroups();
          setActiveSlide();
          break;
        case 'activeSlide': {
          activeSlide = message.slide;
          setActiveSlide();
          break;
        }
        case 'playingGroup': {
          playingGroup = message.group;
          groups.forEach((group) => {
            if (group.name === message.group) {
              if (group.playEl) group.playEl.innerHTML = pausePolygon;
            } else {
              if (group.playEl) group.playEl.innerHTML = playPolygon;
            }
          });
          break;
        }
        default:
          log('error', 'Unknown message type:', message);
      }
    } catch (err) {
      log('error', 'Error parsing message:', err);
    }
  }
};

function setActiveSlide() {
  if (!activeSlide) {
    if (activeSlideIndicator) activeSlideIndicator.remove();
    activeSlideIndicator = null;
    return;
  }
  const realSlide = activeSlide;
  const group = groups.find((g) => g.name === realSlide[0]);
  const slideIndex = group
    ? group.files.findIndex((f) => f.name === realSlide[1])
    : -1;
  if (group && slideIndex > -1) {
    const scroller = group.scrollEl;
    if (!scroller)
      return log('error', `No scroller found for group: ${group.name}`);
    const center = 100 + slideIndex * 200;
    const viewPortWidth = scroller.clientWidth;
    let scrollTo = center - viewPortWidth / 2;
    const maxScroll = scroller.scrollWidth - viewPortWidth;
    if (scrollTo > maxScroll) scrollTo = maxScroll;
    if (scrollTo < 0) scrollTo = 0;
    scroller.scrollTo({ left: scrollTo, behavior: 'smooth' });
    if (activeSlideIndicator) activeSlideIndicator.remove();
    activeSlideIndicator = document.createElement('div');
    activeSlideIndicator.classList.add('active-slide-indicator');
    activeSlideIndicator.style.left = `${slideIndex * 200}px`;
    scroller.prepend(activeSlideIndicator);
  } else
    log(
      'error',
      `Requested slide not found: ${activeSlide[0]}/${activeSlide[1]}`
    );
}

function populateGroups() {
  const slideGroups = document.getElementById('slide-groups') as HTMLElement;
  slideGroups.innerHTML = '';
  if (activeSlideIndicator) activeSlideIndicator.remove();
  activeSlideIndicator = null;
  groups.forEach((group) => {
    const groupElement = document.createElement('div');
    groupElement.classList.add('slide-group');
    const header = document.createElement('div');
    header.classList.add('group-header');
    const title = document.createElement('div');
    title.textContent = group.name;
    title.contentEditable = 'true';
    title.onblur = () => {
      title.textContent = group.name;
    };
    title.onkeydown = (event) => {
      if (
        event.key === 'Enter' &&
        title.textContent !== group.name &&
        title.textContent
      ) {
        sendMessage({
          type: 'renameGroup',
          oldName: group.name,
          newName: title.textContent,
        });
        title.blur();
      }
    };
    header.appendChild(title);
    const playIcon = document.createElementNS(svgNS, 'svg');
    playIcon.classList.add('svg-icon');
    playIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    playIcon.setAttribute('viewBox', '0 0 24 24');
    playIcon.setAttribute('fill', '#ffffff');
    playIcon.setAttribute('stroke', '#ffffff');
    playIcon.innerHTML = playPolygon;
    playIcon.onclick = () => {
      if (playingGroup === group.name) {
        sendMessage({ type: 'playGroup', group: null });
      } else sendMessage({ type: 'playGroup', group: group.name });
    };
    group.playEl = playIcon;
    header.appendChild(playIcon);
    groupElement.appendChild(header);
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.classList.add('thumbnail-container');
    const thumbnail = document.createElement('img');
    thumbnail.src = group.thumbnail;
    thumbnail.width = group.thumbnailWidth;
    thumbnail.onclick = (event) => {
      const rect = thumbnail.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const imageIndex = Math.floor((x / rect.width) * group.files.length);
      if (group.files[imageIndex]) {
        sendMessage({
          type: 'activeSlide',
          slide: [group.name, group.files[imageIndex].name],
        });
      } else log('error', `No image at index ${imageIndex}`);
    };
    thumbnailContainer.appendChild(thumbnail);
    groupElement.appendChild(thumbnailContainer);
    group.scrollEl = thumbnailContainer;
    const delay = document.createElement('div');
    delay.classList.add('slide-delay');
    const delayLabel = document.createElement('span');
    delayLabel.textContent = 'Slide delay:';
    delay.appendChild(delayLabel);
    const delayInput = document.createElement('span');
    delayInput.classList.add('delay-input');
    delayInput.textContent = group.slideDelay.toString();
    delayInput.contentEditable = 'true';
    delayInput.onblur = () => {
      delayInput.textContent = group.slideDelay.toString();
    };
    delayInput.onkeydown = (event) => {
      const num = parseFloat(delayInput.textContent || '');
      if (
        event.key === 'Enter' &&
        delayInput.textContent !== group.slideDelay.toString()
      ) {
        if (num && num > 0) {
          sendMessage({ type: 'setSlideDelay', group: group.name, delay: num });
        }
        delayInput.blur();
      }
    };
    delay.appendChild(delayInput);
    const delayUnit = document.createElement('span');
    delayUnit.textContent = 'sec';
    delay.appendChild(delayUnit);
    groupElement.appendChild(delay);

    slideGroups.appendChild(groupElement);
  });
}

function sendMessage(message: ClientMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else
    console.error(
      "Socket not open, can't send message. Socket.readystate:",
      socket.readyState
    );
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
