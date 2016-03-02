# Usage    <img alt="mix-n-mock logo" src="https://cdn.rawgit.com/Seitenbau/mix-n-mock/master/doc/mix-n-mock-logo.svg" align="right" height="50">

- [Running mix-n-mock](#running-mix-n-mock)
    - [Advanced pathnames](#advanced-pathnames)
    - [Multi-project mode](#multi-project-mode)
    - [Automatic restart](#automatic-restart)
- [HTTPS certificates](#https-certificates)
- [Configuration](#configuration)
    - [`.development.json` files](#developmentjson-files)
    - [server.port.json](#serverportjson)
    - [filesystem.path.json](#filesystempathjson)
    - [server.proxy.json](#serverproxyjson)
    - [/local.proxy.json](#localproxyjson)

## Running mix-n-mock

To launch mix-n-mock on a project named `foo`, just run

    $ node index.js foo

You can also use

    $ npm start foo

If no project name is passed, it defaults to `project`

    $ node index.js # same as node index.js project

### Advanced pathnames

The project folder must be located under `src`. If your project folder is elsewhere, use an absolute path or a pathname starting with `.` like this:

    $ node index.js ./foo
    $ node index.js ./foo/bar
    $ node index.js /home/johndoe/foo
    > node.exe index.js C:\projects\foo

### Multi-project mode

You can launch multiple projects at once

    $ node index.js foo bar ./baz

### Automatic restart

To have mix-n-mock restart automatically when any of the config files changes, pass the `--restart` parameter, or `-r` for short

    $ node index.js -r foo
    $ node index.js --restart foo bar
    $ npm start -- --restart foo bar

Note that the extra `--` is mandatory for `npm start`.

## HTTPS certificates

If you run an https server with an invalid certificate, your browser will complain about that. You have two options:

* Either, ignore that warning. Anyway, depending on your website, you may run into trouble with the browser’s security mechanism that aims to protect you from malicious content.
* Or, install the corresponding *root certificate*. This certificate is required to tell your browser that the website's certificate is ok. It must be installed manually.

mix-n-mock comes with a certificate pair, one for the server, and one corresponding root certificate. Note that these certificates are only valid for the precise name `localhost`, so `127.0.0.1` or similar won't work.

The certificates are located in `/src/sslcert`. See [sslcert/README.html](../src/sslcert/README.html) on how to install the root certificate. When you start mix-n-mock using the `sslPort` option, it will automatically use the server certificate.


## Configuration
There are several configuration files that control different aspects of mix-n-mock’s functionality.
They must be placed in your projects `config/` folder.
Here is the directory layout (click to open the corresponding example configuration):

**[`config/`](../src/example/config)**  
[`server.port.`](../src/example/config/server.port.json)     \# basic configuration  
[`server.root.json`](../src/example/config/server.root.json)      \# routing  
[`filesystem.path.json`](../src/example/config/filesystem.path.json)  \# static file locations  
[`server.proxy.json`](../src/example/config/server.proxy.json)     \# real service proxying   
**[`config/services/`](../src/example/config/services)**            \# mocked service configuration, one file per HTTP method  
[`POST.mock.json`](../src/example/config/services/POST.mock.json)  
[`GET.mock.json`](../src/example/config/services/GET.mock.json)  
[`PUT.mock.json`](../src/example/config/services/PUT.mock.json)  
[`DELETE.mock.json`](../src/example/config/services/DELETE.mock.json)  

The reason why there are multiple config files, and not one big file, is outlined below.

In addition, there is `local.proxy.json` in mix-n-mock’s `src` folder, which is only required when you need a proxy server to access the target server.

### `.development.json` files

Each file may be backed by an additional `.development.json` file, which will be merged with the original file. It is best explained looking at an example:

**server.port.json**
```javascript
{
    "port": 8080,
    "sslPort": 4443
}
```

**server.port.development.json**
```javascript
{
    "port": 80
}
```

**effective configuration**
```javascript
{
    "port": 80,
    "sslPort": 4443
}
```

As you can see, the values in `server.port.development.json`, if present, overwrite the ones in `server.port.json`, but leave the rest intact. In other words, `x.json` can generally be seen as a list of defaults while `x.development.json` contains specific values.

So you can easily restore the defaults individually by removing or renaming your `.development.json` files.

It is recommended to exclude all `.development.json` files from version control, such that each developer can maintain his own variant on his machine.


### server.port.json

This defines the HTTP and HTTPs ports that mix-n-mock will run on.

```javascript
{
    "port": 80,    // run HTTP server on port 80 (http://localhost)
    "sslPort": 443 // run HTTPS server on port 443 (https://localhost)
}
```

You can set `sslPort` to `0` to disable HTTPs and run an HTTP server only.

```javascript
{
    "port": 8080, // run HTTP server on port 8080 (http://localhost:8080)
    "sslPort": 0  // disable HTTPs server
}
```

### server.root.json

Basic routing configuration for mix-n-mock.

```javascript
{
    "root": "/example",         //  server root path. Requests to '/' will be redirected here
    "serviceBasePath": "rest/", //  base service path. Requests to this path will run through mix-n-mock’s mocking engine,
                                //  everything else will be looked up in the static files folder
                                //  /example/rest/foo -> mix and mock
                                //  /example/css/bar.css -> filesystem
    "defaultFile": "index.html" //  content served in repsonse to requests for '/example'. Optional.
}
```

### filesystem.path.json

```javascript
{
    "public": "example-public",
    "mock": "example-mocks"
}
```

This file has two entries, `public` and `mock`, which are pathnames relative to your project folder.

The `public` folder must contain your static files. A GET request for `/localhost/${root}/foo/bar.baz` will be mapped to `${projectfolder}/${public}/foo/bar.baz`.

The `mock` folder may contain your static service mocks. Which of these files is served, depends on your service config (see below). For example, assume the following `GET.mock.json` file:

```javascript
{
    "active": true,
    "services": [
        {
            "active": true,
            "path": "foo/bar",
            "file": "something.json"
        }
    ]
}
```
In this case, a GET request for `/localhost/${serviceBasePath}/foo/bar` will be mapped to `${projectfolder}/${mock}/GET/something.json`

### server.proxy.json

This is where you configure your staging server that provides actual services, which will be mixed in with your static mocks. You can also configure service delays to simulate longer response times. 

```javascript
{
    "backend": "https://example.com", // The server's absolute URL
    "rejectUnauthorized": false,      // `false` to allow invalid HTTPS certificates
    "delayedServices": {              // Simulate latency times:
        "/EXAMPLE": 42                // mix-n-mock delays the server's /EXAMPLE service by 42 milliseconds
    }
}
```

### /local.proxy.json

An optional proxy server configuration for when you can’t access the backend directly. Set `active: false` to disable.

```javascript
{
    "active": true,
    "url": "http://210.84.128.13",
    "port": "80"
}
```

<!-- GH-2 -->
TODO: write the rest of this
# mock configs
### delay
