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

var express = require('express');
var http = require('http');
var https = require('https');
var request = require('request');
var konphyg = require('konphyg');
var redirect = require('express-redirect');
var fs = require('fs');
var path = require('path');
var fileExists = require('file-exists');

var unIndent = require('./helpers/unIndent.js');


module.exports = (projectName) => {

    // Setup
    var sourceFolder = path.join(__dirname, '..');
    var projectFolderRelative = projectName || 'project';
    var projectFolderAbs = path.join(sourceFolder, projectFolderRelative);
    var globalConfig = konphyg(sourceFolder);
    var projectConfig, server;
    try {
        projectConfig = konphyg(path.join(projectFolderAbs, 'config'));
    } catch (e) {
        console.error(`FATAL: Could not open project "${projectFolderRelative}".`);
        if (!projectName) {
            console.error(`Remember to pass the project folder name as an argument.`);
        }
        process.exit(1);
    }

    // Server port configuration
    var configuredPort = projectConfig('server.port');

    // HTTPS certificates
    var privateKey = fs.readFileSync(path.join(sourceFolder, 'sslcert/localhost.pem'), 'utf8');
    var certificate = fs.readFileSync(path.join(sourceFolder, 'sslcert/localhost.crt'), 'utf8');

    // Mocking services
    var rootConfig = projectConfig('server.root');
    var serverRoot = rootConfig.root.replace(/\/+$/, '');
    var RESTRoot = (serverRoot + '/' + rootConfig.serviceBasePath).replace(/\/+$/, '').replace(/\/+/g, '/');

    // Path config
    var staticFilesDirRel = projectConfig('filesystem.path').public;
    var mockFilesDirRel = projectConfig('filesystem.path').mock;

    /**
     * @typedef {{
        *   active: {boolean} Whether the above mentioned configuration should be used or not. If you are not behind a proxy set it to false,
        *   url: {string} The URL of the proxy server,
        *   port: {(string|number)} The port of the proxy server
        * }}
     */
    var localProxyConfig = globalConfig('local.proxy');

    /**
     * @typedef {{
     *      backend: {string} The base URL of the real backend,
     *      delayedServices: {Object} Services specified here are called after the given amount of time has passed,
     *      rejectUnauthorized: {boolean} Whether invalid certificates should be rejected or not
     * }}
     */
    var serverProxyConfig = projectConfig('server.proxy');

    var unVersionedFileNameInfix = 'development';
    var staticFilesDirAbs = path.join(projectFolderAbs, staticFilesDirRel);

    /**
     * Given a file path, it tries to find the local and un-versioned version of it (marked by *.development.*) and returns
     * it. If no local version exists the regular file path is returned. E.G. config.json & config.development.json
     * @param {string} filePath
     * @param {string} fileName
     * @return {string}
     */
    var getFilePath = (filePath, fileName) => {
        var splitFileName = fileName.split('.');
        var name = splitFileName[0];
        var ending = splitFileName[1];
        var devFileName = name + `.${unVersionedFileNameInfix}.${ending}`;
        var devFilePath = path.join(filePath, devFileName);
        var regularFilePath = path.join(filePath, fileName);
        return fileExists(devFilePath) ? devFilePath : regularFilePath;
    };

    /**
     * Sends back the given file and delays the response
     * @param {string} filePath The full path to the file which is send as a response
     * @param {number} delayBy The number of milliseconds by which the response is delayed
     * @param {{}} request The request object
     * @param {{}} response The response object
     */
    var sendDelayedFile = (filePath, delayBy, request, response) => {
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
    var sendDelayedError = (errorConfig, delayBy, filePath, request, response) => {
        var responseFunc;
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
    var sendFile = (filePath, request, response) => {
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
    var sendError = (errorConfig, filePath, request, response) => {
        if (errorConfig.error) {
            response.send(errorConfig.status, {faultCode: errorConfig.error});
        } else if (filePath) {
            response.status(errorConfig.status).sendfile(filePath);
        }
    };

    /**
     * Returns a function for mocking the request based on the given mock configuration
     * @param {{
     *      file: string,
     *      delayBy: number,
     *      error: {
     *          status: number,
     *          error: string
     *      },
     *      path: string,
     *      active: boolean
     * }} mock The configuration object
     * @param {string} filePath The full path to the file which is send as a response
     * @return {Function|undefined}
     */
    var getMockingFunction = (mock, filePath) => {
        var mockFunc;
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
     *      file: string,
     *      delayBy: number,
     *      error: {
     *          status: number,
     *          error: string
     *      },
     *      path: string,
     *      active: boolean
     * }} mock The configuration object
     * @param {string} mock.path The REST path which has to be mocked
     * @param {string} mock.file The JSON file which should be returned by the service mock
     */
    var setupRESTMock = (methodName, mock) => {
        var directory = path.join(projectFolderAbs, mockFilesDirRel, methodName.toUpperCase());
        var filePath = mock.file ? getFilePath(directory, mock.file) : '';
        var mockFunc = getMockingFunction(mock, filePath);
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
    var setupRESTMocks = (mocks, mockFunc) => {
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
    var pipeRequest = (requestConfig, req, res) => {
        var remote = request(Object.assign({}, requestConfig, {
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
    var proxyREST = (requestConfig, req, res, next) => {
        if (req.url.indexOf(RESTRoot) === 0) {
            if (serverProxyConfig.delayedServices) {
                var key = decodeURIComponent(req.url.replace(RESTRoot, ''));
                var delay = serverProxyConfig.delayedServices[key];
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
    var getFilePathForRequest = (srcPath, relPath, req) => {
        var file;
        var requestedFile = path.resolve(srcPath, relPath);
        if (path.normalize(requestedFile) === path.normalize(staticFilesDirAbs) && req.path.replace(/\/$/, '') !== serverRoot) {
            // The requested file can be found in our static file directory and can therefore can be handled by
            // express.static AND is not our root path, which can of course not be found in the static dir
            file = null;
        } else if (rootConfig.defaultFile && req.path.replace(/\/?$/, '') === serverRoot) {
            // The requested file is our server root, therefore we need to send index.html
            file = path.join(path.normalize(staticFilesDirAbs), rootConfig.defaultFile);
        } else if (fs.existsSync(requestedFile)) {
            // The file is neither a file found in our dev path nor a request for the index, then it must be a file which
            // can only be found in the src directory (during development);
            file = requestedFile;
        }
        return file;
    };

    var proxyFilesystem = (req, res, next) => {
        var requestedUrl = req.path;
        var relPath = path.relative(serverRoot, requestedUrl);
        var file = getFilePathForRequest(staticFilesDirRel, relPath, req);
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
    var setupProxying = () => {
        var requestConfig = {
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
    var setupServerPort = portConfig => {
        var serverPort = 80;
        var sslPort = 443;
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
        server.use('/', express.static(path.join(sourceFolder, '..'), {redirect: false})); // TODO: This grants access to the mix-n-mock project folder. Do we want this? GH-16

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
    var ports = setupServerPort(configuredPort);
    var port = ports[0];
    var sslPort = ports[1];

    // Start Node.js Server
    var httpServer = http.createServer(server);
    httpServer.listen(port);
    if (sslPort > 0) {
        var httpsServer = https.createServer({key: privateKey, cert: certificate}, server);
        httpsServer.on('error', () => {
            console.warn(`Could not launch HTTPS server on port ${sslPort}! Try again as admin or use a different port.`);
            sslPort = -1;
        });
        httpsServer.listen(sslPort);
    }

    // get local IP addresses
    var getIp = () => {
        var interfaces = require('os').networkInterfaces();
        for (var device in interfaces) {
            if (interfaces.hasOwnProperty(device)) {
                var details = interfaces[device];
                for (var i = 0; i < details.length; i++) {
                    var detail = details[i];
                    if (detail.family === 'IPv4' && !detail.internal) {
                        return detail.address;
                    }
                }
            }
        }
        return null;
    };
    var ip = getIp();

    process.nextTick(() => {
        var urls = [`http://localhost:${port}${serverRoot}`];
        if (sslPort > 0) {
            urls.unshift(`https://localhost:${sslPort}${serverRoot}`);
        }
        if (ip) {
            urls.push(`http://${ip}:${port}${serverRoot}`);
        }

        console.log(unIndent `Welcome to mix-n-mock!

        Please go to ${urls.join(' or ')} to start using it.`);
    });
};
