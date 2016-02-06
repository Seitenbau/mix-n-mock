/**!
Copyright 2016 SEITENBAU GmbH

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

const express = require('express');
const http = require('http');
const https = require('https');
const request = require('request');
const konphyg = require('konphyg');
const redirect = require('express-redirect');
const fs = require('fs');
const path = require('path');
const fileExists = require('file-exists');

const unIndent = require('./helpers/unIndent.js');
const getProjectPaths = require('./helpers/getProjectPaths');

let errorCodes = {
    PROJECT_NOT_FOUND: 1
};
const unVersionedFileNameInfix = 'development';

let run = projectName => {

    // Setup
    const paths = getProjectPaths(projectName);
    const sourceFolder = paths.sourceFolder;
    const projectFolderRelative = paths.projectFolderRelative;
    const projectFolderAbs = paths.projectFolderAbs;
    const globalConfig = konphyg(sourceFolder);
    let projectConfig, server;
    try {
        projectConfig = konphyg(path.resolve(projectFolderAbs, 'config'));
    } catch (e) {
        console.error(`FATAL: Could not open project "${projectFolderRelative}".`);
        if (!projectName) {
            console.error(`Remember to pass the project folder name as an argument.`);
        }
        process.exit(errorCodes.PROJECT_NOT_FOUND);
    }

    // Server port configuration
    const configuredPort = projectConfig('server.port');

    // HTTPS certificates
    const privateKey = fs.readFileSync(path.resolve(sourceFolder, 'sslcert/localhost.pem'), 'utf8');
    const certificate = fs.readFileSync(path.resolve(sourceFolder, 'sslcert/localhost.crt'), 'utf8');

    // Mocking services
    const rootConfig = projectConfig('server.root');
    const serverRoot = rootConfig.root.replace(/\/+$/, '');
    const RESTRoot = (serverRoot + '/' + rootConfig.serviceBasePath).replace(/\/+$/, '').replace(/\/+/g, '/');

    // Path config
    const staticFilesDirRel = projectConfig('filesystem.path').public;
    const mockFilesDirRel = projectConfig('filesystem.path').mock;

    /**
     * @typedef {{
     *     active: {boolean} Whether the above mentioned configuration should be used or not. If you are not behind a proxy set it to false,
     *     url: {string} The URL of the proxy server,
     *     port: {(string|number)} The port of the proxy server
     * }}
     */
    const localProxyConfig = globalConfig('local.proxy');

    /**
     * @typedef {{
     *     backend: {string} The base URL of the real backend,
     *     delayedServices: {Object} Services specified here are called after the given amount of time has passed,
     *     rejectUnauthorized: {boolean} Whether invalid certificates should be rejected or not
     * }}
     */
    const serverProxyConfig = projectConfig('server.proxy');

    const staticFilesDirAbs = path.resolve(projectFolderAbs, staticFilesDirRel);

    /**
     * Given a file path, it tries to find the local and un-versioned version of it (marked by *.development.*) and returns
     * it. If no local version exists the regular file path is returned. E.G. config.json & config.development.json
     * @param {string} filePath
     * @param {string} fileName
     * @return {string}
     */
    let getFilePath = (filePath, fileName) => {
        let splitFileName = fileName.split('.');
        let name = splitFileName[0];
        let ending = splitFileName[1];
        let devFileName = name + `.${unVersionedFileNameInfix}.${ending}`;
        let devFilePath = path.resolve(filePath, devFileName);
        let regularFilePath = path.resolve(filePath, fileName);
        return fileExists(devFilePath) ? devFilePath : regularFilePath;
    };

    /**
     * Sends back the given file and delays the response
     * @param {string} filePath The full path to the file which is send as a response
     * @param {number} delayBy The number of milliseconds by which the response is delayed
     * @param {{}} request The request object
     * @param {{}} response The response object
     */
    let sendDelayedFile = (filePath, delayBy, request, response) => {
        setTimeout(response.sendfile.bind(response, filePath), delayBy);
    };

    /**
     * Sends back the given error and delays the response
     * @param {{error: string, status: number}} errorConfig The error configuration object
     * @param {number} delayBy The number of milliseconds by which the response is delayed
     * @param {string=} filePath
     * @param {{}} request The request object
     * @param {{}} response The response object
     */
    let sendDelayedError = (errorConfig, delayBy, filePath, request, response) => {
        let responseFunc;
        if (errorConfig.error) {
            responseFunc = response.send.bind(response, errorConfig.status, {faultCode: errorConfig.error});
        } else if (filePath) {
            responseFunc = () => {
                response.status(errorConfig.status).sendfile(filePath);
            };
        }
        setTimeout(responseFunc, delayBy);
    };

    /**
     * Sends back the given file
     * @param {string} filePath The full path to the file which is send as a response
     * @param {{}} request The request object
     * @param {{}} response The response object
     */
    let sendFile = (filePath, request, response) => {
        response.sendfile(filePath);
    };

    /**
     * Sends back the specified error
     * @param {{status: string, error: string=}} errorConfig The error config holding the HTTP status and the
     * error id or the error response object
     * @param {string=} filePath
     * @param {{}} request The request object
     * @param {{}} response The response object
     */
    let sendError = (errorConfig, filePath, request, response) => {
        if (errorConfig.error) {
            response.send(errorConfig.status, {faultCode: errorConfig.error});
        } else if (filePath) {
            response.status(errorConfig.status).sendfile(filePath);
        }
    };

    /**
     * Returns a function for mocking the request based on the given mock configuration
     * @param {{
     *     file: string,
     *     delayBy: number,
     *     error: {
     *         status: number,
     *         error: string
     *     },
     *     path: string,
     *     active: boolean
     * }} mock The configuration object
     * @param {string} filePath The full path to the file which is send as a response
     * @return {Function|undefined}
     */
    let getMockingFunction = (mock, filePath) => {
        let mockFunc;
        if (mock.file && !mock.error) {
            if (mock.delayBy) {
                mockFunc = sendDelayedFile.bind(this, filePath, mock.delayBy);
            } else {
                mockFunc = sendFile.bind(this, filePath);
            }
        } else if (mock.error) {
            if (mock.delayBy) {
                mockFunc = sendDelayedError.bind(this, mock.error, mock.delayBy, filePath);
            } else {
                mockFunc = sendError.bind(this, mock.error, filePath);
            }
        }
        return mockFunc;
    };

    /**
     * Setups a mock service for the given path and method
     * @param {string} methodName The name of the HTTP method PUT, GET, POST, …
     * @param {{
     *     file: string,
     *     delayBy: number,
     *     error: {
     *         status: number,
     *         error: string
     *     },
     *     path: string,
     *     active: boolean
     * }} mock The configuration object
     * @param {string} mock.path The REST path which has to be mocked
     * @param {string} mock.file The JSON file which should be returned by the service mock
     */
    let setupRESTMock = (methodName, mock) => {
        let directory = path.resolve(projectFolderAbs, mockFilesDirRel, methodName.toUpperCase());
        let filePath = mock.file ? getFilePath(directory, mock.file) : '';
        let mockFunc = getMockingFunction(mock, filePath);
        if (mock.path.indexOf('/') === 0) {
            throw `${mock.path} should not start with a slash. The mocked service will not work!`;
        }
        if (mockFunc) {
            server[methodName.toLowerCase()](RESTRoot + '/' + mock.path, mockFunc);
        }
    };

    /**
     * Setups up the mock services for the given mock configuration using the given mocking function
     * @param {{}} mocks
     * @param {boolean} mocks.active Whether the mock should in general be enabled or not
     * @param {Array.<{active: boolean, path: string, file:string}>} mocks.services The description of the services which
     * @param {Function} mockFunc The function which is called on each entry and which is doing the actual mocking work
     * should be mocked
     */
    let setupRESTMocks = (mocks, mockFunc) => {
        if (mocks.active) {
            mocks.services.filter(s => s.active).forEach(mockFunc);
        }
    };

    /**
     * Takes the given request ands proxies it through to real backend
     * @param {{}} requestConfig The configuration for the request object
     * @param {string=} requestConfig.proxy The URL + port of the proxy server (if one should be used)
     * @param {Object} req The request object
     * @param {Object} res The response object
     */
    let pipeRequest = (requestConfig, req, res) => {
        let remote = request(Object.assign({}, requestConfig, {
            url: serverProxyConfig.backend + req.url.replace(serverRoot, '')
        }));
        req.pipe(remote);
        remote.pipe(res);
    };

    /**
     * Proxies REST calls through to the real backend. If the REST  services appears in the delayedServices in the proxy.json
     * it is delayed
     * @param {{}} requestConfig The configuration for the request object
     * @param {string=} requestConfig.proxy The URL + port of the proxy server (if one should be used)
     * @param req
     * @param res
     * @param next
     */
    let proxyREST = (requestConfig, req, res, next) => {
        if (req.url.indexOf(RESTRoot) === 0) {
            if (serverProxyConfig.delayedServices) {
                let key = decodeURIComponent(req.url.replace(RESTRoot, ''));
                let delay = serverProxyConfig.delayedServices[key];
                if (delay) {
                    console.log(`delaying ${key} for ${delay} ms`);
                    setTimeout(pipeRequest.bind(this, requestConfig, req, res), delay);
                } else {
                    pipeRequest(requestConfig, req, res);
                }
            } else {
                pipeRequest(requestConfig, req, res);
            }
        } else {
            next();
        }
    };


    /**
     * Return the file system path for the requested file
     * @param {string} srcPath The path on the file system where the files are located
     * @param {string} relPath The relative path of the request
     * @param {Object} req The request object itself
     * @return {?string}
     */
    let getFilePathForRequest = (srcPath, relPath, req) => {
        let file;
        let requestedFile = path.resolve(srcPath, relPath);
        if (path.normalize(requestedFile) === path.normalize(staticFilesDirAbs) && req.path.replace(/\/$/, '') !== serverRoot) {
            // The requested file can be found in our static file directory and can therefore can be handled by
            // express.static AND is not our root path, which can of course not be found in the static dir
            file = null;
        } else if (rootConfig.defaultFile && req.path.replace(/\/?$/, '') === serverRoot) {
            // The requested file is our server root, therefore we need to send index.html
            file = path.resolve(staticFilesDirAbs, rootConfig.defaultFile);
        } else if (fs.existsSync(requestedFile)) {
            // The file is neither a file found in our dev path nor a request for the index, then it must be a file which
            // can only be found in the src directory (during development);
            file = requestedFile;
        }
        return file;
    };

    let proxyFilesystem = (req, res, next) => {
        let requestedUrl = req.path;
        let relPath = path.relative(serverRoot, requestedUrl);
        let file = getFilePathForRequest(staticFilesDirRel, relPath, req);
        if (file) {
            res.charset = 'utf-8'; // TODO: use https://www.npmjs.com/package/detect-encoding ? GH-15
            res.sendfile(file);
            return;
        }
        next();
    };

    /**
     * Setups the proxying so the REST request can be answered by our real backend on a remote server
     */
    let setupProxying = () => {
        let requestConfig = {
            rejectUnauthorized: serverProxyConfig.rejectUnauthorized !== false
        };
        if (localProxyConfig.active) {
            requestConfig.proxy = `${localProxyConfig.url}:${localProxyConfig.port}`;
        }
        server.use(proxyREST.bind(this, requestConfig));
        server.use(proxyFilesystem);
    };

    /**
     * Setups the port of the server
     * @param {{port: number, sslPort: number}=} portConfig The port configuration file
     * @return {Array<number>} The server ports
     */
    let setupServerPort = portConfig => {
        let serverPort = 80;
        let sslPort = 443;
        if (portConfig) {
            if (typeof portConfig.port !== 'undefined') {
                serverPort = portConfig.port;
            }
            if (typeof portConfig.sslPort !== 'undefined') {
                sslPort = portConfig.sslPort;
            }
        }
        return [serverPort, sslPort];
    };

    // SERVER CONFIGURATION
    // ====================
    (() => {
        server = express();
        server.use(express.compress());

        redirect(server);
        server.redirect('/', serverRoot); // TODO: make configurable? GH-8
        server.redirect(serverRoot, `${serverRoot}/`); // TODO: make configurable? GH-8

        ['get', 'put', 'post', 'delete'].forEach(method => {
            let mockCfg = projectConfig(`services/${method.toUpperCase()}.mock`);
            setupRESTMocks(mockCfg, setupRESTMock.bind(this, method));
        });

        setupProxying();

        server.use(serverRoot, express.static(staticFilesDirAbs, {redirect: false}));
        server.use('/', express.static(path.resolve(sourceFolder, '..'), {redirect: false})); // TODO: This grants access to the mix-n-mock project folder. Do we want this? GH-16

        server.use(express.errorHandler({
            dumpExceptions: true,
            showStack: true
        }));

        server.use(serverRoot, express.json());
        server.use(serverRoot, express.urlencoded());
        server.use(serverRoot, server.router);
    })();

    // SERVER
    // ======
    let ports = setupServerPort(configuredPort);
    let port = ports[0];
    let sslPort = ports[1];

    let httpServer, httpsServer;
    let errorHandler = function (err) {
        let type;
        if (this === httpServer) {
            httpServer = null;
            type = 'HTTP';
        } else {
            httpsServer = null;
            type = 'HTTPS';
        }
        console.error(`Could not launch ${type} server on port ${err.port}!`);
        if (err.code === 'EACCES') {
            console.warn(`Insufficient privileges. Try again as admin or use a high port.`);
        } else if (err.code === 'EADDRINUSE') {
            console.warn('The port is already taken by another server running.');
        }
    };

    // Start Node.js Server
    httpServer = http.createServer(server);
    httpServer.on('error', errorHandler.bind(httpServer));
    httpServer.listen(port);
    if (sslPort > 0) {
        httpsServer = https.createServer({key: privateKey, cert: certificate}, server);
        httpsServer.on('error', errorHandler.bind(httpsServer));
        httpsServer.listen(sslPort);
    }

    // get local IP addresses
    let getIp = () => {
        let interfaces = require('os').networkInterfaces();
        for (let device in interfaces) {
            if (interfaces.hasOwnProperty(device)) {
                let details = interfaces[device];
                for (let i = 0; i < details.length; i++) {
                    let detail = details[i];
                    if (detail.family === 'IPv4' && !detail.internal) {
                        return detail.address;
                    }
                }
            }
        }
        return null;
    };
    let ip = getIp();

    process.nextTick(() => {
        let urls = httpServer ? [`http://localhost:${port}${serverRoot}`] : [];
        if (httpsServer) {
            // HTTPS certificate is valid for hostname 'localhost' only, hence invalid for IP
            urls.unshift(`https://localhost:${sslPort}${serverRoot}`);
        }
        if (httpServer) {
            urls.push(`http://${ip}:${port}${serverRoot}`);
        }

        if (httpServer || httpsServer) {
            console.log(unIndent `Welcome to mix-n-mock!

            Please go to ${urls.join(' or ')} to start using it.`);
        }
    });
};

module.exports = {
    run: run,
    errorCodes: errorCodes
};
