import { BaseWindow, WebContents, Event, BrowserView, TouchBar } from 'electron/main';
import type { BrowserWindow as BWT } from 'electron/main';
import * as deprecate from '@electron/internal/common/deprecate';
const { BrowserWindow } = process._linkedBinding('electron_browser_window') as { BrowserWindow: typeof BWT };
// [inspectron] Begin
import * as fs from 'fs';
// [inspectron] End

Object.setPrototypeOf(BrowserWindow.prototype, BaseWindow.prototype);

BrowserWindow.prototype._init = function (this: BWT) {

  // [inspectron] Begin
  fs.stat('report.json', (error, stats) => {
      if(error) {
          fs.writeFile('report.json', JSON.stringify([]), (error) => {
              if(error) throw error;
              console.log("Created a new report.json file.");
          });
      } else {
          console.log("Report already exists!");
      }
  });
  // [inspectron] End

  // Call parent class's _init.
  BaseWindow.prototype._init.call(this);

  console.log(`Current Directory is ${process.cwd()}`);

  // Avoid recursive require.
  const { app } = require('electron');

  const nativeSetBounds = this.setBounds;
  this.setBounds = (bounds, ...opts) => {
    bounds = {
      ...this.getBounds(),
      ...bounds
    };
    nativeSetBounds.call(this, bounds, ...opts);
  };


  // // [inspectron]: Begin Wrap Default Protocol Client
  // function wrap(oldFunction: any) {

  //   // return a new function that will call the oldFunction
  //   // with all of the arguments passed to it
  //   return (...args: any[]) => {

  //     // log the arguments passed to the wrapped function

  //     fs.stat('report.json', (error, stats) => {
  //       if(error) {
  //           fs.writeFileSync('report.json', JSON.stringify([]));
  //       } else {
  //           console.log("Report already exists!");
  //       }
  //     });
  //     let objectToPush = {
  //       'Module': ['Session'],
  //       'Attribute': 'session.defaultSession.webRequest.onHeadersReceived',
  //       'Args': args
  //     }
  //     let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
  //     if (typeof(json) == undefined)
  //       json = []
  //     json.push(objectToPush);    
  //     fs.writeFileSync("report.json", JSON.stringify(json));

  //     // call the old function with all of the arguments
  //     return oldFunction(...args);
  //   }

  // }


  // // // create the newly wrapped add function
  // this.webContents.session.webRequest.onHeadersReceived = wrap(this.webContents.session.webRequest.onHeadersReceived);


  // Redirect focus/blur event to app instance too.
  this.on('blur', (event: Event) => {
    app.emit('browser-window-blur', event, this);
  });
  this.on('focus', (event: Event) => {
    app.emit('browser-window-focus', event, this);
  });

  // Subscribe to visibilityState changes and pass to renderer process.
  let isVisible = this.isVisible() && !this.isMinimized();
  const visibilityChanged = () => {
    const newState = this.isVisible() && !this.isMinimized();
    if (isVisible !== newState) {
      isVisible = newState;
      const visibilityState = isVisible ? 'visible' : 'hidden';
      this.webContents.emit('-window-visibility-change', visibilityState);
    }
  };
  
  const visibilityEvents = ['show', 'hide', 'minimize', 'maximize', 'restore'];
  for (const event of visibilityEvents) {
    this.on(event as any, visibilityChanged);
  }

  const warn = deprecate.warnOnceMessage('\'scroll-touch-{begin,end,edge}\' are deprecated and will be removed. Please use the WebContents \'input-event\' event instead.');
  this.webContents.on('input-event', (_, e) => {
    if (e.type === 'gestureScrollBegin') {
      if (this.listenerCount('scroll-touch-begin') !== 0) {
        warn();
        this.emit('scroll-touch-edge');
        this.emit('scroll-touch-begin');
      }
    } else if (e.type === 'gestureScrollUpdate') {
      if (this.listenerCount('scroll-touch-edge') !== 0) {
        warn();
        this.emit('scroll-touch-edge');
      }
    } else if (e.type === 'gestureScrollEnd') {
      if (this.listenerCount('scroll-touch-end') !== 0) {
        warn();
        this.emit('scroll-touch-edge');
        this.emit('scroll-touch-end');
      }
    }
  });

  // Notify the creation of the window.
  const event = process._linkedBinding('electron_browser_event').createEmpty();
  app.emit('browser-window-created', event, this);



  // [inspectron]: Begin

  fs.stat('report.json', (error, stats) => {
      if(error) {
          fs.writeFileSync('report.json', JSON.stringify([]));
      } else {
          console.log("Report already exists!");
      }
  });
  let objectToPush = {
    'Module': ['BrowserWindow','WebContents'],
    'Attribute': 'webPreferences',
    'Event': ['browser-window-created'],
    'WebPreferences': this.webContents.getLastWebPreferences(),
    'WebContents': {
      'webContentsId': this.webContents.id
    }
  }
  let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
  if (typeof(json) == undefined)
    json = []
  json.push(objectToPush);    
  fs.writeFileSync("report.json", JSON.stringify(json));

  app.whenReady().then(() => {
    let objectToPush = {
      'Module': ['app','WebContents'],
      'Attribute': '',
      'Event': ['app-ready'],
      'WebContents': {
        'webContentsId': this.webContents.id
      },
      'CommandLineSwitches': {
        '--ignore-certificate-errors': app.commandLine.hasSwitch('ignore-certificate-errors') ? app.commandLine.getSwitchValue('ignore-certificate-errors') : false,
        '--ignore-certificate-errors-spki-list': app.commandLine.hasSwitch('ignore-certificate-errors-spki-list') ? app.commandLine.getSwitchValue('ignore-certificate-errors-spki-list') : false,
        '--ignore-urlfetcher-cert-requests': app.commandLine.hasSwitch('ignore-urlfetcher-cert-requests') ? app.commandLine.getSwitchValue('ignore-urlfetcher-cert-requests') : false,
        '--disable-web-security': app.commandLine.hasSwitch('disable-web-security') ? app.commandLine.getSwitchValue('disable-web-security') : false,
        '--host-rules': app.commandLine.hasSwitch('host-rules') ? app.commandLine.getSwitchValue('host-rules') : false,
        '--host-resolver-rules': app.commandLine.hasSwitch('host-resolver-rules') ? app.commandLine.getSwitchValue('host-resolver-rules') : false,
        '--auth-server-whitelist': app.commandLine.hasSwitch('auth-server-whitelist') ? app.commandLine.getSwitchValue('auth-server-whitelist') : false,
        '--auth-negotiate-delegate-whitelist': app.commandLine.hasSwitch('auth-negotiate-delegate-whitelist') ? app.commandLine.getSwitchValue('auth-negotiate-delegate-whitelist') : false,
        '--js-flags': app.commandLine.hasSwitch('js-flags') ? app.commandLine.getSwitchValue('js-flags') : false,
        '--allow-file-access-from-files': app.commandLine.hasSwitch('allow-file-access-from-files') ? app.commandLine.getSwitchValue('allow-file-access-from-files') : false,
        '--allow-no-sandbox-job': app.commandLine.hasSwitch('allow-no-sandbox-job') ? app.commandLine.getSwitchValue('allow-no-sandbox-job') : false,
        '--allow-running-insecure-content': app.commandLine.hasSwitch('allow-running-insecure-content') ? app.commandLine.getSwitchValue('allow-running-insecure-content') : false,
        '--cipher-suite-blacklist': app.commandLine.hasSwitch('cipher-suite-blacklist') ? app.commandLine.getSwitchValue('cipher-suite-blacklist') : false,
        '--debug-packed-apps': app.commandLine.hasSwitch('debug-packed-apps') ? app.commandLine.getSwitchValue('debug-packed-apps') : false,
        '--disable-features': app.commandLine.hasSwitch('disable-features') ? app.commandLine.getSwitchValue('disable-features') : false,
        '--disable-kill-after-bad-ipc': app.commandLine.hasSwitch('disable-kill-after-bad-ipc') ? app.commandLine.getSwitchValue('disable-kill-after-bad-ipc') : false,
        '--disable-webrtc-encryption': app.commandLine.hasSwitch('disable-webrtc-encryption') ? app.commandLine.getSwitchValue('disable-webrtc-encryption') : false,
        '--disable-xss-auditor': app.commandLine.hasSwitch('disable-xss-auditor') ? app.commandLine.getSwitchValue('disable-xss-auditor') : false,
        '--enable-local-file-accesses': app.commandLine.hasSwitch('enable-local-file-accesses') ? app.commandLine.getSwitchValue('enable-local-file-accesses') : false,
        '--enable-nacl-debug': app.commandLine.hasSwitch('enable-nacl-debug') ? app.commandLine.getSwitchValue('enable-nacl-debug') : false,
        '--remote-debugging-address': app.commandLine.hasSwitch('remote-debugging-address') ? app.commandLine.getSwitchValue('remote-debugging-address') : false,
        '--remote-debugging-port': app.commandLine.hasSwitch('remote-debugging-port') ? app.commandLine.getSwitchValue('remote-debugging-port') : false,
        '--inspect': app.commandLine.hasSwitch('inspect') ? app.commandLine.getSwitchValue('inspect') : false,
        '--inspect-brk': app.commandLine.hasSwitch('inspect-brk') ? app.commandLine.getSwitchValue('inspect-brk') : false,
        '--explicitly-allowed-ports': app.commandLine.hasSwitch('explicitly-allowed-ports') ? app.commandLine.getSwitchValue('explicitly-allowed-ports') : false,
        '--expose-internals-for-testing': app.commandLine.hasSwitch('expose-internals-for-testing') ? app.commandLine.getSwitchValue('expose-internals-for-testing') : false,
        '--gpu-launcher': app.commandLine.hasSwitch('gpu-launcher') ? app.commandLine.getSwitchValue('gpu-launcher') : false,
        '--nacl-dangerous-no-sandbox-nonsfi': app.commandLine.hasSwitch('nacl-dangerous-no-sandbox-nonsfi') ? app.commandLine.getSwitchValue('nacl-dangerous-no-sandbox-nonsfi') : false,
        '--nacl-gdb-script': app.commandLine.hasSwitch('nacl-gdb-script') ? app.commandLine.getSwitchValue('nacl-gdb-script') : false,
        '--net-log-capture-mode': app.commandLine.hasSwitch('net-log-capture-mode') ? app.commandLine.getSwitchValue('net-log-capture-mode') : false,
        '--no-sandbox': app.commandLine.hasSwitch('no-sandbox') ? app.commandLine.getSwitchValue('no-sandbox') : false,
        '--reduce-security-for-testing': app.commandLine.hasSwitch('reduce-security-for-testing') ? app.commandLine.getSwitchValue('reduce-security-for-testing') : false,
        '--unsafely-treat-insecure-origin-as-secure': app.commandLine.hasSwitch('unsafely-treat-insecure-origin-as-secure') ? app.commandLine.getSwitchValue('unsafely-treat-insecure-origin-as-secure') : false,
      },
      'EventHandlers': {
        'will-navigate': {
          listenerCount: this.webContents.listenerCount('will-navigate'),
          listenerAsString: this.webContents.listenerCount('will-navigate')? this.webContents.listeners('will-navigate')[0].toString() : ''
        },
        'new-window': {
          listenerCount: this.webContents.listenerCount('new-window'),
          listenerAsString: this.webContents.listenerCount('new-window')? this.webContents.listeners('new-window')[0].toString() : ''
        },
        'will-attach-webview': {
          listenerCount: this.webContents.listenerCount('will-attach-webview'),
          listenerAsString: this.webContents.listenerCount('will-attach-webview')? this.webContents.listeners('will-attach-webview')[0].toString() : ''
        },
        'certificate-error': {
          listenerCount: app.listenerCount('certificate-error'),
          listenerAsString: app.listenerCount('certificate-error') > 1? app.listeners('certificate-error')[1].toString() : ''
        },
        'web-contents-created': {
          listenerCount: app.listenerCount('web-contents-created'),
          listenerAsString: app.listenerCount('web-contents-created') ? app.listeners('web-contents-created')[0].toString() : ''
        }
      }
    }
    let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
    if (typeof(json) == undefined)
      json = []
    json.push(objectToPush);    
    fs.writeFileSync("report.json", JSON.stringify(json));
  });
  // [inspectron] End


  Object.defineProperty(this, 'devToolsWebContents', {
    enumerable: true,
    configurable: false,
    get () {
      return this.webContents.devToolsWebContents;
    }
  });
};

