
import Ws from './web-socket';

var config = {
  timeout: 500,
  maxAttempts: 10,
};
var currentWs;
var currentWsState = 'DISCONNECTED'; // DISCONNECTED > CONNECTING > WAITING_AUTH > CONNECTED

var replyQue = new Map();
var connectQue = [];

var threadPostMessage = _ => {};
var listenRawFn = _ => {};
var listenFn = _ => {};

var jobs = new Map();

export default {
  setPostMessage (fn) {
    threadPostMessage = fn;
  },
  get wsState () {
    return currentWsState;
  },
  set wsState (nv) {
    if (nv !== currentWs) {
      currentWsState = nv;
      this.postMessage('_snub_state', nv);
    }
  },
  async _config (configObj) {
    config = Object.assign(config, configObj);
  },
  async _connect (authObj) {
    if (config.debug)
      console.log('SnubSocket request connection...');
    if (currentWs && this.wsState !== 'DISCONNECTED') {
      this.postMessage('_snub_state', this.wsState);
      if (this.wsState === 'CONNECTED')
        this.postMessage('_snub_acceptauth');
      return;
    }
    if (config.debug)
      console.log('SnubSocket Connecting...');

    console.log('max attampes', config.maxAttempts);
    this.wsState = 'CONNECTING';
    try {
      currentWs.close();
    } catch (error) {}
    currentWs = new Ws(config.socketPath, {
      autoConnect: true,
      timeout: config.timeout,
      maxAttempts: config.maxAttempts,
      onopen: e => {
        if (config.debug)
          console.log('SnubSocket Connected');
        this.wsState = 'WAITING_AUTH';
        currentWs.json(['_auth', authObj]);
      },
      onmessage: e => {
        try {
          var [key, value] = JSON.parse(e.data);
          if (key === '_acceptAuth') {
            this.wsState = 'CONNECTED';
            this.postMessage('_snub_acceptauth');

            while (connectQue.length > 0) {
              (async queItem => {
                var res = this._snubSend(queItem.obj);
                queItem.fn(res);
              })(connectQue.shift());
            }
            return;
          }

          if (key.startsWith('_reply:')) {
            var queItem = replyQue.get(key);
            if (queItem && queItem.fn) {
              replyQue.delete(key);
              return queItem.fn(value);
            }
          }

          this.postMessage('_snub_message', [key, value]);
        } catch (error) {
          this.postMessage('_snub_message', e.data);
        }
      },
      onreconnect: e => console.log('Reconnecting...', e),
      onmaximum: e => console.log('Stop Attempting!', e),
      onclose: e => {
        this.wsState = 'DISCONNECTED';
        if (config.debug)
          console.log('SnubSocket closed...');
        if (e.reason === 'AUTH_FAIL')
          this.postMessage('_snub_denyauth');
        return this.postMessage('_snub_closed', {
          reason: e.reason,
          code: e.code
        });
      },
      onerror: e => console.log('Error:', e)
    });
  },
  _close (payload = []) {
    if (!currentWs) return;
    if (config.debug)
      console.log('Close sent from client', ...payload);
    currentWs.close(...payload);
  },
  _open () {
    if (!currentWs) return;
    currentWs.open();
  },
  _snubSend (snubSendObj) {
    if (this.wsState === 'DISCONNECTED') return;

    return new Promise(resolve => {
      if (this.wsState !== 'CONNECTED') {
        connectQue.push({
          obj: snubSendObj,
          fn: resolve
        });
      } else {
        var [key, value, noReply] = snubSendObj;
        var replyId = noReply === true ? undefined : this.__genReplyId(key);
        // put a reply job on the que
        if (replyId)
          replyQue.set(replyId, {
            ts: Date.now(),
            fn: resolve
          });
        currentWs.json([key, value, replyId]);
        if (!replyId)
          resolve();
      }
    });
  },
  async _snubCreateJob (obj) {
    var { name, fn } = obj;
    // eslint-disable-next-line
    var fn = new Function('return ' + fn)()
    jobs.set(name, fn);
    return name;
  },
  async _snubRunJob (obj) {
    var { name, args } = obj;
    var res = await jobs.get(name)(...args);
    return res;
  },
  async message (key, value) {
    key = key.replace(/^_snub_/, '_');
    if (typeof this[key] === 'function') {
      var res = this[key](value);
      return res;
    }
    console.error('unknown message for ' + key, this[key]);
    return 'unknown message for ' + key;
  },
  listenRaw (fn) {
    listenRawFn = fn;
  },
  listen (fn) {
    listenFn = fn;
  },
  postMessage (key, value) {
    var nextRaw = listenRawFn(key, value);
    var next;
    if (key === '_snub_message')
      next = listenFn(...value);
    if (nextRaw !== false && next !== false)
      threadPostMessage([key, value]);
  },
  __genReplyId (prefix) {
    var firstPart = (Math.random() * 46656) | 0;
    var secondPart = (Math.random() * 46656) | 0;
    firstPart = ('000' + firstPart.toString(36)).slice(-3);
    secondPart = ('000' + secondPart.toString(36)).slice(-3);
    return '_reply:' + prefix + ':' + firstPart + secondPart;
  }
};
