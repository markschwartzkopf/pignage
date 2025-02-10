import net from 'net';
import { log } from './logger';

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
          'OSC connection closed to ${socket.remoteAddress}:${socket.remotePort}'
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
                case 's': { // String
                    const stringEnd = dataBuffer.indexOf(0, offset);
                    const str = dataBuffer.toString('utf8', offset, stringEnd);
                    args.push(str);
                    offset = stringEnd + (4 - ((stringEnd) % 4));
                    break;
                }
                case 'b': { // Blob
                    const blobSize = dataBuffer.readInt32BE(offset);
                    offset += 4;
                    const blob = dataBuffer.subarray(offset, offset + blobSize);
                    args.push(blob);                    
                    offset = (offset + blobSize + 3) & ~0x03; // Align to 4 bytes with bitwise AND
                    break;
                }
                default:
                    console.log(`Unhandled type tag: ${tag}`);
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
