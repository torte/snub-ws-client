
import thread from './thread.js';
const WebSocket = require('ws');
global.WebSocket = WebSocket;

var clients = [];
const { ipcMain } = require('electron');
ipcMain.on('_snub_ipc_message', async (event, payload) => {
  var client = event.sender;
  if (!clients.includes(client)) clients.push(client);
  var [key, value, awaitReply] = payload;
  var res = await thread.message(key, value);
  if (awaitReply)
    client.send('_snub_ipc_message', ['_snub_awaited_reply', [awaitReply, res]]);
});

thread.setPostMessage(msg => {
  clients.forEach(client => {
    try {
      client.send('_snub_ipc_message', msg);
    } catch (error) {
      var idx = clients.findIndex(c => c === client);
      clients.splice(idx, 1);
    }
  });
});
