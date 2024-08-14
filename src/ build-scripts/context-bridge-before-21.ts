const binding = process._linkedBinding('electron_renderer_context_bridge');

const checkContextIsolationEnabled = () => {
  if (!process.contextIsolated) throw new Error('contextBridge API can only be used when contextIsolation is enabled');
};

const contextBridge: Electron.ContextBridge = {
  exposeInMainWorld: (key: string, api: any) => {
    // [inspectron]: Begin
    let reportExposedAPIs = [];
    for (const apiproperty in api) {
      reportExposedAPIs.push({apiproperty: `${api[apiproperty]}`});
      console.log(`[inspectron] contextBridge ${apiproperty}: ${api[apiproperty]}`);
    }
    binding.exposeAPIInMainWorld('reportExposedAPIs', reportExposedAPIs);
    // [inspectron]: End
    checkContextIsolationEnabled();
    return binding.exposeAPIInMainWorld(key, api);
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
