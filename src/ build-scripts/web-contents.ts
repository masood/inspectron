import { app, ipcMain, session, webFrameMain } from 'electron/main';
import type { BrowserWindowConstructorOptions, LoadURLOptions } from 'electron/main';

import * as url from 'url';
import * as path from 'path';
import { openGuestWindow, makeWebPreferences, parseContentTypeFormat } from '@electron/internal/browser/guest-window-manager';
import { parseFeatures } from '@electron/internal/browser/parse-features-string';
import { ipcMainInternal } from '@electron/internal/browser/ipc-main-internal';
import * as ipcMainUtils from '@electron/internal/browser/ipc-main-internal-utils';
import { MessagePortMain } from '@electron/internal/browser/message-port-main';
import { IPC_MESSAGES } from '@electron/internal/common/ipc-messages';
import { IpcMainImpl } from '@electron/internal/browser/ipc-main-impl';
import * as deprecate from '@electron/internal/common/deprecate';
// [inspectron] Begin
import * as fs from 'fs';
// [inspectron] End

// session is not used here, the purpose is to make sure session is initialized
// before the webContents module.
// eslint-disable-next-line
session

const webFrameMainBinding = process._linkedBinding('electron_browser_web_frame_main');

let nextId = 0;
const getNextId = function () {
  return ++nextId;
};

type PostData = LoadURLOptions['postData']

// Stock page sizes
const PDFPageSizes: Record<string, ElectronInternal.MediaSize> = {
  A5: {
    custom_display_name: 'A5',
    height_microns: 210000,
    name: 'ISO_A5',
    width_microns: 148000
  },
  A4: {
    custom_display_name: 'A4',
    height_microns: 297000,
    name: 'ISO_A4',
    is_default: 'true',
    width_microns: 210000
  },
  A3: {
    custom_display_name: 'A3',
    height_microns: 420000,
    name: 'ISO_A3',
    width_microns: 297000
  },
  Legal: {
    custom_display_name: 'Legal',
    height_microns: 355600,
    name: 'NA_LEGAL',
    width_microns: 215900
  },
  Letter: {
    custom_display_name: 'Letter',
    height_microns: 279400,
    name: 'NA_LETTER',
    width_microns: 215900
  },
  Tabloid: {
    height_microns: 431800,
    name: 'NA_LEDGER',
    width_microns: 279400,
    custom_display_name: 'Tabloid'
  }
} as const;

const paperFormats: Record<string, ElectronInternal.PageSize> = {
  letter: { width: 8.5, height: 11 },
  legal: { width: 8.5, height: 14 },
  tabloid: { width: 11, height: 17 },
  ledger: { width: 17, height: 11 },
  a0: { width: 33.1, height: 46.8 },
  a1: { width: 23.4, height: 33.1 },
  a2: { width: 16.54, height: 23.4 },
  a3: { width: 11.7, height: 16.54 },
  a4: { width: 8.27, height: 11.7 },
  a5: { width: 5.83, height: 8.27 },
  a6: { width: 4.13, height: 5.83 }
} as const;

// The minimum micron size Chromium accepts is that where:
// Per printing/units.h:
//  * kMicronsPerInch - Length of an inch in 0.001mm unit.
//  * kPointsPerInch - Length of an inch in CSS's 1pt unit.
//
// Formula: (kPointsPerInch / kMicronsPerInch) * size >= 1
//
// Practically, this means microns need to be > 352 microns.
// We therefore need to verify this or it will silently fail.
const isValidCustomPageSize = (width: number, height: number) => {
  return [width, height].every(x => x > 352);
};

// JavaScript implementations of WebContents.
const binding = process._linkedBinding('electron_browser_web_contents');
const printing = process._linkedBinding('electron_browser_printing');
const { WebContents } = binding as { WebContents: { prototype: Electron.WebContents } };

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
// WebContents.prototype.session.webRequest.onHeadersReceived = wrap(WebContents.prototype.session.webRequest.onHeadersReceived);


// console.log(`[inspectron] (web-contents.ts) Session Properties: ${Object.keys(session.fromPartition(''))}`)
// [inspectron]: End Wrap Default Protocol Client


WebContents.prototype.postMessage = function (...args) {
  return this.mainFrame.postMessage(...args);
};

WebContents.prototype.send = function (channel, ...args) {
  console.log(`[inspectron] (web-contents.ts) Send: ${channel}, Args: ${args}`);
  return this.mainFrame.send(channel, ...args);
};

