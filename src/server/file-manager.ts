import * as fs from 'fs/promises';
import * as path from 'path';
import { FileGroup } from '../global-types';
import sharp from 'sharp';
import { log } from './logger';
import { refreshGroups, getActiveSlide } from './http-server';

const groupDirectory = path.join(__dirname, '../browser/groups');

const groups: FileGroup[] = [];

export function initializeGroups() {
  return fs
    .access(groupDirectory)
    .catch(() => {
      log('server', 'warn', 'Group directory does not exist. Creating it now.');
      return fs.mkdir(groupDirectory);
    })
    .then(() => {
      log('server', 'info', 'Getting group subdirectories');
      return getDirectories(groupDirectory);
    })
    .then((directories) => {
      groups.length = 0;
      const getFilePromises = directories.map((directory) => {
        const group: FileGroup = {
          name: directory,
          files: [],
          thumbnail: '',
          thumbnailWidth: 0,
          slideDelay: 5,
        };
        groups.push(group);
        const groupPath = path.join(groupDirectory, directory);
        return populateGroup(groupPath, group)
          .then(() => {
            log('server', 'info', `Group "${directory}" populated.`);
          })
          .catch((err) => {
            log('server', 'error', `Error populating group: ${directory}`, err);
          });
      });
      return Promise.all(getFilePromises);
    })
    .catch((err) => {
      log('server', 'error', 'Error reading group directory:', err);
    });
}

export function getGroups() {
  return JSON.parse(JSON.stringify(groups)) as FileGroup[];
}