const isBrowserWindow = (win: any) => {
  return win && win.constructor.name === 'BrowserWindow';
};

BrowserWindow.fromId = (id: number) => {
  const win = BaseWindow.fromId(id);
  return isBrowserWindow(win) ? win as any as BWT : null;
};

BrowserWindow.getAllWindows = () => {
  return BaseWindow.getAllWindows().filter(isBrowserWindow) as any[] as BWT[];
};

BrowserWindow.getFocusedWindow = () => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
      if (window.isFocused() || window.webContents.isDevToolsFocused()) return window;
    }
  }
  return null;
};

BrowserWindow.fromWebContents = (webContents: WebContents) => {
  return webContents.getOwnerBrowserWindow();
};

BrowserWindow.fromBrowserView = (browserView: BrowserView) => {
  return BrowserWindow.fromWebContents(browserView.webContents);
};

BrowserWindow.prototype.setTouchBar = function (touchBar) {
  (TouchBar as any)._setOnWindow(touchBar, this);
};

// Forwarded to webContents:

BrowserWindow.prototype.loadURL = function (...args) {
  // [inspectron]: Begin
  fs.stat('report.json', (error, stats) => {
      if(error) {
          fs.writeFileSync('report.json', JSON.stringify([]));
      } else {
          console.log("Report already exists!");
      }
  });
  let objectToPush = {
    'Module': ['BrowserWindow'],
    'Attribute': 'loadURL',
    'Event': ['loadURL'],
    'URL': args[0]
  }
  let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
  if (typeof(json) == undefined)
    json = []
  json.push(objectToPush);    
  fs.writeFileSync("report.json", JSON.stringify(json));
  // [inspectron]: End
  return this.webContents.loadURL(...args);
};

