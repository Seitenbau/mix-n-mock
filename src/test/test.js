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
const express = require('express');
const request = require('request');
const fs = require('fs');
const path = require('path');
const projectDir = path.resolve(__dirname, 'testproject');
const configDir = path.resolve(projectDir, 'config');
const mixNMock = require('../lib/mix-n-mock');


const mixNMockPort = JSON.parse(fs.readFileSync(path.resolve(configDir, 'server.port.json'), 'utf-8')).port;
const mixNMockRoot = JSON.parse(fs.readFileSync(path.resolve(configDir, 'server.root.json'), 'utf-8')).root;
let mixNMockServiceBasePath = JSON.parse(fs.readFileSync(path.resolve(configDir, 'server.root.json'), 'utf-8')).serviceBasePath;
mixNMockServiceBasePath = mixNMockServiceBasePath.replace(/\//g, '');
const remoteMockServer = JSON.parse(fs.readFileSync(path.resolve(configDir, 'server.proxy.json'), 'utf-8')).backend;
const remoteMockPort = remoteMockServer.match(/\d+/)[0];

let mockDir = path.resolve(__dirname, 'mock');

// start remote mock and mix-n-mock instance
let expressWare = express();
expressWare.use('/', express.static(mockDir, {redirect: false}));
let remoteMock = http.createServer(expressWare);
console.info(`Launching static mock server on port ${remoteMockPort}`);
remoteMock.listen(remoteMockPort);
mixNMock.run(projectDir);

// run tests
// TODO: use proper test runner
let expected = fs.readFileSync(path.resolve(mockDir, mixNMockServiceBasePath, 'testfile.txt'), 'utf-8');
request(`http://localhost:${mixNMockPort}${mixNMockRoot}/${mixNMockServiceBasePath}/testfile.txt`, (error, response, body) => {
    // console.log(error);
    // console.log(response);
    console.log(body);
    if (body !== expected) {
        console.error('FAIL');
    } else {
        console.log('PASS');
    }
});