WebContents.prototype._sendInternal = function (channel, ...args) {
  console.log(`[inspectron] (web-contents.ts) Send Internal: ${channel}, Args: ${args}`);
  if (args[0] == 'console-message') {
    fs.stat('report-console-messages.json', (error, stats) => {
        if(error) {
            fs.writeFileSync('report-console-messages.json', JSON.stringify([]));
        } else {
            console.log("Report for Console Messages already exists!");
        }
    });
    let objectToPush = {
      'Module': ['WebContents', 'Console Messages'],
      'Attribute': 'console-messages',
      'Message': args[1]['message'],
    }
    let json = JSON.parse(fs.readFileSync('report-console-messages.json', 'utf-8'));
    if (typeof(json) == undefined)
      json = []
    json.push(objectToPush);    
    fs.writeFileSync("report-console-messages.json", JSON.stringify(json));

    console.log(`[inspectron] (web-contents.ts) Console Message is here: ${args[1]['message']}`);
  }
  for (const paramProperty in args) {
    console.log(`(Session Property): ${paramProperty} : ${args[paramProperty]}`);
    if (typeof(args[paramProperty]) === 'object') {
      for (const paramPropertyOne in args[paramProperty]) {
        console.log(`(Session Property): ${paramPropertyOne} : ${args[paramProperty][paramPropertyOne]}`);
        if (typeof(args[paramProperty]) === 'object') {
          for (const paramPropertyTwo in args[paramProperty]) {
            console.log(`(Session Property): ${paramPropertyTwo } : ${args[paramProperty][paramPropertyTwo]}`);
          }
        }
      }
    }
  }
  return this.mainFrame._sendInternal(channel, ...args);
};

function getWebFrame (contents: Electron.WebContents, frame: number | [number, number]) {
  if (typeof frame === 'number') {
    return webFrameMain.fromId(contents.mainFrame.processId, frame);
  } else if (Array.isArray(frame) && frame.length === 2 && frame.every(value => typeof value === 'number')) {
    return webFrameMain.fromId(frame[0], frame[1]);
  } else {
    throw new Error('Missing required frame argument (must be number or [processId, frameId])');
  }
}

WebContents.prototype.sendToFrame = function (frameId, channel, ...args) {
  const frame = getWebFrame(this, frameId);
  if (!frame) return false;
  frame.send(channel, ...args);
  return true;
};

// Following methods are mapped to webFrame.
const webFrameMethods = [
  'insertCSS',
  'insertText',
  'removeInsertedCSS',
  'setVisualZoomLevelLimits'
] as ('insertCSS' | 'insertText' | 'removeInsertedCSS' | 'setVisualZoomLevelLimits')[];

for (const method of webFrameMethods) {
  WebContents.prototype[method] = function (...args: any[]): Promise<any> {
    

    // [inspectron]: Begin
    let objectToPush = {
      'Module': ['WebContents'],
      'Attribute': ['webFrameMethods'],
      'Method': method,
      'Args': args,
    }
    let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
    if (typeof(json) == undefined)
      json = []
    json.push(objectToPush);    
    fs.writeFileSync("report.json", JSON.stringify(json));
    // [inspectron]: End

    return ipcMainUtils.invokeInWebContents(this, IPC_MESSAGES.RENDERER_WEB_FRAME_METHOD, method, ...args);
  };
}

const waitTillCanExecuteJavaScript = async (webContents: Electron.WebContents) => {
  if (webContents.getURL() && !webContents.isLoadingMainFrame()) return;

  return new Promise<void>((resolve) => {
    webContents.once('did-stop-loading', () => {
      resolve();
    });
  });
};

