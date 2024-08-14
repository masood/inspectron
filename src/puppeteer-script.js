var puppeteer = require('puppeteer');
const { exec } = require('child_process');
const fs = require('fs');
const CspEvaluator = require("csp_evaluator/dist/evaluator.js");
const CspParser = require("csp_evaluator/dist/parser.js");

function parseDomains(domainList) {
    domainList.forEach(subdomain => {
        const isWildcardSubdomain = subdomain.split(".")[0] === "*";
        console.log(`${subdomain}: ${isWildcardSubdomain}`);
      });
}

function googleCSPEvaluator(cspString) {
  let parsed = new CspParser.CspParser(cspString).csp;
  return new CspEvaluator.CspEvaluator(parsed).evaluate()
}

function findURLsInStrings(strings) {
  const urls = [];
  const urlRegex = /(?:(?:https?|ftp):\/\/|www\.|ftp\.)[^\s]+\.[^\s]+/g;

  strings.forEach(string => {
    const matches = string.match(urlRegex);
    if (matches) {
      matches.forEach(match => {
        if (!match.startsWith('http://') && !match.startsWith('https://')) {
          match = `http://${match}`; // Add "http://" protocol if missing
        }
        urls.push(match);
      });
    }
  });

  return urls;
}

function getValueByKeyCaseInsensitive(obj, key) {
  for (let prop in obj) {
    if (prop.toLowerCase() === key.toLowerCase()) {
      return obj[prop];
    }
  }
}

