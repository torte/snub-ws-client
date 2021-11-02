export default [
  {
    input: 'src/web-worker.js',
    output: {
      file: 'dist/web-worker.thread.js',
    },
  },
  {
    input: 'src/index.js',
    output: {
      file: 'dist/snub-ws-client.js',
      format: 'umd',
      name: 'snubWsClient',
    },
    onwarn(warning, warn) {
      if (warning.code === 'EVAL') return;
      warn(warning);
    },
  },
];
