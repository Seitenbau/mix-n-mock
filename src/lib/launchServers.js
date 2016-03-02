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

const http = require('http');
const https = require('https');
const fs = require('fs');

const unIndent = require('./helpers/unIndent.js');

module.exports = (expressWare, roots, configuredPort, privateKeyPath, certificatePath, projectName) => {
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

    // SERVER
    // ======
    let ports = setupServerPort(configuredPort);
    let port = ports[0];
    let sslPort = ports[1];

    let httpServer, httpsServer;
    let errorHandler = function (err) {
        let type = 'HTTPS';
        if (this === httpServer) {
            httpServer = null;
            type = 'HTTP';
        } else {
            httpsServer = null;
        }
        console.error(`Could not launch ${type} server on port ${err.port}!`);
        if (err.code === 'EACCES') {
            console.warn(`Insufficient privileges. Try again as admin or use a high port.`);
        } else if (err.code === 'EADDRINUSE') {
            console.warn('The port is already taken by another server running.');
        }
    };

    // Start Node.js Server
    httpServer = http.createServer(expressWare);
    httpServer.on('error', errorHandler.bind(httpServer));
    httpServer.listen(port);
    if (sslPort > 0) {
        const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        const certificate = fs.readFileSync(certificatePath, 'utf8');

        httpsServer = https.createServer({key: privateKey, cert: certificate}, expressWare);
        httpsServer.on('error', errorHandler.bind(httpsServer));
        httpsServer.listen(sslPort);
    }

    // get local IP addresses
    let ip = require('./helpers/getIp')();

    process.nextTick(() => {
        let urls = httpServer ? [`http://localhost:${port}${roots.serverRoot}`] : [];
        if (httpsServer) {
            // HTTPS certificate is valid for hostname 'localhost' only, hence invalid for IP
            urls.unshift(`https://localhost:${sslPort}${roots.serverRoot}`);
        }
        if (httpServer) {
            urls.push(`http://${ip}:${port}${roots.serverRoot}`);
        }

        if (httpServer || httpsServer) {
            console.log(unIndent `Welcome to mix-n-mock in project “${projectName}”!

            Please go to ${urls.join(' or ')} to start using it.`);
        }
    });
};
