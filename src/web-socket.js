function noop () {}

export default function (url, opts) {
  opts = opts || {};

  var ws;
  var num = 0;
  var timer = 1;
  var $ = {};
  var max = opts.maxAttempts || Infinity;

  $.open = function () {
    ws = new WebSocket(url, opts.protocols || []);

    ws.onmessage = opts.onmessage || noop;

    ws.onopen = function (e) {
      (opts.onopen || noop)(e);
      num = 0;
    };

    ws.onclose = function (e) {
      // https://github.com/Luka967/websocket-close-codes
      e.code === 1000 || e.code === 1001 || e.code === 1005 || $.reconnect(e);
      (opts.onclose || noop)(e);
    };

    ws.onerror = function (e) {
      (e && e.code === 'ECONNREFUSED') ? $.reconnect(e) : (opts.onerror || noop)(e);
    };
  };

  $.reconnect = function (e) {
    if (num++ < max) {
      timer = setTimeout(function () {
        (opts.onreconnect || noop)(e);
        $.open();
      }, num === 1 ? 1 : (opts.timeout || 500) * (num - 1));
    } else {
      (opts.onmaximum || noop)(e);
    }
  };

  $.json = function (x) {
    ws.send(JSON.stringify(x));
  };

  $.send = function (x) {
    ws.send(x);
  };

  $.close = function (x, y) {
    timer = clearTimeout(timer);
    ws.close(x || 1e3, y);
    opts.onmessage = noop;
    opts.onopen = noop;
    // opts.onclose = noop;
  };

  if (opts.autoConnect)
    $.open(); // init

  return $;
}
;
