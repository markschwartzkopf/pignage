import {
  ClientMessage,
  FileGroup,
  LogData,
  LogType,
  ServerMessage,
} from '../global-types';
const svgNS = 'http://www.w3.org/2000/svg'; // SVG namespace
const playIconSvg = `<polygon points="5 3 35 20 5 37 5 3"></polygon>`;
const pauseIconSvg = `<rect x="3" y="3" width="12" height="34"></rect><rect x="25" y="3" width="12" height="34"></rect>`;
const uploadIconSvg = `<rect x="3" y="25.5" width="20" height="11.25"/><path d="M3 35.5l7 -7l7 7l3 -3l3 3"/><path d="M16 30.5h4a1 1 0 0 0 0 -2h-1.5a 1 1 0 0 0 -2 0h-0.5a1 1 0 0 0 0 2"/><path d="M7 31.5a2.5 2.5 0 1 1 2.5 -2.5z" fill="white" stroke="none"/><path d="M16 19h22v-14a1 1 0 0 0 -1 -1h-14a1.2 1.2 0 0 1 -1 -0.7l-0.5 -1a1.2 1.2 0 0 0 -1 -0.7h-3.5a1 1 0 0 0 -1 1z"/><path d="M13 12h 15v15l-5 -5l-10 10l-5 -5l10 -10z" fill="black"/>`;
const trashSvg = `<path d="M89 9a4 4 0 0 1 4 4v2h-86v-2a4 4 0 0 1 4 -4z" fill="white"/><path d="M41 9v-5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v5"/><path d="M74.25 94.5a6 6 0 0 0 5.95 -5.15l9.8 -69.85h-80l9.8 69.85a6 6 0 0 0 5.95 5.15z" fill="black"/><path d="M50 30v54" stroke-linecap="round"/><path d="M30 30l4 54" stroke-linecap="round"/><path d="M70 30l-4 54" stroke-linecap="round"/>`;

let groups: (FileGroup & { scrollEl?: HTMLElement; playEl?: SVGElement })[] =
  [];
let activeSlideIndicator: HTMLElement | null = null;
let trashDiv: HTMLElement | null = null;
let activeSlide: [string, string] | null = null;
let playingGroup: string | null = null;

const addSlideGroupButton = document.getElementById(
  'add-slide-group'
) as HTMLButtonElement;
addSlideGroupButton.onclick = () => {
  const groupName = prompt('Enter a name for the new slide group');
  if (groupName && groups.every((g) => g.name !== groupName)) {
    sendMessage({ type: 'addGroup', name: groupName });
  } else {
    alert('Invalid group name or group already exists');
  }
};

let socket: WebSocket | null = null;
function connect() {
  console.log('Connecting to WebSocket:');
  socket = new WebSocket(window.location.href.replace(/^http/, 'ws'));
  socket.onopen = () => {
    console.log('Control WebSocket opened');
  };
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
                if (group.playEl) group.playEl.innerHTML = pauseIconSvg;
              } else {
                if (group.playEl) group.playEl.innerHTML = playIconSvg;
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
  socket.onclose = () => {
    console.error('Socket closed');
    socket = null;
  };
}
setInterval(() => {
  if (!socket) connect();
}, 1000);

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
    if (trashDiv && trashDiv.parentElement === scroller) {
      trashDiv.remove();
      trashDiv = null;
    }
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
    activeSlideIndicator.oncontextmenu = (event) => {
      event.preventDefault();
    };
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
    const uploadIcon = document.createElementNS(svgNS, 'svg');
    uploadIcon.classList.add('svg-icon');
    uploadIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    uploadIcon.setAttribute('viewBox', '0 0 40 40');
    uploadIcon.setAttribute('fill', 'none');
    uploadIcon.setAttribute('stroke', '#ffffff');
    uploadIcon.setAttribute('stroke-width', '2');
    uploadIcon.innerHTML = uploadIconSvg;
    uploadIcon.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async () => {
        if (input.files) {
          const uploadUrl = `${window.location.origin}/${group.name}`;
          console.log('Uploading files to:', uploadUrl);
          const files = Array.from(input.files);
          for (const file of files) {
            const formData = new FormData();
            formData.append('files', file);
            try {
              const response = await fetch(`${uploadUrl}/${file.name}`, {
                method: 'POST',
                body: formData,
              });

              if (response.ok) {
                alert('File uploaded successfully!');
              } else {
                log('error', `Failed to upload file: ${response.statusText}`);
                alert('Failed to upload file');
              }
            } catch (err) {
              log('error', 'Error uploading file:', err);
              alert('An error occurred while uploading the file');
            }
          }
        }
      };
      input.click();
    };
    header.appendChild(uploadIcon);
    const playIcon = document.createElementNS(svgNS, 'svg');
    playIcon.classList.add('svg-icon');
    playIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    playIcon.setAttribute('viewBox', '0 0 40 40');
    playIcon.setAttribute('fill', '#ffffff');
    playIcon.setAttribute('stroke', '#ffffff');
    playIcon.innerHTML =
      playingGroup === group.name ? pauseIconSvg : playIconSvg;
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
    thumbnail.oncontextmenu = (event) => {
      if (
        activeSlideIndicator &&
        activeSlideIndicator.parentElement === group.scrollEl
      )
        return;
      event.preventDefault();
      const rect = thumbnail.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const imageIndex = Math.floor((x / rect.width) * group.files.length);
      if (group.scrollEl) {
        if (trashDiv) trashDiv.remove();
        trashDiv = document.createElement('div');
        trashDiv.oncontextmenu = (event) => {
          if (trashDiv) trashDiv.remove();
          trashDiv = null;
          event.preventDefault();
        };
        trashDiv.classList.add('trash');
        trashDiv.style.left = `${imageIndex * 200}px`;
        const trashIcon = document.createElementNS(svgNS, 'svg');
        trashIcon.classList.add('trash-icon');
        trashIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        trashIcon.setAttribute('viewBox', '0 0 100 100');
        trashIcon.setAttribute('stroke', 'currentColor');
        trashIcon.setAttribute('stroke-width', '3');
        trashIcon.setAttribute('fill', 'none');
        trashIcon.innerHTML = trashSvg;
        trashDiv.appendChild(trashIcon);
        trashDiv.onclick = () => {
          if (group.files[imageIndex]) {
            sendMessage({
              type: 'removeSlide',
              group: group.name,
              slide: group.files[imageIndex].name,
            });
          }
        };
        group.scrollEl.prepend(trashDiv);
      }
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
