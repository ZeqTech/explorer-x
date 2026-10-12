const { contextBridge, ipcRenderer } = require('electron');

const names = ['list', 'copy', 'move', 'rename', 'mkdir', 'newFile', 'search', 'drives', 'quickAccess',
  'trash', 'open', 'reveal', 'isDir', 'home', 'icon', 'clipboardWrite', 'clipboardRead', 'platform', 'newWindow'];
const api = {};
for (const n of names) {
  api[n] = async (...a) => {
    const r = await ipcRenderer.invoke(n, ...a);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
}
contextBridge.exposeInMainWorld('fsapi', api);
