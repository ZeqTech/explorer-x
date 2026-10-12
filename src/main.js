const { app, BrowserWindow, ipcMain, shell, Menu, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const svc = require('./fs-service');

function createWindow(startPath) {
  const win = new BrowserWindow({
    width: 1200, height: 760, minWidth: 640, minHeight: 400, title: 'Explorer X',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'), startPath ? { query: { path: startPath } } : undefined);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
}

const handle = (name, fn) => ipcMain.handle(name, async (_e, ...a) => {
  try { return { ok: true, value: await fn(...a) }; } catch (e) { return { ok: false, error: e.message }; }
});

handle('list', (d, h) => svc.listDir(d, h));
handle('copy', (s, d) => svc.copyInto(s, d));
handle('move', (s, d) => svc.moveInto(s, d));
handle('rename', (p, n) => svc.rename(p, n));
handle('mkdir', (d) => svc.mkdir(d));
handle('newFile', (d) => svc.newFile(d));
handle('search', (r, q) => svc.search(r, q));
handle('drives', () => svc.drives());
handle('quickAccess', () => svc.quickAccess());
handle('trash', async (ps) => { for (const p of ps) await shell.trashItem(p); });
handle('open', async (p) => { const err = await shell.openPath(p); if (err) throw new Error(err); });
handle('reveal', (p) => shell.showItemInFolder(p));
handle('isDir', async (p) => (await fsp.stat(p)).isDirectory());
handle('newWindow', (p) => createWindow(p));
handle('home', () => os.homedir());
handle('platform', () => process.platform);
handle('icon', async (p) => (await app.getFileIcon(p, { size: 'small' })).toDataURL());
handle('clipboardWrite', (paths, cut) => { clipboard.writeText(JSON.stringify({ explorerX: true, paths, cut })); });
handle('clipboardRead', () => {
  try { const j = JSON.parse(clipboard.readText()); return j.explorerX ? j : null; } catch { return null; }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