// Make sure WebContents::executeJavaScript would run the code only when the
// WebContents has been loaded.
WebContents.prototype.executeJavaScript = async function (code, hasUserGesture) {

  // [inspectron]: Begin
  let objectToPush = {
    'Module': ['WebContents'],
    'Attribute': ['webFrameMethods'],
    'Method': 'executeJavascript',
    'Isolated': false,
    'Code': code,
    'hasUserGesture': hasUserGesture
  }
  let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
  if (typeof(json) == undefined)
    json = []
  json.push(objectToPush);    
  fs.writeFileSync("report.json", JSON.stringify(json));
  // [inspectron]: End


  await waitTillCanExecuteJavaScript(this);
  return ipcMainUtils.invokeInWebContents(this, IPC_MESSAGES.RENDERER_WEB_FRAME_METHOD, 'executeJavaScript', String(code), !!hasUserGesture);
};
WebContents.prototype.executeJavaScriptInIsolatedWorld = async function (worldId, code, hasUserGesture) {

    // [inspectron]: Begin
    let objectToPush = {
      'Module': ['WebContents'],
      'Attribute': ['webFrameMethods'],
      'Method': 'executeJavascript',
      'Isolated': worldId,
      'Code': code,
      'hasUserGesture': hasUserGesture
    }
    let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
    if (typeof(json) == undefined)
      json = []
    json.push(objectToPush);    
    fs.writeFileSync("report.json", JSON.stringify(json));
    // [inspectron]: End

  await waitTillCanExecuteJavaScript(this);
  return ipcMainUtils.invokeInWebContents(this, IPC_MESSAGES.RENDERER_WEB_FRAME_METHOD, 'executeJavaScriptInIsolatedWorld', worldId, code, !!hasUserGesture);
};

// Translate the options of printToPDF.

let pendingPromise: Promise<any> | undefined;
WebContents.prototype.printToPDF = async function (options) {
  const printSettings: Record<string, any> = {
    requestID: getNextId(),
    landscape: false,
    displayHeaderFooter: false,
    headerTemplate: '',
    footerTemplate: '',
    printBackground: false,
    scale: 1.0,
    paperWidth: 8.5,
    paperHeight: 11.0,
    marginTop: 0.0,
    marginBottom: 0.0,
    marginLeft: 0.0,
    marginRight: 0.0,
    pageRanges: '',
    preferCSSPageSize: false
  };

  if (options.landscape !== undefined) {
    if (typeof options.landscape !== 'boolean') {
      return Promise.reject(new Error('landscape must be a Boolean'));
    }
    printSettings.landscape = options.landscape;
  }

  if (options.displayHeaderFooter !== undefined) {
    if (typeof options.displayHeaderFooter !== 'boolean') {
      return Promise.reject(new Error('displayHeaderFooter must be a Boolean'));
    }
    printSettings.displayHeaderFooter = options.displayHeaderFooter;
  }

  if (options.printBackground !== undefined) {
    if (typeof options.printBackground !== 'boolean') {
      return Promise.reject(new Error('printBackground must be a Boolean'));
    }
    printSettings.shouldPrintBackgrounds = options.printBackground;
  }

  if (options.scale !== undefined) {
    if (typeof options.scale !== 'number') {
      return Promise.reject(new Error('scale must be a Number'));
    }
    printSettings.scale = options.scale;
  }

  const { pageSize } = options;
  if (pageSize !== undefined) {
    if (typeof pageSize === 'string') {
      const format = paperFormats[pageSize.toLowerCase()];
      if (!format) {
        return Promise.reject(new Error(`Invalid pageSize ${pageSize}`));
      }

      printSettings.paperWidth = format.width;
      printSettings.paperHeight = format.height;
    } else if (typeof options.pageSize === 'object') {
      if (!pageSize.height || !pageSize.width) {
        return Promise.reject(new Error('height and width properties are required for pageSize'));
      }

      printSettings.paperWidth = pageSize.width;
      printSettings.paperHeight = pageSize.height;
    } else {
      return Promise.reject(new Error('pageSize must be a String or Object'));
    }
  }

  const { margins } = options;
  if (margins !== undefined) {
    if (typeof margins !== 'object') {
      return Promise.reject(new Error('margins must be an Object'));
    }

    if (margins.top !== undefined) {
      if (typeof margins.top !== 'number') {
        return Promise.reject(new Error('margins.top must be a Number'));
      }
      printSettings.marginTop = margins.top;
    }

    if (margins.bottom !== undefined) {
      if (typeof margins.bottom !== 'number') {
        return Promise.reject(new Error('margins.bottom must be a Number'));
      }
      printSettings.marginBottom = margins.bottom;
    }

    if (margins.left !== undefined) {
      if (typeof margins.left !== 'number') {
        return Promise.reject(new Error('margins.left must be a Number'));
      }
      printSettings.marginLeft = margins.left;
    }

    if (margins.right !== undefined) {
      if (typeof margins.right !== 'number') {
        return Promise.reject(new Error('margins.right must be a Number'));
      }
      printSettings.marginRight = margins.right;
    }
  }

  if (options.pageRanges !== undefined) {
    if (typeof options.pageRanges !== 'string') {
      return Promise.reject(new Error('printBackground must be a String'));
    }
    printSettings.pageRanges = options.pageRanges;
  }

  if (options.headerTemplate !== undefined) {
    if (typeof options.headerTemplate !== 'string') {
      return Promise.reject(new Error('headerTemplate must be a String'));
    }
    printSettings.headerTemplate = options.headerTemplate;
  }

  if (options.footerTemplate !== undefined) {
    if (typeof options.footerTemplate !== 'string') {
      return Promise.reject(new Error('footerTemplate must be a String'));
    }
    printSettings.footerTemplate = options.footerTemplate;
  }

  if (options.preferCSSPageSize !== undefined) {
    if (typeof options.preferCSSPageSize !== 'boolean') {
      return Promise.reject(new Error('footerTemplate must be a String'));
    }
    printSettings.preferCSSPageSize = options.preferCSSPageSize;
  }

  if (this._printToPDF) {
    if (pendingPromise) {
      pendingPromise = pendingPromise.then(() => this._printToPDF(printSettings));
    } else {
      pendingPromise = this._printToPDF(printSettings);
    }
    return pendingPromise;
  } else {
    const error = new Error('Printing feature is disabled');
    return Promise.reject(error);
  }
};

