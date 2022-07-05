# timeld api

There are two ways to manipulate the data in **timeld**.

- The Gateway server HTTP API – import and export of timesheets and projects
- [**m-ld**](https://m-ld.org/) – live read/write sharing of timesheet content ![coming soon](https://img.shields.io/badge/-coming%20soon-red)

## pre

Data API access requires a _key_, which can be obtained using the Command Line Interface (CLI).

1. [Install and configure](https://www.npmjs.com/package/timeld-cli#install) the CLI.
2. Open an [administration session](https://www.npmjs.com/package/timeld-cli#admin) and follow the instructions to register the local device.
3. Type `key` ⏎ and your API access key will be displayed.
4. Type `exit` ⏎ to leave the admin session.

The key provided is specific to your user account, and has the same access rights as you do.

## http api for timesheets & projects

### import

This end-point allows you to import any number of projects, timesheets and timesheet entries from another system.

- **Request**
  ```
  POST /api/import
  Authorization: Basic {base_64(user+":"+key)}
  Content-Type: application/x-ndjson
  ```
  The import data should be provided as [new-line delimited JSON (NDJSON)](http://ndjson.org/). Each line is a [JSON object](https://datatracker.ietf.org/doc/html/rfc8259#section-4), and so starts and ends with braces, `{` & `}`. [JSON Type Definitions](https://jsontypedef.com/) for valid objects (including full property documentation) can be found at https://timeld.org/jtd. For Linked Data applications, the associated JSON-LD context can be [retrieved](#json-ld-context).

  It is highly recommended that each object include the `external` property, specifying a URI which uniquely identifies the data in the source system; see below for examples. For Projects and Timesheets, you must also specify the target `@id` of the object in **timeld**. For timesheet Entries, you **must not** include the `@id` field, as it will be generated. If you later want to overwrite an existing external timesheet entry, use the same `external` property value again.

  The `session` property of a Timesheet Entry must identify the Timesheet to which it belongs.

  
- **Example Request Body**
  ```ndjson
  {"@type":"Project","@id":"org1/pr1","external":{"@id":"http://ex.org/project/1"}}
  {"@type":"Timesheet","@id":"org1/ts1","project":[{"@id":"org1/pr1"}],"external":{"@id":"http://ex.org/timesheet/1"}}
  {"@type":"Entry","session":{"@id":"org1/ts1"},"activity":"orging","duration":60,"start":{"@value":"2022-06-22T16:40:55.946Z","@type":"http://www.w3.org/2001/XMLSchema#dateTime"},"vf:provider":{"@id":"test"},"external":{"@id":"http://ex.org/timesheet/1/entry/1"}}
  ```

- **Response**
  ```
  Status: 200
  ```

### report

This end-point is equivalent to using `report` in an admin CLI session.

The order of subjects will be:

1. The project, if applicable.
2. The timesheet OR all timesheets in the project, each followed immediately by its entries.

- **Request**
  ```
  GET /api/rpt/{account}/own/{name}
  Authorization: Basic {base_64(user+":"+key)}
  ```
- **Response**
  ```
  Transfer-Encoding: chunked
  Content-Type: application/x-ndjson
  ```
  The results are streamed as [new-line delimited JSON (NDJSON)](http://ndjson.org/). Each line is a [JSON object](https://datatracker.ietf.org/doc/html/rfc8259#section-4). For Linked Data applications, the associated JSON-LD context can be [retrieved](#json-ld-context).

  
- **Example Response Body**
  ```ndjson
  {"@id":"org1/pr1","@type":"Project"}
  {"@id":"org1/ts1","project":{"@id":"org1/pr1"},"@type":"Timesheet"}
  {"@id":"69msUcupDDNbgnt8b7VYdf/1","activity":"orging","duration":60,"session":{"@id":"69msUcupDDNbgnt8b7VYdf"},"start":{"@value":"2022-06-22T16:40:55.946Z","@type":"http://www.w3.org/2001/XMLSchema#dateTime"},"@type":"Entry","vf:provider":{"@id":"test"}}
  {"@id":"test/ts2","project":{"@id":"org1/pr1"},"@type":"Timesheet"}
  {"@id":"nJHsHgSKURAxKrVPm8ETf9/1","activity":"testing","duration":120,"session":{"@id":"nJHsHgSKURAxKrVPm8ETf9"},"start":{"@value":"2022-06-21T10:52:11.032Z","@type":"http://www.w3.org/2001/XMLSchema#dateTime"},"@type":"Entry","vf:provider":{"@id":"test"}}
  ```
  
### JSON-LD context

The JSON object form used for importing and reporting is [JSON-LD](https://json-ld.org/). Linked Data applications interacting with **timeld** may obtain the associated JSON-LD [Context](https://www.w3.org/TR/json-ld/#the-context) as follows.

- **Request**
  ```
  GET /context
  ```

- **Response**
  ```
  Content-Type: application/ld+json
  ```

- **Example Response Body**
  ```
  {"@base":"http://timeld.org/","@vocab":"http://timeld.org/#","foaf":"http://xmlns.com/foaf/0.1/","vf":"https://w3id.org/valueflows#"}
  ```

## m-ld api for timesheets

![coming soon](https://img.shields.io/badge/-coming%20soon-red)
