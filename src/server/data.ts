import fs from 'fs';
import { log } from './logger';
import { getGroups, setSlideDelay } from './file-manager';
import {
  getActiveSlide,
  getPlayingGroup,
  playGroup,
  setActiveSlide,
} from './http-server';
import { ServerMessageActiveSlide } from '../global-types';

const initGroupInfo: {
  [k: string]: {
    slideDelay: number;
  };
} = {};
const initStateInfo: {
  activeSlide: ServerMessageActiveSlide['slide'];
  playingGroup: string | null;
} = {
  activeSlide: 'black',
  playingGroup: null,
};

export function initializeData() {
  //data directory
  const dataDir = './data';
  // Check if directory exists, and create it if it doesn't
  return fs.promises
    .access(dataDir)
    .catch(() => {
      return fs.promises.mkdir(dataDir, { recursive: true }).catch((err) => {
        log('error', 'Error creating data directory', err);
      });
    })
    .then(() => {
      return fs.promises.readFile('./data/groupinfo.json');
    })
    .then((data) => {
      log('info', 'reading group info file');
      const groupInfo = JSON.parse(data.toString()) as typeof initGroupInfo;
      const groups = getGroups();
      Object.keys(groupInfo).forEach((key) => {
        const group = groups.find((g) => g.name === key);
        if (group) {
          setSlideDelay(key, groupInfo[key].slideDelay, 'fromFile');
        }
      });
    })
    .catch(() => {
      log('warn', 'Group info file does not exist. Creating it...');
      fs.promises
        .writeFile(dataDir + '/groupinfo.json', JSON.stringify(initGroupInfo))
        .catch((err) => {
          log('error', 'Error initializing group info:', err);
        });
    })
    .then(() => {
      return fs.promises.readFile('./data/stateinfo.json');
    })
    .then((data) => {
      log('info', 'reading state info file');
      const stateInfo = JSON.parse(data.toString()) as typeof initStateInfo;
      setActiveSlide(stateInfo.activeSlide);
      playGroup(stateInfo.playingGroup);
    })
    .catch(() => {
      log('warn', 'State info file does not exist. Creating it...');
      fs.promises
        .writeFile(dataDir + '/stateinfo.json', JSON.stringify(initStateInfo))
        .catch((err) => {
          log('error', 'Error initializing state info:', err);
        });
    });
}

export function updateStateInfo() {
  const stateInfo = {
    activeSlide: getActiveSlide(),
    playingGroup: getPlayingGroup(),
  };
  fs.promises
    .writeFile('./data/stateinfo.json', JSON.stringify(stateInfo))
    .catch((err) => {
      log('error', 'Error updating state info:', err);
    });
}

export function updateGroupInfo() {
  const groups = getGroups();
  const newGroupInfo: {
    [k: string]: {
      slideDelay: number;
    };
  } = {};
  groups.forEach((group) => {
    newGroupInfo[group.name] = { slideDelay: group.slideDelay };
  });
  fs.promises
    .writeFile('./data/groupinfo.json', JSON.stringify(newGroupInfo))
    .catch((err) => {
      log('error', 'Error updating group info:', err);
    });
}
