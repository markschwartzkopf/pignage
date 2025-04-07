import { initializeData } from './data.js';
import { initializeGroups, initializePagesDir } from './file-manager.js';
import { initializeServer } from './http-server.js';
import { log } from './logger.js';

initializeGroups()
  .then(() => {
    return initializePagesDir();
  })
  .then(() => {
    return initializeData();
  })
  .then(() => {
    return initializeServer();
  })
  .catch((err) => {
    log('error', 'Error initializing', err);
  });
