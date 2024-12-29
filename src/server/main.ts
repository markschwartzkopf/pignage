import { initializeData } from './data.js';
import { initializeGroups } from './file-manager.js';
import { initializeServer } from './http-server.js';
import { log } from './logger.js';

initializeGroups()
  .then(() => {
    return initializeData();
  })
  .then(() => {
    return initializeServer();
  })
  .catch((err) => {
    log('server', 'error', 'Error initializing server', err);
  });
