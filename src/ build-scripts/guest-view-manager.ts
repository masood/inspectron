import { webContents } from 'electron/main';
import { ipcMainInternal } from '@electron/internal/browser/ipc-main-internal';
import * as ipcMainUtils from '@electron/internal/browser/ipc-main-internal-utils';
import { parseWebViewWebPreferences } from '@electron/internal/browser/parse-features-string';
import { syncMethods, asyncMethods, properties } from '@electron/internal/common/web-view-methods';
import { webViewEvents } from '@electron/internal/browser/web-view-events';
import { IPC_MESSAGES } from '@electron/internal/common/ipc-messages';
// [inspectron]: Begin
import * as fs from 'fs';
// [inspectron]: End

interface GuestInstance {
  elementInstanceId: number;
  visibilityState?: VisibilityState;
  embedder: Electron.WebContents;
  guest: Electron.WebContents;
}

const webViewManager = process._linkedBinding('electron_browser_web_view_manager');
const eventBinding = process._linkedBinding('electron_browser_event');
const netBinding = process._linkedBinding('electron_browser_net');

const supportedWebViewEvents = Object.keys(webViewEvents);

console.log(`[inspectron] (guest-view-manager.ts) supported Web View Events: ${supportedWebViewEvents}`);

const guestInstances = new Map<number, GuestInstance>();
const embedderElementsMap = new Map<string, number>();

function makeWebPreferences (embedder: Electron.WebContents, params: Record<string, any>) {
  
  // parse the 'webpreferences' attribute string, if set
  // this uses the same parsing rules as window.open uses for its features
  const parsedWebPreferences =
    typeof params.webpreferences === 'string'
      ? parseWebViewWebPreferences(params.webpreferences)
      : null;

  const webPreferences: Electron.WebPreferences = {
    nodeIntegration: params.nodeintegration ?? false,
    nodeIntegrationInSubFrames: params.nodeintegrationinsubframes ?? false,
    plugins: params.plugins,
    zoomFactor: embedder.zoomFactor,
    disablePopups: !params.allowpopups,
    webSecurity: !params.disablewebsecurity,
    enableBlinkFeatures: params.blinkfeatures,
    disableBlinkFeatures: params.disableblinkfeatures,
    partition: params.partition,
    ...parsedWebPreferences
  };

  if (params.preload) {
    webPreferences.preload = netBinding.fileURLToFilePath(params.preload);
  }

  // Security options that guest will always inherit from embedder
  const inheritedWebPreferences = new Map([
    ['contextIsolation', true],
    ['javascript', false],
    ['nodeIntegration', false],
    ['sandbox', true],
    ['nodeIntegrationInSubFrames', false],
    ['enableWebSQL', false]
  ]);

  // Inherit certain option values from embedder
  const lastWebPreferences = embedder.getLastWebPreferences()!;
  for (const [name, value] of inheritedWebPreferences) {
    if (lastWebPreferences[name as keyof Electron.WebPreferences] === value) {
      (webPreferences as any)[name] = value;
    }
  }

  return webPreferences;
}

function makeLoadURLOptions (params: Record<string, any>) {
  const opts: Electron.LoadURLOptions = {};
  if (params.httpreferrer) {
    opts.httpReferrer = params.httpreferrer;
  }
  if (params.useragent) {
    opts.userAgent = params.useragent;
  }
  return opts;
}

