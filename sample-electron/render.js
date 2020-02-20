// In renderer process (web page).
const { ipcRenderer } = require('electron');
const snubWsClient = require('./dist/snub-ws-client.js');

var snub = snubWsClient({
  socketPath: 'ws://localhost:1338',
  threadType: 'electron',
  worker: ipcRenderer,
  onmessage: msg => { console.log('onmessage', msg); },
  onstatechange: state => { console.log('onstatechange', state); },
  onclose: reason => { console.log('closed', reason); },
  onconnect: _ => { console.log('onconnect'); },
  onauthenticated: async _ => {
    console.log('AUTHED!!');
    var res1 = await snub.send('test_with_reply', 'hello');
    console.log('res1 expect reply:', res1);

    var res2 = await snub.send('test_no_reply', 'derp', true);
    console.log('res2 no reply', res2);
  }
});
(async _ => {
  snub.connect({
    auth: '123abc'
  });

  var precon = await snub.send('test_with_reply', 'precon');
  console.log('precon expect reply:', precon);

  // document.body.addEventListener('click', e => {
  //   if (e.target.tagName !== 'BUTTON') return false;
  //   if (e.target.id === 'close')
  //     snub.close();
  // });
})();