WebContents.prototype.print = function (options: ElectronInternal.WebContentsPrintOptions = {}, callback) {
  // TODO(codebytere): deduplicate argument sanitization by moving rest of
  // print param logic into new file shared between printToPDF and print
  if (typeof options === 'object') {
    // Optionally set size for PDF.
    if (options.pageSize !== undefined) {
      const pageSize = options.pageSize;
      if (typeof pageSize === 'object') {
        if (!pageSize.height || !pageSize.width) {
          throw new Error('height and width properties are required for pageSize');
        }

        // Dimensions in Microns - 1 meter = 10^6 microns
        const height = Math.ceil(pageSize.height);
        const width = Math.ceil(pageSize.width);
        if (!isValidCustomPageSize(width, height)) {
          throw new Error('height and width properties must be minimum 352 microns.');
        }

        options.mediaSize = {
          name: 'CUSTOM',
          custom_display_name: 'Custom',
          height_microns: height,
          width_microns: width
        };
      } else if (PDFPageSizes[pageSize]) {
        options.mediaSize = PDFPageSizes[pageSize];
      } else {
        throw new Error(`Unsupported pageSize: ${pageSize}`);
      }
    }
  }

  if (this._print) {
    if (callback) {
      this._print(options, callback);
    } else {
      this._print(options);
    }
  } else {
    console.error('Error: Printing feature is disabled.');
  }
};

WebContents.prototype.getPrinters = function () {
  // TODO(nornagon): this API has nothing to do with WebContents and should be
  // moved.
  if (printing.getPrinterList) {
    return printing.getPrinterList();
  } else {
    console.error('Error: Printing feature is disabled.');
    return [];
  }
};

WebContents.prototype.getPrintersAsync = async function () {
  // TODO(nornagon): this API has nothing to do with WebContents and should be
  // moved.
  if (printing.getPrinterListAsync) {
    return printing.getPrinterListAsync();
  } else {
    console.error('Error: Printing feature is disabled.');
    return [];
  }
};

WebContents.prototype.loadFile = function (filePath, options = {}) {
  if (typeof filePath !== 'string') {
    throw new Error('Must pass filePath as a string');
  }
  const { query, search, hash } = options;

  return this.loadURL(url.format({
    protocol: 'file',
    slashes: true,
    pathname: path.resolve(app.getAppPath(), filePath),
    query,
    search,
    hash
  }));
};

