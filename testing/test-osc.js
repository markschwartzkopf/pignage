const net = require('net');

function buildOSCMessage(address, args) {
  const encoder = new TextEncoder();

  // Pad strings/buffers to be multiples of 4 bytes
  const pad = (input) => {
    let buffer;
    if (typeof input === 'string') {
      buffer = Buffer.from(input);
    } else buffer = input;
    const padding = 4 - (buffer.length % 4);
    return Buffer.concat([buffer, Buffer.alloc(padding === 4 ? 0 : padding)]);
  };

  const addressBuffer = pad(address);
  const typeTagString =
    ',' +
    args
      .map((arg) => {
        if (typeof arg === 'string') return 's';
        if (typeof arg === 'number' && Number.isInteger(arg)) return 'i';
        if (typeof arg === 'number') return 'f';
        console.error('Unsupported argument type:', arg);
        return '';
      })
      .join('');
  const typeTagBuffer = pad(typeTagString);

  const argsBuffer = Buffer.concat(
    args.map((arg) => {
      if (typeof arg === 'string') {
        return pad(arg + '\0');
      } else if (typeof arg === 'number' && Number.isInteger(arg)) {
        const buf = Buffer.alloc(4);
        buf.writeInt32BE(arg);
        return buf;
      } else if (typeof arg === 'number') {
        const buf = Buffer.alloc(4);
        buf.writeFloatBE(arg);
        return buf;
      }
      console.error('Unsupported argument type:', arg);
      return Buffer.alloc(0); // Handle other types or errors
    })
  );

  return Buffer.concat([addressBuffer, typeTagBuffer, argsBuffer]);
}

const client = net.createConnection({ host: '127.0.0.1', port: 53000 }, () => {
  console.log('Connected to OSC server.');

  const oscMessage = buildOSCMessage('/pause', []);
  client.write(oscMessage);
  console.log('OSC message sent.');

  client.end();
});

client.on('end', () => {
  console.log('Disconnected from server.');
});