BrowserWindow.prototype.getURL = function () {
  return this.webContents.getURL();
};

BrowserWindow.prototype.loadFile = function (...args) {
    // [inspectron]: Begin
    fs.stat('report.json', (error, stats) => {
        if(error) {
            fs.writeFileSync('report.json', JSON.stringify([]));
        } else {
            console.log("Report already exists!");
        }
    });
    let objectToPush = {
      'Module': ['BrowserWindow'],
      'Attribute': 'loadFile',
      'Event': ['loadFile'],
      'File': args[0]
    }
    let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
    if (typeof(json) == undefined)
      json = []
    json.push(objectToPush);    
    fs.writeFileSync("report.json", JSON.stringify(json));
    // [inspectron]: End

  return this.webContents.loadFile(...args);
};

BrowserWindow.prototype.reload = function (...args) {
  return this.webContents.reload(...args);
};

BrowserWindow.prototype.send = function (...args) {
  return this.webContents.send(...args);
};

BrowserWindow.prototype.openDevTools = function (...args) {
  return this.webContents.openDevTools(...args);
};

BrowserWindow.prototype.closeDevTools = function () {
  return this.webContents.closeDevTools();
};

BrowserWindow.prototype.isDevToolsOpened = function () {
  return this.webContents.isDevToolsOpened();
};

BrowserWindow.prototype.isDevToolsFocused = function () {
  return this.webContents.isDevToolsFocused();
};

BrowserWindow.prototype.toggleDevTools = function () {
  return this.webContents.toggleDevTools();
};

BrowserWindow.prototype.inspectElement = function (...args) {
  return this.webContents.inspectElement(...args);
};

BrowserWindow.prototype.inspectSharedWorker = function () {
  return this.webContents.inspectSharedWorker();
};

BrowserWindow.prototype.inspectServiceWorker = function () {
  return this.webContents.inspectServiceWorker();
};

BrowserWindow.prototype.showDefinitionForSelection = function () {
  return this.webContents.showDefinitionForSelection();
};

BrowserWindow.prototype.capturePage = function (...args) {
  return this.webContents.capturePage(...args);
};

BrowserWindow.prototype.getBackgroundThrottling = function () {
  return this.webContents.getBackgroundThrottling();
};

BrowserWindow.prototype.setBackgroundThrottling = function (allowed: boolean) {
  return this.webContents.setBackgroundThrottling(allowed);
};

module.exports = BrowserWindow;