WebContents.prototype.loadURL = function (url, options) {
  if (!options) {
    options = {};
  }

  const p = new Promise<void>((resolve, reject) => {
    const resolveAndCleanup = () => {
      removeListeners();
      resolve();
    };
    const rejectAndCleanup = (errorCode: number, errorDescription: string, url: string) => {
      const err = new Error(`${errorDescription} (${errorCode}) loading '${typeof url === 'string' ? url.substr(0, 2048) : url}'`);
      Object.assign(err, { errno: errorCode, code: errorDescription, url });
      removeListeners();
      reject(err);
    };
    const finishListener = () => {
      resolveAndCleanup();
    };
    const failListener = (event: Electron.Event, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
      if (isMainFrame) {
        rejectAndCleanup(errorCode, errorDescription, validatedURL);
      }
    };

    let navigationStarted = false;
    const navigationListener = (event: Electron.Event, url: string, isSameDocument: boolean, isMainFrame: boolean) => {
      if (isMainFrame) {
        if (navigationStarted && !isSameDocument) {
          // the webcontents has started another unrelated navigation in the
          // main frame (probably from the app calling `loadURL` again); reject
          // the promise
          // We should only consider the request aborted if the "navigation" is
          // actually navigating and not simply transitioning URL state in the
          // current context.  E.g. pushState and `location.hash` changes are
          // considered navigation events but are triggered with isSameDocument.
          // We can ignore these to allow virtual routing on page load as long
          // as the routing does not leave the document
          return rejectAndCleanup(-3, 'ERR_ABORTED', url);
        }
        navigationStarted = true;
      }
    };
    const stopLoadingListener = () => {
      // By the time we get here, either 'finish' or 'fail' should have fired
      // if the navigation occurred. However, in some situations (e.g. when
      // attempting to load a page with a bad scheme), loading will stop
      // without emitting finish or fail. In this case, we reject the promise
      // with a generic failure.
      // TODO(jeremy): enumerate all the cases in which this can happen. If
      // the only one is with a bad scheme, perhaps ERR_INVALID_ARGUMENT
      // would be more appropriate.
      rejectAndCleanup(-2, 'ERR_FAILED', url);
    };
    const removeListeners = () => {
      this.removeListener('did-finish-load', finishListener);
      this.removeListener('did-fail-load', failListener);
      this.removeListener('did-start-navigation', navigationListener);
      this.removeListener('did-stop-loading', stopLoadingListener);
      this.removeListener('destroyed', stopLoadingListener);
    };
    this.on('did-finish-load', finishListener);
    this.on('did-fail-load', failListener);
    this.on('did-start-navigation', navigationListener);
    this.on('did-stop-loading', stopLoadingListener);
    this.on('destroyed', stopLoadingListener);
  });
  // Add a no-op rejection handler to silence the unhandled rejection error.
  p.catch(() => {});
  this._loadURL(url, options);
  this.emit('load-url', url, options);
  return p;
};

WebContents.prototype.setWindowOpenHandler = function (handler: (details: Electron.HandlerDetails) => ({action: 'deny'} | {action: 'allow', overrideBrowserWindowOptions?: BrowserWindowConstructorOptions, outlivesOpener?: boolean})) {
  // [inspectron]: Begin
  fs.stat('report.json', (error, stats) => {
      if(error) {
          fs.writeFileSync('report.json', JSON.stringify([]));
      } else {
          console.log("Report already exists!");
      }
  });
  let objectToPush = {
    'Module': ['WebContents'],
    'Attribute': 'setWindowOpenHandler',
    'Handler': handler.toString()
  }
  let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
  if (typeof(json) == undefined)
    json = []
  json.push(objectToPush);    
  fs.writeFileSync("report.json", JSON.stringify(json));
  // [inspectron]: End

  this._windowOpenHandler = handler;
};

WebContents.prototype._callWindowOpenHandler = function (event: Electron.Event, details: Electron.HandlerDetails): {browserWindowConstructorOptions: BrowserWindowConstructorOptions | null, outlivesOpener: boolean} {
  const defaultResponse = {
    browserWindowConstructorOptions: null,
    outlivesOpener: false
  };
  if (!this._windowOpenHandler) {
    return defaultResponse;
  }

  const response = this._windowOpenHandler(details);

  if (typeof response !== 'object') {
    event.preventDefault();
    console.error(`The window open handler response must be an object, but was instead of type '${typeof response}'.`);
    return defaultResponse;
  }

  if (response === null) {
    event.preventDefault();
    console.error('The window open handler response must be an object, but was instead null.');
    return defaultResponse;
  }

  if (response.action === 'deny') {
    event.preventDefault();
    return defaultResponse;
  } else if (response.action === 'allow') {
    if (typeof response.overrideBrowserWindowOptions === 'object' && response.overrideBrowserWindowOptions !== null) {
      return {
        browserWindowConstructorOptions: response.overrideBrowserWindowOptions,
        outlivesOpener: typeof response.outlivesOpener === 'boolean' ? response.outlivesOpener : false
      };
    } else {
      return {
        browserWindowConstructorOptions: {},
        outlivesOpener: typeof response.outlivesOpener === 'boolean' ? response.outlivesOpener : false
      };
    }
  } else {
    event.preventDefault();
    console.error('The window open handler response must be an object with an \'action\' property of \'allow\' or \'deny\'.');
    return defaultResponse;
  }
};

