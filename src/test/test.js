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
let localMockBasePath = JSON.parse(fs.readFileSync(path.resolve(configDir, 'filesystem.path.json'), 'utf-8')).mock;
let localStaticBasePath = JSON.parse(fs.readFileSync(path.resolve(configDir, 'filesystem.path.json'), 'utf-8')).public;
mixNMockServiceBasePath = mixNMockServiceBasePath.replace(/\//g, '');
const remoteMockServer = JSON.parse(fs.readFileSync(path.resolve(configDir, 'server.proxy.json'), 'utf-8')).backend;
const remoteMockPort = remoteMockServer.match(/\d+/)[0];

let remoteServerMockDir = path.resolve(__dirname, 'remote-server-mock');
let localMockDir = path.resolve(projectDir, localMockBasePath);
let localStaticDir = path.resolve(projectDir, localStaticBasePath);

// start remote mock and mix-n-mock instance
let expressWare = express();
expressWare.use('/', express.static(remoteServerMockDir, {redirect: false}));
let remoteMock = http.createServer(expressWare);
console.info(`Launching static mock server on port ${remoteMockPort}`);
remoteMock.listen(remoteMockPort);
mixNMock.run(projectDir);

const getRemoteServerFile = fileName => fs.readFileSync(path.resolve(remoteServerMockDir, mixNMockServiceBasePath, fileName), 'utf-8');
const getLocalMockFile = (pathName, fileName) => fs.readFileSync(path.resolve(localMockDir, pathName, fileName), 'utf-8');
const getLocalStaticFile = fileName => fs.readFileSync(path.resolve(localStaticDir, fileName), 'utf-8');

const getUrl = part => `http://localhost:${mixNMockPort}${mixNMockRoot}/${part}`;
const getServiceRequestUrl = part => getUrl(`${mixNMockServiceBasePath}/${part}`);

// run tests
describe(`Proxying of remote calls with mix'n'mock`, function () {
    this.slow(1000);
    it('Should fetch the test file from the remote server', function (done) {
        let expected = getRemoteServerFile('testfile.txt');
        request(getServiceRequestUrl('testfile.txt'), (error, response, body) => {
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(200);
            expect(body).toEqual(expected);
            done();
        });
    });
    it('Should fetch the test file from the remote server and delay the response', function (done) {
        this.timeout(1000);
        const startTime = Date.now();
        let expected = getRemoteServerFile('delayed.txt');
        request(getServiceRequestUrl('delayed.txt'), (error, response, body) => {
            const endTime = Date.now();
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(200);
            expect(body).toEqual(expected);
            expect(endTime - startTime).toBeGreaterThan(750);
            done();
        });
    });
    it('Should fetch the test file (without leading slash) from the remote server and delay the response', done => {
        const startTime = Date.now();
        let expected = getRemoteServerFile('shouldWorkWithoutSlash.txt');
        request(getServiceRequestUrl('shouldWorkWithoutSlash.txt'), (error, response, body) => {
            const endTime = Date.now();
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(200);
            expect(body).toEqual(expected);
            expect(endTime - startTime).toBeGreaterThan(300);
            done();
        });
    });
});

describe(`Fetching local static files with mix'n'mock`, function () {
    it('Should fetch the local index.html', function (done) {
        let indexHtml = getLocalStaticFile('index.html');
        request(getUrl('index.html'), (error, response, body) => {
            expect(error).toNotExist();
            expect(response.statusCode).toEqual(200);
            expect(body).toEqual(indexHtml);
            done();
        })
    });
});

const methods = ['GET', 'PUT', 'POST', 'DELETE'];
methods.forEach(method => {
    describe(`Mocking ${method} responses`, function () {
        this.slow(800);
        it(`should return a JSON response when sending a ${method} request`, function (done) {
            let expected = JSON.parse(getLocalMockFile(method, `${method.toLowerCase()}-result.example.json`));
            request({uri: getServiceRequestUrl('directdata'), method: method}, function (error, response, body) {
                expect(error).toNotExist();
                expect(response.statusCode).toEqual(200);
                expect(JSON.parse(body)).toEqual(expected);
                done();
            });
        });
        it('should return 404 when requesting a non-existing file', function (done) {
            request({
                method: method,
                uri: getServiceRequestUrl('does.not.exist.json')
            }, function (error, response, body) {
                expect(error).toNotExist();
                expect(response.statusCode).toEqual(404);
                done();
            });
        });
        it(`should return a delayed JSON response when sending a ${method} request`, done => {
            this.timeout(800);
            const startTime = Date.now();
            let expected = JSON.parse(getLocalMockFile(method, `${method.toLowerCase()}-result.example.json`));
            request({uri: getServiceRequestUrl('delayeddata'), method: method}, function (error, response, body) {
                const endTime = Date.now();
                expect(error).toNotExist();
                expect(response.statusCode).toEqual(200);
                expect(JSON.parse(body)).toEqual(expected);
                expect(endTime - startTime).toBeGreaterThan(750);
                done();
            });
        });
    });
});


