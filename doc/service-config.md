# Service config    <img alt="mix-n-mock logo" src="https://cdn.rawgit.com/Seitenbau/mix-n-mock/master/doc/mix-n-mock-logo.svg" align="right" height="50">

Each HTTP method configuration file looks like this:

```javascript
{
    "active": true,
    "services": [
        {
            "active": true,
            "path": "exampleEndpoint",
            "file": "delete-result.example.json",
            "delayBy": 5000
        },
        ...
    ]
}
```

### active

The main active switch can be used switch the whole mock configuration for the particular HTTP method on or off.
 
### services

The services array holds the individual configuration for each server route which should be mocked.

#### active

The active switch is used to toggle the mocking of the individual route.

#### path

The path stores the route which should be mocked. It is a path relative to the `serviceBasePath` of the `server.root.json`.

#### file (optional)

The JSON file which has to be returned if the route is called. The file name will be resolved relative to `mock` path specified in the `filesystem.path.json` followed by the HTTP method name. E.g. `file` is set to "delete-result.example.json",  `mock` is set to "example-mocks" and the configuration file is `DELETE.mock.json` then the application will return `example-mocks/DELETE/delete-result.example.json`.
The file property can be skipped if the route should only return an error.
#### delayBy (optional)

The amount time (in milliseconds) which passes before the file is returned.

#### error (optional)

A route can not only return a static mock file but is also able to return any HTTP error code. This is configured by adding the optional error property in which the HTTP code can be specified:

```javascript
{
    "active": true,
    "services": [
        {
            "active": true,
            "path": "exampleEndpoint",
            "file": "delete-result.error.json",
            "delayBy": 5000,
            "error": {
                "status": 500
            }
        }
    ]
}
```

If the error property is present, the file property can be left out if the HTTP response should contain no body.
