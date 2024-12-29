import fs from 'fs';
import { log } from './logger';
import { getGroups, setSlideDelay } from './file-manager';

const initGroupInfo: {
  [k: string]: {
    slideDelay: number;
  };
} = {};

export function initializeData() {
  //data directory
  const dataDir = './data';
  // Check if directory exists, and create it if it doesn't
  return fs.promises
    .access(dataDir)
    .catch(() => {
      return fs.promises.mkdir(dataDir, { recursive: true }).catch((err) => {
        log('server', 'error', 'Error creating data directory', err);
      });
    })
    .then(() => {
      return fs.promises
        .readFile('./data/groupinfo.json')
        .then((data) => {
          log('server', 'info', 'reading group info file');
          const groupInfo = JSON.parse(data.toString());
          const groups = getGroups();
          Object.keys(groupInfo).forEach((key) => {
            const group = groups.find((g) => g.name === key);
            if (group) {
              setSlideDelay(key, groupInfo[key].slideDelay, 'fromFile');
            }
          });
        })
        .catch(async () => {
          log('server', 'error', 'creating group info file');
          return fs.promises.writeFile(
            dataDir + '/groupinfo.json',
            JSON.stringify(initGroupInfo)
          );
        })
        .catch((err) => {
          log('server', 'error', 'Error initializing data:', err);
        });
    })
    .catch((err) => {
      log('server', 'error', 'Error initializing data:', err);
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
      log('server', 'error', 'Error updating group info:', err);
    });
}
