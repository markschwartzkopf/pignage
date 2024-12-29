const svg_to_ico = require('svg-to-ico');

svg_to_ico({
  input_name: './favicon/favicon.svg',
  output_name: './src/browser/favicon.ico',
  sizes: [16, 32, 48, 64, 128, 192],
})
  .then(() => {
    console.log('file converted');
  })
  .catch((error) => {
    console.error(`file conversion failed: ${error}`);
  });
