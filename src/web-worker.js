
import thread from './thread.js';
console.log('Init web-worker thread', self);

if (self.onconnect === null) {
  // Shared Worker
  var clients = [];

  self.addEventListener('connect', function (e) {
    var port = e.ports[0];
    console.log('connect', port);
    clients.push(port);
    port.addEventListener('message', onMsg);
    port.postMessage('_snubInitSharedWorker');
    port.start();
  }, false);

  thread.setPostMessage(msg => {
    clients.forEach(port => port.postMessage(msg));
  });
} else if (self.isInline) {
  // Inline Worker
  thread.setPostMessage(msg => { self.incPostMessage(msg); });
  self.postMessage = async msg => {
    var res = await thread.message(...msg);
    return res;
  };

  self.addEventListener = (event, fn) => {
    self.events.push({
      event,
      fn
    });
  };

  self.incPostMessage = (msg) => {
    self.events.forEach(e => {
      if (e.event === 'message')
        e.fn({ data: msg });
    });
  };
} else {
  // Web Worker
  self.addEventListener('message', onMsg);
  thread.setPostMessage(postMessage);
}

// got a message from main thread
// self.addEventListener('message', onMsg);

async function onMsg (event) {
  try {
    if (event.data) {
      var [key, value] = event.data;
      var res = await thread.message(key, value);
      // reply to message from main thread
      if (!event.ports.length) return;
      return event.ports[0].postMessage(res);
    }
    throw Error('Missing message payload');
  } catch (error) {
    console.error(error);
  }
}