const addReplyToEvent = (event: Electron.IpcMainEvent) => {
  const { processId, frameId } = event;
  event.reply = (channel: string, ...args: any[]) => {
    event.sender.sendToFrame([processId, frameId], channel, ...args);
  };
};

const addSenderFrameToEvent = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
  const { processId, frameId } = event;
  Object.defineProperty(event, 'senderFrame', {
    get: () => webFrameMain.fromId(processId, frameId)
  });
};

const addReturnValueToEvent = (event: Electron.IpcMainEvent) => {
  Object.defineProperty(event, 'returnValue', {
    set: (value) => event.sendReply(value),
    get: () => {}
  });
};

const getWebFrameForEvent = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
  if (!event.processId || !event.frameId) return null;
  return webFrameMainBinding.fromIdOrNull(event.processId, event.frameId);
};

const commandLine = process._linkedBinding('electron_common_command_line');
const environment = process._linkedBinding('electron_common_environment');

const loggingEnabled = () => {
  return environment.hasVar('ELECTRON_ENABLE_LOGGING') || commandLine.hasSwitch('enable-logging');
};

// Add JavaScript wrappers for WebContents class.
WebContents.prototype._init = function () {
  const prefs = this.getLastWebPreferences() || {};
  if (!prefs.nodeIntegration && prefs.preload != null && prefs.sandbox == null) {
    deprecate.log('The default sandbox option for windows without nodeIntegration is changing. Presently, by default, when a window has a preload script, it defaults to being unsandboxed. In Electron 20, this default will be changing, and all windows that have nodeIntegration: false (which is the default) will be sandboxed by default. If your preload script doesn\'t use Node, no action is needed. If your preload script does use Node, either refactor it to move Node usage to the main process, or specify sandbox: false in your WebPreferences.');
  }
  // Read off the ID at construction time, so that it's accessible even after
  // the underlying C++ WebContents is destroyed.
  const id = this.id;
  Object.defineProperty(this, 'id', {
    value: id,
    writable: false
  });

  this._windowOpenHandler = null;

  const ipc = new IpcMainImpl();
  Object.defineProperty(this, 'ipc', {
    get () { return ipc; },
    enumerable: true
  });

  // Dispatch IPC messages to the ipc module.
  this.on('-ipc-message' as any, function (this: Electron.WebContents, event: Electron.IpcMainEvent, internal: boolean, channel: string, args: any[]) {
    addSenderFrameToEvent(event);
    if (internal) {
      ipcMainInternal.emit(channel, event, ...args);
    } else {
      addReplyToEvent(event);
      this.emit('ipc-message', event, channel, ...args);
      const maybeWebFrame = getWebFrameForEvent(event);
      maybeWebFrame && maybeWebFrame.ipc.emit(channel, event, ...args);
      ipc.emit(channel, event, ...args);
      ipcMain.emit(channel, event, ...args);
    }
  });

  this.on('-ipc-invoke' as any, function (event: Electron.IpcMainInvokeEvent, internal: boolean, channel: string, args: any[]) {
    addSenderFrameToEvent(event);
    event._reply = (result: any) => event.sendReply({ result });
    event._throw = (error: Error) => {
      console.error(`Error occurred in handler for '${channel}':`, error);
      event.sendReply({ error: error.toString() });
    };
    const maybeWebFrame = getWebFrameForEvent(event);
    const targets: (ElectronInternal.IpcMainInternal| undefined)[] = internal ? [ipcMainInternal] : [maybeWebFrame?.ipc, ipc, ipcMain];
    const target = targets.find(target => target && (target as any)._invokeHandlers.has(channel));
    if (target) {
      console.log(`[inspectron] (web-contents.ts) Target Handlers for Event: ${event}; ${(target as any)._invokeHandlers}`);
      (target as any)._invokeHandlers.get(channel)(event, ...args);
    } else {
      event._throw(`No handler registered for '${channel}'`);
    }
  });

  this.on('-ipc-message-sync' as any, function (this: Electron.WebContents, event: Electron.IpcMainEvent, internal: boolean, channel: string, args: any[]) {
    addSenderFrameToEvent(event);
    addReturnValueToEvent(event);
    if (internal) {
      ipcMainInternal.emit(channel, event, ...args);
    } else {
      addReplyToEvent(event);
      const maybeWebFrame = getWebFrameForEvent(event);
      if (this.listenerCount('ipc-message-sync') === 0 && ipc.listenerCount(channel) === 0 && ipcMain.listenerCount(channel) === 0 && (!maybeWebFrame || maybeWebFrame.ipc.listenerCount(channel) === 0)) {
        console.warn(`WebContents #${this.id} called ipcRenderer.sendSync() with '${channel}' channel without listeners.`);
      }
      this.emit('ipc-message-sync', event, channel, ...args);
      maybeWebFrame && maybeWebFrame.ipc.emit(channel, event, ...args);
      ipc.emit(channel, event, ...args);
      ipcMain.emit(channel, event, ...args);
    }
  });

  this.on('-ipc-ports' as any, function (event: Electron.IpcMainEvent, internal: boolean, channel: string, message: any, ports: any[]) {
    addSenderFrameToEvent(event);
    event.ports = ports.map(p => new MessagePortMain(p));
    const maybeWebFrame = getWebFrameForEvent(event);
    maybeWebFrame && maybeWebFrame.ipc.emit(channel, event, message);
    ipc.emit(channel, event, message);
    ipcMain.emit(channel, event, message);
  });

  this.on('crashed', (event, ...args) => {
    app.emit('renderer-process-crashed', event, this, ...args);
  });

  this.on('render-process-gone', (event, details) => {
    app.emit('render-process-gone', event, this, details);

    // Log out a hint to help users better debug renderer crashes.
    if (loggingEnabled()) {
      console.info(`Renderer process ${details.reason} - see https://www.electronjs.org/docs/tutorial/application-debugging for potential debugging information.`);
    }
  });

  // The devtools requests the webContents to reload.
  this.on('devtools-reload-page', function (this: Electron.WebContents) {
    this.reload();
  });

  if (this.getType() !== 'remote') {
    // Make new windows requested by links behave like "window.open".
    this.on('-new-window' as any, (event: ElectronInternal.Event, url: string, frameName: string, disposition: Electron.HandlerDetails['disposition'],
      rawFeatures: string, referrer: Electron.Referrer, postData: PostData) => {
      const postBody = postData ? {
        data: postData,
        ...parseContentTypeFormat(postData)
      } : undefined;
      const details: Electron.HandlerDetails = {
        url,
        frameName,
        features: rawFeatures,
        referrer,
        postBody,
        disposition
      };

      let result: ReturnType<typeof this._callWindowOpenHandler>;
      try {
        result = this._callWindowOpenHandler(event, details);
      } catch (err) {
        event.preventDefault();
        throw err;
      }

      const options = result.browserWindowConstructorOptions;
      if (!event.defaultPrevented) {
        openGuestWindow({
          embedder: event.sender,
          disposition,
          referrer,
          postData,
          overrideBrowserWindowOptions: options || {},
          windowOpenArgs: details,
          outlivesOpener: result.outlivesOpener
        });
      }
    });

    let windowOpenOverriddenOptions: BrowserWindowConstructorOptions | null = null;
    let windowOpenOutlivesOpenerOption: boolean = false;
    this.on('-will-add-new-contents' as any, (event: ElectronInternal.Event, url: string, frameName: string, rawFeatures: string, disposition: Electron.HandlerDetails['disposition'], referrer: Electron.Referrer, postData: PostData) => {
      const postBody = postData ? {
        data: postData,
        ...parseContentTypeFormat(postData)
      } : undefined;
      const details: Electron.HandlerDetails = {
        url,
        frameName,
        features: rawFeatures,
        disposition,
        referrer,
        postBody
      };

      let result: ReturnType<typeof this._callWindowOpenHandler>;
      try {
        result = this._callWindowOpenHandler(event, details);
      } catch (err) {
        event.preventDefault();
        throw err;
      }

      windowOpenOutlivesOpenerOption = result.outlivesOpener;
      windowOpenOverriddenOptions = result.browserWindowConstructorOptions;
      if (!event.defaultPrevented) {
        const secureOverrideWebPreferences = windowOpenOverriddenOptions ? {
          // Allow setting of backgroundColor as a webPreference even though
          // it's technically a BrowserWindowConstructorOptions option because
          // we need to access it in the renderer at init time.
          backgroundColor: windowOpenOverriddenOptions.backgroundColor,
          transparent: windowOpenOverriddenOptions.transparent,
          ...windowOpenOverriddenOptions.webPreferences
        } : undefined;
        const { webPreferences: parsedWebPreferences } = parseFeatures(rawFeatures);
        const webPreferences = makeWebPreferences({
          embedder: event.sender,
          insecureParsedWebPreferences: parsedWebPreferences,
          secureOverrideWebPreferences
        });
        windowOpenOverriddenOptions = {
          ...windowOpenOverriddenOptions,
          webPreferences
        };
        this._setNextChildWebPreferences(webPreferences);
      }
    });

    // Create a new browser window for "window.open"
    this.on('-add-new-contents' as any, (event: ElectronInternal.Event, webContents: Electron.WebContents, disposition: string,
      _userGesture: boolean, _left: number, _top: number, _width: number, _height: number, url: string, frameName: string,
      referrer: Electron.Referrer, rawFeatures: string, postData: PostData) => {
      const overriddenOptions = windowOpenOverriddenOptions || undefined;
      const outlivesOpener = windowOpenOutlivesOpenerOption;
      windowOpenOverriddenOptions = null;
      // false is the default
      windowOpenOutlivesOpenerOption = false;

      if ((disposition !== 'foreground-tab' && disposition !== 'new-window' &&
           disposition !== 'background-tab')) {
        event.preventDefault();
        return;
      }

      openGuestWindow({
        embedder: event.sender,
        guest: webContents,
        overrideBrowserWindowOptions: overriddenOptions,
        disposition,
        referrer,
        postData,
        windowOpenArgs: {
          url,
          frameName,
          features: rawFeatures
        },
        outlivesOpener
      });
    });

    console.log(`[inspectron] (web-contents.ts) WebContents _Events Properties ${Object.getOwnPropertyNames((this as any)._events)}`);
    console.log(`[inspectron] (web-contents.ts) Listener Count for will-attach-webview ${this.listenerCount('will-attach-webview')}`);
  }

  this.on('login', (event, ...args) => {
    app.emit('login', event, this, ...args);
  });

  this.on('ready-to-show' as any, () => {
    const owner = this.getOwnerBrowserWindow();
    if (owner && !owner.isDestroyed()) {
      process.nextTick(() => {
        owner.emit('ready-to-show');
      });
    }
  });

  this.on('select-bluetooth-device', (event, devices, callback) => {
    if (this.listenerCount('select-bluetooth-device') === 1) {
      // Cancel it if there are no handlers
      event.preventDefault();
      callback('');
    }
  });

  const event = process._linkedBinding('electron_browser_event').createEmpty();
  app.emit('web-contents-created', event, this);

  // Properties

  Object.defineProperty(this, 'audioMuted', {
    get: () => this.isAudioMuted(),
    set: (muted) => this.setAudioMuted(muted)
  });

  Object.defineProperty(this, 'userAgent', {
    get: () => this.getUserAgent(),
    set: (agent) => this.setUserAgent(agent)
  });

  Object.defineProperty(this, 'zoomLevel', {
    get: () => this.getZoomLevel(),
    set: (level) => this.setZoomLevel(level)
  });

  Object.defineProperty(this, 'zoomFactor', {
    get: () => this.getZoomFactor(),
    set: (factor) => this.setZoomFactor(factor)
  });

  Object.defineProperty(this, 'frameRate', {
    get: () => this.getFrameRate(),
    set: (rate) => this.setFrameRate(rate)
  });

  Object.defineProperty(this, 'backgroundThrottling', {
    get: () => this.getBackgroundThrottling(),
    set: (allowed) => this.setBackgroundThrottling(allowed)
  });
};

// Public APIs.
export function create (options = {}): Electron.WebContents {
  return new (WebContents as any)(options);
}

export function fromId (id: string) {
  return binding.fromId(id);
}

export function fromFrame (frame: Electron.WebFrameMain) {
  return binding.fromFrame(frame);
}

export function fromDevToolsTargetId (targetId: string) {
  return binding.fromDevToolsTargetId(targetId);
}

export function getFocusedWebContents () {
  let focused = null;
  for (const contents of binding.getAllWebContents()) {
    if (!contents.isFocused()) continue;
    if (focused == null) focused = contents;
    // Return webview web contents which may be embedded inside another
    // web contents that is also reporting as focused
    if (contents.getType() === 'webview') return contents;
  }
  return focused;
}
export function getAllWebContents () {
  return binding.getAllWebContents();
}