function getDirectories(path: string) {
  return new Promise<string[]>((resolve, reject) => {
    fs.readdir(path, { withFileTypes: true })
      .then((dirents) => {
        const directories = dirents
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);
        directories.sort(); // Sort the directories alphabetically
        resolve(directories);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

function getFiles(path: string) {
  return new Promise<string[]>((resolve, reject) => {
    fs.readdir(path, { withFileTypes: true })
      .then((dirents) => {
        const files = dirents
          .filter((dirent) => dirent.isFile())
          .map((dirent) => dirent.name);
        files.sort(); // Sort the files alphabetically
        resolve(files);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

function populateGroup(directoryPath: string, group: FileGroup) {
  return new Promise<void>((resolve, reject) => {
    const filePaths: string[] = [];
    const files: string[] = [];
    const thumbnails: Buffer[] = [];
    let thumbnailHeight = 0;
    getFiles(directoryPath)
      .then((filenames) => {
        const fileProcessingPromises = filenames.map((file) => {
          const filePath = path.join(directoryPath, file);
          return sharp(filePath)
            .resize(200)
            .toBuffer()
            .then((data) => {
              thumbnails.push(data);
              files.push(file);
              filePaths.push(filePath);
              return sharp(data).metadata();
            })
            .then((metadata) => {
              if (metadata.height && metadata.height > thumbnailHeight)
                thumbnailHeight = metadata.height;
            })
            .catch((err) => {
              log(
                'server',
                'error',
                `Error processing file: "${filePath}"`,
                err
              );
            });
        });
        if (fileProcessingPromises.length > 0) {
          Promise.all(fileProcessingPromises)
            .then(() => {
              group.files = files.map((file) => {
                return {
                  name: file,
                  url: `groups/${group.name}/${file}`,
                };
              });
              group.thumbnailWidth = thumbnails.length * 200;
              const compositeImages = thumbnails.map((thumbnail, index) => ({
                input: thumbnail,
                top: 0,
                left: index * 200, // Adjust the position as needed
              }));
              if (!thumbnailHeight) thumbnailHeight = 200;
              sharp({
                create: {
                  width: thumbnails.length * 200,
                  height: thumbnailHeight,
                  channels: 4,
                  background: { r: 255, g: 255, b: 255, alpha: 0 },
                },
              })
                .composite(compositeImages)
                .jpeg({ quality: 80 })
                .toBuffer()
                .then((compositeBuffer) => {
                  group.thumbnail =
                    `data:image/jpeg;base64,` +
                    compositeBuffer.toString('base64');
                  resolve();
                })
                .catch((err) => {
                  log(
                    'server',
                    'error',
                    'Error creating composite image:',
                    err
                  );
                  reject(err);
                });
            })
            .catch((err) => {
              log('server', 'error', 'Error processing files:', err);
              reject(err);
            });
        } else resolve();
      })
      .catch((err) => {
        log('server', 'error', 'Error reading directory', err);
        reject(err);
      });
  });
}

export function renameGroup(oldName: string, newName: string) {
  const group = groups.find((g) => g.name === oldName);
  if (!group) {
    log('server', 'error', `Group "${oldName}" not found.`);
    return;
  }
  const oldPath = path.join(groupDirectory, oldName);
  const newPath = path.join(groupDirectory, newName);
  fs.rename(oldPath, newPath)
    .then(() => {
      group.name = newName;
      log('server', 'info', `Group "${oldName}" renamed to "${newName}".`);
      groups.sort((a, b) => a.name.localeCompare(b.name));
      refreshGroups();
    })
    .catch((err) => {
      log(
        'server',
        'error',
        `Error renaming group "${oldName}" to "${newName}".`,
        err
      );
    });
}

export function setSlideDelay(
  groupName: string,
  delay: number,
  fromFile?: 'fromFile'
) {
  const group = groups.find((g) => g.name === groupName);
  if (!group) {
    log('server', 'error', `Group "${groupName}" not found.`);
    return;
  }
  group.slideDelay = delay;
  if (!fromFile) refreshGroups();
}

export function repopulateGroup(groupName: string) {
  const group = groups.find((g) => g.name === groupName);
  if (!group) {
    log('server', 'error', `Group "${groupName}" not found.`);
    return;
  }
  populateGroup(path.join(groupDirectory, groupName), group)
    .then(() => {
      refreshGroups();
    })
    .catch((err) => {
      log('server', 'error', `Error repopulating group "${groupName}"`, err);
    });
}

export function addGroup(groupName: string) {
  const groupPath = path.join(groupDirectory, groupName);
  fs.mkdir(groupPath)
    .then(() => {
      const group: FileGroup = {
        name: groupName,
        files: [],
        thumbnail: '',
        thumbnailWidth: 0,
        slideDelay: 5,
      };
      groups.push(group);
      log('server', 'info', `Group "${groupName}" created.`);
      groups.sort((a, b) => a.name.localeCompare(b.name));
      refreshGroups();
    })
    .catch((err) => {
      log('server', 'error', `Error creating group "${groupName}"`, err);
    });
}

export function removeSlide(groupName: string, slideName: string) {
  const activeSlide = getActiveSlide();
  if (
    activeSlide &&
    activeSlide[0] === groupName &&
    activeSlide[1] === slideName
  ) {
    log('server', 'warn', 'Cannot delete active slide');
    return;
  }
  const group = groups.find((g) => g.name === groupName);
  if (!group) {
    log('server', 'error', `Group "${groupName}" not found.`);
    return;
  }
  const slideIndex = group.files.findIndex((f) => f.name === slideName);
  if (slideIndex === -1) {
    log(
      'server',
      'error',
      `Slide "${slideName}" not found in group "${groupName}".`
    );
    return;
  }
  const slidePath = path.join(groupDirectory, groupName, slideName);
  fs.unlink(slidePath)
    .then(() => {
      log(
        'server',
        'info',
        `Slide "${slideName}" removed from group "${groupName}".`
      );
      repopulateGroup(groupName);
    })
    .catch((err) => {
      log(
        'server',
        'error',
        `Error removing slide "${slideName}" from group "${groupName}".`,
        err
      );
    });
}

export function removeGroup(groupName: string) {
  const activeSlide = getActiveSlide();
  if (activeSlide && activeSlide[0] === groupName) {
    log('server', 'warn', 'Cannot delete active group');
    return;
  }
  const group = groups.find((g) => g.name === groupName);
  if (!group) {
    log('server', 'error', `Group "${groupName}" not found.`);
    return;
  }
  const groupPath = path.join(groupDirectory, groupName);
  fs.rm(groupPath, { recursive: true })
    .then(() => {
      log('server', 'info', `Group "${groupName} removed".`);
      initializeGroups()
        .then(() => {
          refreshGroups();
        })
        .catch((err) => {
          log('server', 'error', 'Error reinitializing groups', err);
        });
    })
    .catch((err) => {
      log(
        'server',
        'error',
        `Error removing group "${groupName}".`,
        err
      );
    });
}