function getAllowedDomainsFromCSP(cspObject) {
  const allowedDomains = [];
  const urlSources = ['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'object-src', 'media-src', 'manifest-src', 'worker-src', 'child-src', 'form-action', 'frame-ancestors'];

  urlSources.forEach(source => {
    if (cspObject[source]) {
      const sources = cspObject[source];
      console.log(`sources = ${sources}`);
      allowedDomains.push(...findURLsInStrings(sources));
      // sources.forEach(source => {
      //   // if (source.startsWith('http://') || source.startsWith('https://')) {
      //   //   allowedDomains.push(new URL(source).hostname);
      //   // } 
      //   // else if (source == "self") {
      //   //   const url = cspObject['self'] || cspObject['default-src'];
      //   //   allowedDomains.push(new URL(url).hostname);
      //   // }
      // });
    }
  });

  return allowedDomains;
}

function parseCsp(csp) {
    const directives = csp.split(';').map(d => d.trim());
  
    const parsedCsp = {};
  
    for (let directive of directives) {
      const parts = directive.split(' ');
      const name = parts.shift();
      const values = parts.map(v => v.replace(/['"]/g, ''));
      parsedCsp[name] = values;
    }
  
    return parsedCsp;
  }

async function run(webSocketDebuggerUrl) {
  const browser = await puppeteer.connect({
    browserWSEndpoint: webSocketDebuggerUrl,
    dumpio: true
  });

  const pages = await browser.pages()
  let page;
  let googleCSPEvaluationList = [];
  for (let i = 0; i < pages.length && !page; i++) {

      console.log(pages[i].url());
      let page = pages[i];

      let allowedDomainList = []; // collects all requested domains

      let paused = false;
      let pausedRequests = [];

      const nextRequest = () => { // continue the next request or "unpause"
          if (pausedRequests.length === 0) {
              paused = false;
          } else {
              // continue first request in "queue"
              (pausedRequests.shift())(); // calls the request.continue function
          }
      };

      await page.setRequestInterception(true);
      page.on('request', request => {
          if (paused) {
              pausedRequests.push(() => request.continue());
          } else {
              paused = true; // pause, as we are processing a request now
              request.continue();
          }
      });

      let cspInResponseHeader = []

      page.on('requestfinished', async (request) => {
          const response = await request.response();

          const responseHeaders = response.headers();

          allowedDomainList.push(request.url());

          // Look for CSP in response header
          let cspInResponse = getValueByKeyCaseInsensitive(response.headers(), 'Content-Security-Policy');
          let xcspInResponse = getValueByKeyCaseInsensitive(response.headers(), 'X-Content-Security-Policy');

          if (cspInResponse) {
            cspInResponseHeader.push(cspInResponse)
          }
          if (xcspInResponse) {
            cspInResponseHeader.push(xcspInResponse)
          }

          nextRequest(); // continue with next request
      });
      page.on('requestfailed', (request) => {
          // handle failed request
          nextRequest();
      });
      await page.reload({ waitUntil: ["networkidle2", "domcontentloaded"] });

      // Meta Tag
      let cspMetaTagList = await page.evaluate(() => {
        let metaTags = document.head.querySelectorAll('meta[http-equiv$="Content-Security-Policy"]');
        let cspContents = [];
        metaTags.forEach(metaTag => {
            cspContents.push(metaTag.content);
        });
        return cspContents;
      });

      cspMetaTagList.forEach((cspValue) => {
        cspAsJson = parseCsp(cspValue);
        console.log(`CSP Value from Meta as JSON:`);
        console.log(cspAsJson);
        allowedDomainList.push(...getAllowedDomainsFromCSP(cspAsJson));
        googleCSPEvaluationList.push(...googleCSPEvaluator(cspValue));
      })

      cspInResponseHeader.forEach((cspValue) => {
        cspAsJson = parseCsp(cspValue);
        console.log(`CSP Value from Header as JSON:`);
        console.log(cspAsJson);
        allowedDomainList.push(...getAllowedDomainsFromCSP(cspAsJson));
        googleCSPEvaluationList.push(...googleCSPEvaluator(cspValue));
      })


      // Exposed APIs
      let exposedAPIsList = await page.evaluate(() => {
        return window.reportExposedAPIs;
      });
      // console.log("Preloaded APIs");console.log(`Allowed Domains = ${getAllowedDomainsFromCSP(cspAsJson)}`);
      // console.log(exposedAPIsList);

      let appVersion = await page.evaluate(() => {
        return navigator.appVersion;
      });

      let windowLocation = await page.evaluate(() => {
        return window.location.href;
      })

      // Write to file
      if (!(cspMetaTagList === null  || cspMetaTagList === undefined)) {
          fs.writeFile('cspMetaTag.json', JSON.stringify(cspMetaTagList), (err) => {
            if (err) {
              console.error(err);
              return;
            }
            console.log('cspMetaTag file has been created');
          });
      }

      if (!(cspInResponseHeader === null  || cspInResponseHeader === undefined)) {
        fs.writeFile('cspInResponseHeader.json', JSON.stringify(cspInResponseHeader), (err) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log('cspInResponseHeader file has been created');
        });
      }

      if (!(googleCSPEvaluationList === null  || googleCSPEvaluationList === undefined)) {
        fs.writeFile('googleCSPEvaluationList.json', JSON.stringify(googleCSPEvaluationList), (err) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log('googleCSPEvaluationList file has been created');
        });
    }

      if (!(exposedAPIsList === null  || exposedAPIsList === undefined)) {
        fs.writeFile('exposedAPIsList.json', JSON.stringify(exposedAPIsList), (err) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log('exposedAPIsList file has been created');
        });
      }

      if (!(allowedDomainList === null  || allowedDomainList.length == 0)) {
        fs.writeFile('allowedDomains.json', JSON.stringify(allowedDomainList), (err) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log('allowedDomains file has been created');
        });
      }

      if (!(appVersion === null  || appVersion === undefined)) {
        fs.writeFile('appVersion.txt', appVersion, (err) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log('appVersion file has been created');
        });
      }
      if (!(windowLocation === null  || windowLocation === undefined)) {
        fs.writeFile('windowLocation.txt', windowLocation, (err) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log('windowLocation file has been created');
        });
      }

      // console.log(`From Meta Tag: ${cspMetaTagList}`);
      // console.log(`From HTTP Response: ${cspInResponseHeader}`);
      await page.evaluate(() => {
        window.location.href = "https://google.com%60malicious.com/"
      });

    const result = [];

  }
  }


async function test() {

  // Replace the path with the actual path to your Electron app
  const appPath = process.argv[2];
  
  // Specify the remote debugging port number
  const remoteDebuggingPort = 8315;

  // Launch the Electron app with remote debugging port enabled
  const electronProcess = exec(`${appPath} --remote-debugging-port=${remoteDebuggingPort} --remote-allow-origins="http://localhost:8315"`);

  // Wait for the Electron app to start up
  electronProcess.on('exit', () => {
    console.log('Electron app has exited');
  });

  let isConnected = false;
  while (!isConnected) {
    try {
      var debugEndpointsResponse = await fetch(`http://localhost:${remoteDebuggingPort}/json/version`);
      isConnected = true;
    } catch (error) {
      console.log(`Waiting for remote debugging port to become available: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  debugEndpoints = await debugEndpointsResponse.json()
  console.log(debugEndpoints['webSocketDebuggerUrl']);
    // const response = await fetch(`http://localhost:8315/json/version`)
    // const debugEndpoints = await response.json()

    // console.log(debugEndpoints['webSocketDebuggerUrl']);
  await run(debugEndpoints['webSocketDebuggerUrl']);

  // Send a "quit" message to the running Electron instance
  exec(`kill $(ps aux | grep ${appPath} | grep -v grep | awk '{print $2}')`, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error closing Electron app: ${err}`);
      return;
    }

    console.log('Electron app closed successfully');
  });
  
}

test();

// run();