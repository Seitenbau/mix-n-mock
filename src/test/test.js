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
const expect = require('expect');

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

const getFileFromFileSystem = fileName => {
    return fs.readFileSync(path.resolve(mockDir, mixNMockServiceBasePath, fileName), 'utf-8');
};

const getRequestUrl = fileName => {
    return `http://localhost:${mixNMockPort}${mixNMockRoot}/${mixNMockServiceBasePath}/${fileName}`;
};

// run tests
describe('Proxying of remote calls with mix\'n\'mock', function () {
    it('Should fetch the test file from the remote server', function (done) {
        let expected = getFileFromFileSystem('testfile.txt');
        request(getRequestUrl('testfile.txt'), (error, response, body) => {
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(200);
            expect(body).toEqual(expected);
            done();
        });
    });
    it('Should fetch the test file from the remote server and delay the response', function (done) {
        this.slow(1000);
        this.timeout(1000);
        const startTime = Date.now();
        let expected = getFileFromFileSystem('delayed.txt');
        request(getRequestUrl('delayed.txt'), (error, response, body) => {
            const endTime = Date.now();
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(200);
            expect(body).toEqual(expected);
            expect(endTime - startTime).toBeGreaterThan(750);
            done();
        });
    });
    /*
    it('Should fetch the test file (without leading slash) from the remote server and delay the response', function (done) {
        //TODO: The shouldWorkWithoutSlash.txt is specified inside the delayedServices without a leading slash and thus does not work (but it should!)
        const startTime = Date.now();
        let expected = getFileFromFileSystem('shouldWorkWithoutSlash.txt');
        request(getRequestUrl('shouldWorkWithoutSlash.txt'), function (error, response, body) {
            const endTime = Date.now();
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(200);
            expect(body).toEqual(expected);
            expect(endTime - startTime).toBeGreaterThan(300);
            done();
        });
        done();
    });
    */
});
describe('Mocking GET request', function () {
    it('should return a JSON response when sending a GET request', function (done) {
        let expected = JSON.parse(getFileFromFileSystem('get.data.json'));
        request(getRequestUrl('get.data.json'), function (error, response, body) {
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(200);
            expect(JSON.parse(body)).toEqual(expected);
            done();
        });
    });
    it('should return 404 when requesting a non-existing file', function (done) {
        request(getRequestUrl('does.not.exist.json'), function (error, response, body) {
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(404);
            done();
        });
    });
});

