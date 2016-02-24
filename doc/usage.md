# Usage    <img alt="mix-n-mock logo" src="https://cdn.rawgit.com/Seitenbau/mix-n-mock/master/doc/mix-n-mock-logo.svg" align="right" height="50">

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

<!-- GH-2 -->
TODO: write the rest of this

## Configuration
### defaultFile
optional
### delay
### local proxy server
`local.proxy.json`
