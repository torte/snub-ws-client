(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.snubWsClient = factory());
}(this, (function () { 'use strict';

  function index (config) {
    config = Object.assign(
      {
        debug: true,
        threadType: 'shared',
        worker: 'web-worker.thread.js',
        onmessage: (_) => {},
        onconnect: (_) => {},
        onstatechange: (_) => {},
        onauthenticated: (_) => {},
        onclose: (_) => {},
        ondenyauth: (_) => {},
        onerror: (_) => {},
      },
      config
    );

    var replyQue = new Map();
    window.snubReplyQue = replyQue;

    if (config.threadType === 'shared' && typeof SharedWorker === 'undefined')
      config.threadType = 'web';

    if (config.threadType === 'web' && typeof Worker === 'undefined')
      config.threadType = 'inline';

    if (config.debug)
      console.log(
        [
          'Init snub-ws-client',
          config.threadType,
          String(config.worker).substr(0, 20),
        ].join(':')
      );

    var scWorker;
    if (config.threadType === 'web') {
      scWorker = new Worker(config.worker);
    }

    if (config.threadType === 'shared') {
      var scWorkerShared = new SharedWorker(config.worker, 'SnubSharedWorker');
      scWorker = scWorkerShared.port;
    }

    if (config.threadType === 'inline') {
      var request = new XMLHttpRequest();
      request.open('GET', config.worker, false);
      request.send(null);

      if (request.status === 200) {
        scWorker = {
          isInline: true,
          events: [],
        };
        doEval(scWorker, request.responseText);
      }
    }

    if (config.threadType === 'inline-raw' && typeof config.worker === 'string') {
      scWorker = {
        isInline: true,
        events: [],
      };
      doEval(scWorker, config.worker);
    }

    if (
      config.threadType === 'inline-fn' &&
      typeof config.worker === 'function'
    ) {
      scWorker = {
        isInline: true,
        events: [],
      };
      config.worker(scWorker);
    }

    if (config.threadType === 'electron') {
      if (typeof config.worker !== 'object')
        throw Error(
          'Electron worker requires ipcRenderer passed to the config.worker'
        );
      scWorker = {
        isElectron: true,
        events: [],
        addEventListener(event, fn) {
          this.events.push({
            event,
            fn,
          });
        },
        incPostMessage(msg) {
          this.events.forEach((e) => {
            if (e.event === 'message') e.fn({ data: msg });
          });
        },
        postMessage(msg) {
          return new Promise((resolve, reject) => {
            var [key, value] = msg;
            var awaitReply = false;
            if (value.length === 3 && !value[2]) {
              awaitReply = __genReplyId(key);
              replyQue.set(awaitReply, {
                ts: Date.now(),
                fn: resolve,
              });
            } else {
              resolve();
            }
            config.worker.send('_snub_ipc_message', [key, value, awaitReply]);
          });
        },
      };

      if (config.debug) console.log('Init snub-ws-client: ', config.threadType);

      config.worker.on('_snub_ipc_message', (event, payload) => {
        scWorker.incPostMessage(payload);
      });
    }

    // eslint-disable-next-line
    var socketState = 'DISCONNECTED';
    var socketId;
    scWorker.addEventListener('message', (event) => {
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

      if (key === '_snub_message') config.onmessage(value);

      if (key === '_snub_acceptauth') {
        socketId = value;
        config.onauthenticated(value);
        config.onconnect();
      }

      if (key === '_snub_denyauth') config.ondenyauth();

      if (key === '_snub_closed') config.onclose(value);
    });

    if (scWorker.start) scWorker.start();

    // tell the worker about the config
    scWorker.postMessage(['_snub_config', JSON.parse(JSON.stringify(config))]);

    return {
      get socketPath() {
        return config.socketPath;
      },
      set socketPath(nv) {
        if (config.socketPath === nv) return;
        config.socketPath = nv;
        scWorker.postMessage([
          '_snub_config',
          JSON.parse(JSON.stringify(config)),
        ]);
      },
      get state() {
        return socketState;
      },
      get socketId() {
        return socketId;
      },
      set onmessage(nv) {
        config.onmessage = nv;
      },
      get onmessage() {
        return config.onmessage;
      },
      set onconnect(nv) {
        config.onconnect = nv;
      },
      get onconnect() {
        return config.onconnect;
      },
      set onstatechange(nv) {
        config.onstatechange = nv;
      },
      get onstatechange() {
        return config.onstatechange;
      },
      set onauthenticated(nv) {
        config.onauthenticated = nv;
      },
      get onauthenticated() {
        return config.onauthenticated;
      },
      set onclose(nv) {
        config.onclose = nv;
      },
      get onclose() {
        return config.onclose;
      },
      set ondenyauth(nv) {
        config.ondenyauth = nv;
      },
      get ondenyauth() {
        return config.ondenyauth;
      },
      set onerror(nv) {
        config.onerror = nv;
      },
      get onerror() {
        return config.onerror;
      },
      connect(authObj) {
        this.postToThread('_snub_connect', authObj);
      },
      close(code, reason) {
        this.postToThread('_snub_close', [code, reason]);
      },
      open() {
        this.postToThread('_snub_open');
      },
      async send(key, value, noReply) {
        var res = await this.postToThread('_snubSend', [key, value, noReply]);
        return res;
      },
      async createJob(name, fn) {
        fn = fn.toString();
        var res = await this.postToThread('_snubCreateJob', { name, fn });
        var self = this;
        if (res === name)
          return async function () {
            var ran = await self.postToThread('_snubRunJob', {
              name,
              args: Array.from(arguments),
            });
            return ran;
          };
      },
      // posst a messages to the worker thread;
      postToThread(key, value) {
        if (key === '_snubSend')
          if (scWorker.isInline || scWorker.isElectron)
            return scWorker.postMessage([key, value]);

        if (key === '_snubSend')
          // only used by webworkers with a means to reply inline
          return new Promise((resolve, reject) => {
            // if its not expecting a reply?
            if (!value || (value.length === 3 && value[2] === true)) {
              scWorker.postMessage([key, value]);
              resolve();
            } else {
              var msgChannel = new MessageChannel();
              msgChannel.port1.onmessage = (event) => {
                if (key === '_snubSend') resolve(event.data);
              };
              scWorker.postMessage([key, value], [msgChannel.port2]);
            }
          });
      },
    };
  }

  function doEval(self, _worker_file) {
    (function () {
      // eslint-disable-next-line
      eval(_worker_file);
    }.call(window));
  }
  function __genReplyId(prefix) {
    var firstPart = (Math.random() * 46656) | 0;
    var secondPart = (Math.random() * 46656) | 0;
    firstPart = ('000' + firstPart.toString(36)).slice(-3);
    secondPart = ('000' + secondPart.toString(36)).slice(-3);
    return '_reply:' + prefix + ':' + firstPart + secondPart;
  }

  return index;

})));
