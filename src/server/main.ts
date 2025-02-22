import { initializeData } from './data.js';
import { initializeGroups } from './file-manager.js';
import { initializeServer } from './http-server.js';
import { log } from './logger.js';
import { initializeOSCServer } from './osc-server.js';

initializeGroups()
  .then(() => {
    return initializeData();
  })
  .then(() => {
    return initializeServer();
  })
  .then(() => {
    return initializeOSCServer();
  })
  .catch((err) => {
    log('error', 'Error initializing', err);
  });
