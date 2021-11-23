export default [
  {
    input: 'src/web-worker.js',
    output: {
      file: 'dist/web-worker.thread.js',
    },
  },
  {
    input: 'src/web-worker.js',
    output: {
      file: 'dist/web-worker.thread.umd.js',
      format: 'umd',
      name: 'snubWsThread',
    },
  },
  {
    input: 'src/web-worker.js',
    output: {
      file: 'dist/web-worker.thread.es.js',
      format: 'es',
      name: 'snubWsThread',
    },
  },
  {
    input: 'src/index.js',
    output: {
      file: 'dist/snub-ws-client.es.js',
      format: 'es',
      name: 'snubWsClient',
    },
    onwarn(warning, warn) {
      if (warning.code === 'EVAL') return;
      warn(warning);
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