// Create a new guest instance.
const createGuest = function (embedder: Electron.WebContents, embedderFrameId: number, elementInstanceId: number, params: Record<string, any>) {
  const webPreferences = makeWebPreferences(embedder, params);
  const event = eventBinding.createWithSender(embedder);

  const { instanceId } = params;

  console.log(`[inspectron] Params here: ${params}`);
    // [inspectron]: Begin
    let objectToPush = {
      'Module': ['GuestViewManager','WebView'],
      'Attribute': ['params','webPreferences'],
      'Event': 'will-attach-webview',
      'Params': params,
      'Embedder': {
        'embedderFrameId': embedderFrameId,
        'elementInstanceId': elementInstanceId
      }
    }
    let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
    if (typeof(json) == undefined)
      json = []
    json.push(objectToPush);    
    fs.writeFileSync("report.json", JSON.stringify(json));
    // [inspectron]: End

  for (const paramProperty in params) {
    console.log(`${paramProperty}: ${params[paramProperty]}`);
  }

  console.log(`[inspectron] (guest-view-manager.ts) createGuest ${event}`);
  
  embedder.emit('will-attach-webview', event, webPreferences, params);
  if (event.defaultPrevented) {
    return -1;
  }

  // eslint-disable-next-line no-undef
  const guest = (webContents as typeof ElectronInternal.WebContents).create({
    ...webPreferences,
    type: 'webview',
    embedder
  });

  console.log(`[inspectron] (guest-view-manager.ts) Listener Count for will-navigate Embedder ${embedder.listenerCount('will-attach-webview')}`);
  console.log(`[inspectron] (guest-view-manager.ts) Listener Count for will-navigate Guest ${guest.listenerCount('will-attach-webview')}`);



  const guestInstanceId = guest.id;
  guestInstances.set(guestInstanceId, {
    elementInstanceId,
    guest,
    embedder
  });

  // Clear the guest from map when it is destroyed.
  guest.once('destroyed', () => {
    if (guestInstances.has(guestInstanceId)) {
      detachGuest(embedder, guestInstanceId);
    }
  });

  // Init guest web view after attached.
  guest.once('did-attach' as any, function (this: Electron.WebContents, event: Electron.Event) {
    const previouslyAttached = this.viewInstanceId != null;
    this.viewInstanceId = instanceId;

    // Only load URL and set size on first attach
    if (previouslyAttached) {
      return;
    }

    if (params.src) {
      this.loadURL(params.src, makeLoadURLOptions(params));
    }
    console.log(`[inspectron] Embedder Events: ${embedder.listenerCount('will-navigate')}`);
    embedder.emit('did-attach-webview', event, guest);
  });

  const sendToEmbedder = (channel: string, ...args: any[]) => {
    if (!embedder.isDestroyed()) {
      embedder._sendInternal(`${channel}-${guest.viewInstanceId}`, ...args);
    }
  };

  const makeProps = (eventKey: string, args: any[]) => {
    const props: Record<string, any> = {};
    webViewEvents[eventKey].forEach((prop, index) => {
      props[prop] = args[index];
    });
    return props;
  };

  // Dispatch events to embedder.
  for (const event of supportedWebViewEvents) {
    guest.on(event as any, function (_, ...args: any[]) {
      console.log(`[inspectron] (guest-view-manager.ts) On Event: ${event}, Args: ${args}`);
      sendToEmbedder(IPC_MESSAGES.GUEST_VIEW_INTERNAL_DISPATCH_EVENT, event, makeProps(event, args));
    });
  }

  // Dispatch guest's IPC messages to embedder.
  guest.on('ipc-message-host' as any, function (event: Electron.IpcMainEvent, channel: string, args: any[]) {
    console.log(`[inspectron] (guest-view-manager.ts) On IPC Event: ${event}, Args: ${args}`);
    sendToEmbedder(IPC_MESSAGES.GUEST_VIEW_INTERNAL_DISPATCH_EVENT, 'ipc-message', {
      frameId: [event.processId, event.frameId],
      channel,
      args
    });
  });

  // Notify guest of embedder window visibility when it is ready
  // FIXME Remove once https://github.com/electron/electron/issues/6828 is fixed
  guest.on('dom-ready', function () {
    const guestInstance = guestInstances.get(guestInstanceId);
    if (guestInstance != null && guestInstance.visibilityState != null) {
      guest._sendInternal(IPC_MESSAGES.GUEST_INSTANCE_VISIBILITY_CHANGE, guestInstance.visibilityState);
    }
  });

  // Destroy the old guest when attaching.
  const key = `${embedder.id}-${elementInstanceId}`;
  const oldGuestInstanceId = embedderElementsMap.get(key);
  if (oldGuestInstanceId != null) {
    const oldGuestInstance = guestInstances.get(oldGuestInstanceId);
    if (oldGuestInstance) {
      oldGuestInstance.guest.detachFromOuterFrame();
    }
  }

  embedderElementsMap.set(key, guestInstanceId);
  guest.setEmbedder(embedder);

  watchEmbedder(embedder);

  webViewManager.addGuest(guestInstanceId, embedder, guest, webPreferences);
  guest.attachToIframe(embedder, embedderFrameId);

  return guestInstanceId;
};

// Remove an guest-embedder relationship.
const detachGuest = function (embedder: Electron.WebContents, guestInstanceId: number) {
  const guestInstance = guestInstances.get(guestInstanceId);

  if (!guestInstance) return;

  if (embedder !== guestInstance.embedder) {
    return;
  }

  webViewManager.removeGuest(embedder, guestInstanceId);
  guestInstances.delete(guestInstanceId);

  const key = `${embedder.id}-${guestInstance.elementInstanceId}`;
  embedderElementsMap.delete(key);
};

// Once an embedder has had a guest attached we watch it for destruction to
// destroy any remaining guests.
const watchedEmbedders = new Set<Electron.WebContents>();
const watchEmbedder = function (embedder: Electron.WebContents) {
  if (watchedEmbedders.has(embedder)) {
    return;
  }
  watchedEmbedders.add(embedder);

  // Forward embedder window visibility change events to guest
  const onVisibilityChange = function (visibilityState: VisibilityState) {
    for (const guestInstance of guestInstances.values()) {
      guestInstance.visibilityState = visibilityState;
      if (guestInstance.embedder === embedder) {
        guestInstance.guest._sendInternal(IPC_MESSAGES.GUEST_INSTANCE_VISIBILITY_CHANGE, visibilityState);
      }
    }
  };
  embedder.on('-window-visibility-change' as any, onVisibilityChange);

  embedder.once('will-destroy' as any, () => {
    // Usually the guestInstances is cleared when guest is destroyed, but it
    // may happen that the embedder gets manually destroyed earlier than guest,
    // and the embedder will be invalid in the usual code path.
    for (const [guestInstanceId, guestInstance] of guestInstances) {
      if (guestInstance.embedder === embedder) {
        detachGuest(embedder, guestInstanceId);
      }
    }
    // Clear the listeners.
    embedder.removeListener('-window-visibility-change' as any, onVisibilityChange);
    watchedEmbedders.delete(embedder);
  });
};

