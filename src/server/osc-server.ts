import net from 'net';
import { log } from './logger';
import { playGroup, setActiveSlide } from './http-server';

const OSC_PORT = 53000; // Default QLab TCP OSC port

export function initializeOSCServer() {
  return new Promise<void>((resolve) => {
    const server = net.createServer((socket) => {
      log(
        'info',
        `New OSC connection from ${socket.remoteAddress}:${socket.remotePort}`
      );

      let dataBuffer = Buffer.alloc(0); // Buffer to handle partial messages

      socket.on('data', (chunk) => {
        dataBuffer = Buffer.concat([dataBuffer, chunk]);
        processBuffer();
      });

      socket.on('end', () => {
        log(
          'info',
          `OSC connection closed to ${socket.remoteAddress}:${socket.remotePort}`
        );
      });

      socket.on('error', (err) => {
        log(
          'error',
          `Socket error: ${err.message} from ${socket.remoteAddress}:${socket.remotePort}`
        );
      });

      function processBuffer() {
        while (dataBuffer.length > 0) {
          const addressEnd = dataBuffer.indexOf(0);
          if (addressEnd === -1) return; // Wait for complete message

          const address = dataBuffer.subarray(0, addressEnd).toString();
          const typeTagIndex = addressEnd + (4 - (addressEnd % 4));
          const typeTagEnd = dataBuffer.indexOf(0, typeTagIndex);
          if (typeTagEnd === -1) return; // Incomplete type tag, wait for more data

          const typeTags = dataBuffer
            .subarray(typeTagIndex + 1, typeTagEnd)
            .toString(); // Skip comma
          let offset = typeTagEnd + (4 - (typeTagEnd % 4));

          const args = [];
          for (let tag of typeTags) {
            switch (tag) {
              case 'i': // Integer
                args.push(dataBuffer.readInt32BE(offset));
                offset += 4;
                break;
              case 'f': // Float
                args.push(dataBuffer.readFloatBE(offset));
                offset += 4;
                break;
              case 's': {
                // String
                const stringEnd = dataBuffer.indexOf(0, offset);
                const str = dataBuffer.toString('utf8', offset, stringEnd);
                args.push(str);
                offset = stringEnd + (4 - (stringEnd % 4));
                break;
              }
              case 'b': {
                // Blob
                const blobSize = dataBuffer.readInt32BE(offset);
                offset += 4;
                const blob = dataBuffer.subarray(offset, offset + blobSize);
                args.push(blob);
                offset = (offset + blobSize + 3) & ~0x03; // Align to 4 bytes with bitwise AND
                break;
              }
              default:
                log('error', `Unhandled OSC type tag: ${tag}`);
                break;
            }
          }

          const addressArray = address.slice(1).split('/');
          switch (addressArray[0]) {
            case 'set-slide': {
              if (addressArray.length !== 1) {
                log('error', `Invalid OSC address: ${address}`);
                break;
              }
              if (
                args.some((arg) => typeof arg !== 'string') &&
                !(args.length === 1 || args.length === 2)
              ) {
                log(
                  'error',
                  `Invalid arguments for OSC address /set-slide: ${args}`
                );
                break;
              }
              const slide =
                args.length === 1
                  ? (args[0] as string)
                  : (args as [string, string]);
              setActiveSlide(slide);
              break;
            }
            case 'play-group': {
              if (addressArray.length !== 1) {
                log('error', `Invalid OSC address: ${address}`);
                break;
              }
              if (args.length !== 1 || typeof args[0] !== 'string') {
                log(
                  'error',
                  `Invalid arguments for OSC address /play-group: ${args}`
                );
                break;
              }
              playGroup(args[0] as string);
              break;
            }
            case 'pause': {
              if (addressArray.length !== 1) {
                log('error', `Invalid OSC address: ${address}`);
                break;
              }
              if (args.length !== 0) {
                log(
                  'error',
                  `Invalid arguments for OSC address /pause: ${args}`
                );
              }
              playGroup(null);
              break;
            }
            default: {
              log('error', `Unhandled OSC address: ${address}`);
              break;
            }
          }

          console.log(
            `Received OSC message: Address: ${address}, Arguments: ${args}`
          );

          dataBuffer = dataBuffer.subarray(offset);
        }
      }
    });

    server.listen(OSC_PORT, () => {
      log('info', `OSC TCP Server listening on port ${OSC_PORT}`);
      resolve();
    });
  });
}
