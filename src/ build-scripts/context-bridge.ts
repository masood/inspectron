const binding = process._linkedBinding('electron_renderer_context_bridge');

const checkContextIsolationEnabled = () => {
  if (!process.contextIsolated) throw new Error('contextBridge API can only be used when contextIsolation is enabled');
};

// var reportExposedInMainWorld = []

const contextBridge: Electron.ContextBridge = {
  exposeInMainWorld: (key: string, api: any) => {
  //   // [inspectron]: Add to File
  //   let objectToPush = {
  //     'Module': ['Context-Bridge'],
  //     'Attribute': ['Preload'],
  //     'Method': 'exposeInMainWorld',
  //     'Isolated': false,
  //     'Key': key,
  //     'API': api
  //   }
  //   let json = JSON.parse(fs.readFileSync('report.json', 'utf-8'));
  //   if (typeof(json) == undefined)
  //     json = []
  //   json.push(objectToPush);    
  //   fs.writeFileSync("report.json", JSON.stringify(json));
    // if (typeof window['reportExposedInMainWorld']: any === 'undefined') {
    //   window['reportExposedInMainWorld']: any = [];
    // }
    
    // window.name = [];
    console.log(`[inspectron] contextBridge exposeInMainWorld ==> Key: ${key}, Number of APIs exposed ===> ${Object.keys(api).length}`);
    // [inspectron]: Begin
    let reportExposedAPIs = [];
    for (const apiproperty in api) {
      reportExposedAPIs.push({apiproperty: `${api[apiproperty]}`});
      console.log(`[inspectron] contextBridge ${apiproperty}: ${api[apiproperty]}`);
    }
    binding.exposeAPIInWorld(0, 'reportExposedAPIs', reportExposedAPIs);
    // [inspectron]: End
    checkContextIsolationEnabled();
    return binding.exposeAPIInWorld(0, key, api);
  },
  exposeInIsolatedWorld: (worldId: number, key: string, api: any) => {


    console.log(`contextBridge exposeInIsolatedWorld ==> WorldId: ${worldId}, Key: ${key}, API ===> ${api}, JSON API ==> ${JSON.stringify(api)}`);
    // [inspectron]: Begin
    let reportExposedAPIs = [];
    for (const apiproperty in api) {
      reportExposedAPIs.push({apiproperty: `${api[apiproperty]}`});
      console.log(`[inspectron] contextBridge ${apiproperty}: ${api[apiproperty]}`);
    }
    binding.exposeAPIInWorld(worldId, 'reportExposedAPIs', reportExposedAPIs);
     // [inspectron]: End
    checkContextIsolationEnabled();
    return binding.exposeAPIInWorld(worldId, key, api);
  }
};

export default contextBridge;

export const internalContextBridge = {
  contextIsolationEnabled: process.contextIsolated,
  overrideGlobalValueFromIsolatedWorld: (keys: string[], value: any) => {
    return binding._overrideGlobalValueFromIsolatedWorld(keys, value, false);
  },
  overrideGlobalValueWithDynamicPropsFromIsolatedWorld: (keys: string[], value: any) => {
    return binding._overrideGlobalValueFromIsolatedWorld(keys, value, true);
  },
  overrideGlobalPropertyFromIsolatedWorld: (keys: string[], getter: Function, setter?: Function) => {
    return binding._overrideGlobalPropertyFromIsolatedWorld(keys, getter, setter || null);
  },
  isInMainWorld: () => binding._isCalledFromMainWorld() as boolean
};

if (binding._isDebug) {
  contextBridge.internalContextBridge = internalContextBridge;
}