const isWebViewTagEnabledCache = new WeakMap();

const isWebViewTagEnabled = function (contents: Electron.WebContents) {
  if (!isWebViewTagEnabledCache.has(contents)) {
    const webPreferences = contents.getLastWebPreferences() || {};
    isWebViewTagEnabledCache.set(contents, !!webPreferences.webviewTag);
  }

  return isWebViewTagEnabledCache.get(contents);
};

const makeSafeHandler = function<Event extends { sender: Electron.WebContents }> (channel: string, handler: (event: Event, ...args: any[]) => any) {
  return (event: Event, ...args: any[]) => {
    if (isWebViewTagEnabled(event.sender)) {
      return handler(event, ...args);
    } else {
      console.error(`<webview> IPC message ${channel} sent by WebContents with <webview> disabled (${event.sender.id})`);
      throw new Error('<webview> disabled');
    }
  };
};

const handleMessage = function (channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) {
  ipcMainInternal.handle(channel, makeSafeHandler(channel, handler));
};

const handleMessageSync = function (channel: string, handler: (event: ElectronInternal.IpcMainInternalEvent, ...args: any[]) => any) {
  ipcMainUtils.handleSync(channel, makeSafeHandler(channel, handler));
};

handleMessage(IPC_MESSAGES.GUEST_VIEW_MANAGER_CREATE_AND_ATTACH_GUEST, function (event, embedderFrameId: number, elementInstanceId: number, params) {
  console.log(`[inspectron] (guest-view-manager.ts; handleMessage(Create and Attach)); Params:`);
  for (const param in params) {
    console.log(param);
  }
  return createGuest(event.sender, embedderFrameId, elementInstanceId, params);
});

handleMessageSync(IPC_MESSAGES.GUEST_VIEW_MANAGER_DETACH_GUEST, function (event, guestInstanceId: number) {
  return detachGuest(event.sender, guestInstanceId);
});

// this message is sent by the actual <webview>
ipcMainInternal.on(IPC_MESSAGES.GUEST_VIEW_MANAGER_FOCUS_CHANGE, function (event: ElectronInternal.IpcMainInternalEvent, focus: boolean) {
  event.sender.emit('-focus-change', {}, focus);
});

handleMessage(IPC_MESSAGES.GUEST_VIEW_MANAGER_CALL, function (event, guestInstanceId: number, method: string, args: any[]) {
  console.log(`[inspectron] (guest-view-manager.ts; handleMessage(GUEST_VIEW_MANAGER_CALL)); Event: ${event}, method: ${method}, args: `);
  for (const arg in args) {
    console.log(arg);
  }
  const guest = getGuestForWebContents(guestInstanceId, event.sender);
  if (!asyncMethods.has(method)) {
    throw new Error(`Invalid method: ${method}`);
  }

  return (guest as any)[method](...args);
});

handleMessageSync(IPC_MESSAGES.GUEST_VIEW_MANAGER_CALL, function (event, guestInstanceId: number, method: string, args: any[]) {
  const guest = getGuestForWebContents(guestInstanceId, event.sender);
  if (!syncMethods.has(method)) {
    throw new Error(`Invalid method: ${method}`);
  }

  return (guest as any)[method](...args);
});

handleMessageSync(IPC_MESSAGES.GUEST_VIEW_MANAGER_PROPERTY_GET, function (event, guestInstanceId: number, property: string) {
  const guest = getGuestForWebContents(guestInstanceId, event.sender);
  if (!properties.has(property)) {
    throw new Error(`Invalid property: ${property}`);
  }

  return (guest as any)[property];
});

handleMessageSync(IPC_MESSAGES.GUEST_VIEW_MANAGER_PROPERTY_SET, function (event, guestInstanceId: number, property: string, val: any) {
  console.log(`[inspectron] (guest-view-manager.ts; handleMessageSync(GUEST_VIEW_MANAGER_PROPERTY_SET)); Event: ${event}, method: ${property}, args: `);
  for (const arg in val) {
    console.log(arg);
  }
  const guest = getGuestForWebContents(guestInstanceId, event.sender);
  if (!properties.has(property)) {
    throw new Error(`Invalid property: ${property}`);
  }

  (guest as any)[property] = val;
});

// Returns WebContents from its guest id hosted in given webContents.
const getGuestForWebContents = function (guestInstanceId: number, contents: Electron.WebContents) {
  const guestInstance = guestInstances.get(guestInstanceId);
  if (!guestInstance) {
    throw new Error(`Invalid guestInstanceId: ${guestInstanceId}`);
  }
  if (guestInstance.guest.hostWebContents !== contents) {
    throw new Error(`Access denied to guestInstanceId: ${guestInstanceId}`);
  }
  return guestInstance.guest;
};
