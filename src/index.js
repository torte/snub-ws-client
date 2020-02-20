export default function (config) {
  config = Object.assign({
    debug: true,
    threadType: 'shared',
    worker: '../dist/web-worker.thread.js',
    onmessage: _ => {},
    onconnect: _ => {},
    onstatechange: _ => {},
    onauthenticated: _ => {},
    onclose: _ => {},
    ondenyauth: _ => {},
    onerror: _ => {}
  }, config);
  if (config.debug)
    console.log('Init snub-ws-client');

  var replyQue = new Map();

  if (config.threadType === 'shared' && typeof SharedWorker === 'undefined')
    config.threadType = 'web';

  if (config.threadType === 'web' && typeof Worker === 'undefined')
    config.threadType = 'inline';

  var scWorker;
  if (config.threadType === 'web') {
    scWorker = new Worker(config.worker);
    if (config.debug)
      console.log('Init snub-ws-client: ', config.threadType);
  }

  if (config.threadType === 'shared') {
    var scWorkerShared = new SharedWorker(config.worker, 'SnubSharedWorker');
    scWorker = scWorkerShared.port;
    if (config.debug)
      console.log('Init snub-ws-client: ', config.threadType);
  }

  if (config.threadType === 'inline') {
    var request = new XMLHttpRequest();
    request.open('GET', config.worker, false);
    request.send(null);

    if (request.status === 200) {
      // console.log(request.responseText);
      scWorker = {
        isInline: true,
        events: []
      };
      doEval(scWorker, request.responseText);
    }

    if (config.debug)
      console.log('Init snub-ws-client: ', config.threadType);
  }

  if (config.threadType === 'electron') {
    if (typeof config.worker !== 'object')
      throw Error('Electron worker requires ipcRenderer passed to the config.worker');
    scWorker = {
      isElectron: true,
      events: [],
      addEventListener (event, fn) {
        this.events.push({
          event,
          fn
        });
      },
      incPostMessage (msg) {
        this.events.forEach(e => {
          if (e.event === 'message')
            e.fn({ data: msg });
        });
      },
      postMessage (msg) {
        return new Promise((resolve, reject) => {
          var [key, value] = msg;
          var awaitReply = false;
          if (value.length === 3 && !value[2]) {
            awaitReply = __genReplyId(key);
            replyQue.set(awaitReply, {
              ts: Date.now(),
              fn: resolve
            });
          } else {
            resolve();
          }
          config.worker.send('_snub_ipc_message', [key, value, awaitReply]);
        });
      }
    };

    if (config.debug)
      console.log('Init snub-ws-client: ', config.threadType);

    config.worker.on('_snub_ipc_message', (event, payload) => {
      scWorker.incPostMessage(payload);
    });
  }

  // eslint-disable-next-line
  var socketState = 'DISCONNECTED';

  scWorker.addEventListener('message', event => {
    var [key, value] = event.data;
    if (key === '_snub_state') {
      socketState = value;
      config.onstatechange(value);
    }
    if (key === '_snub_awaited_reply') {
      var [awaitReplyKey, ival] = value;
      var queItem = replyQue.get(awaitReplyKey);
      if (queItem && queItem.fn) {
        replyQue.delete(awaitReplyKey);
        return queItem.fn(ival);
      }
    }

    if (key === '_snub_message')
      config.onmessage(value);

    if (key === '_snub_acceptauth') {
      config.onauthenticated();
      config.onconnect();
    }

    if (key === '_snub_denyauth')
      config.ondenyauth();

    if (key === '_snub_closed')
      config.onclose(value);
  });

  if (scWorker.start)
    scWorker.start();

  // tell the worker about the config
  scWorker.postMessage(['_snub_config', JSON.parse(JSON.stringify(config))]);

  return {
    get state () {
      return socketState;
    },
    connect (authObj) {
      this.postToThread('_snub_connect', authObj);
    },
    close () {
      this.postToThread('_snub_close');
    },
    open () {
      this.postToThread('_snub_open');
    },
    async send (key, value, noReply) {
      var res = await this.postToThread('_snubSend', [key, value, noReply]);
      return res;
    },
    postToThread (key, value) {
      if (scWorker.isInline || scWorker.isElectron)
        return scWorker.postMessage([key, value]);

      // only used by webworkers with a means to reply inline
      return new Promise((resolve, reject) => {
        if (value.length === 3 && value[2]) {
          resolve();
        } else {
          var msgChannel = new MessageChannel();
          msgChannel.port1.onmessage = event => {
            resolve(event.data);
          };
        }
        scWorker.postMessage([key, value], [msgChannel.port2]);
      });
    }
  };
}

function doEval (self, _worker_file) {
  (function () {
    // eslint-disable-next-line
    eval(_worker_file);
  }).call(window);
}
function __genReplyId (prefix) {
  var firstPart = (Math.random() * 46656) | 0;
  var secondPart = (Math.random() * 46656) | 0;
  firstPart = ('000' + firstPart.toString(36)).slice(-3);
  secondPart = ('000' + secondPart.toString(36)).slice(-3);
  return '_reply:' + prefix + ':' + firstPart + secondPart;
}
