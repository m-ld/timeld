# timeld api

There are two ways to manipulate the data in **timeld**.

- The Gateway server HTTP API – import and export of timesheets and projects
- [**m-ld**](https://m-ld.org/) – live read/write sharing of timesheet content

## pre

Data API access requires a _key_, which can be obtained using the Command Line Interface (CLI).

1. [Install and configure](https://www.npmjs.com/package/timeld-cli#install) the CLI.
2. Open an [administration session](https://www.npmjs.com/package/timeld-cli#admin) and follow the instructions to register the local device. When done, type `exit` ⏎ to leave the admin session.
3. Use `timeld config` (no options) to display the configuration. Your key is found here: `"ably" : { "key": "{your.key}"`

## http api

### timesheet/project export

This end-point is equivalent to using `report` in an admin CLI session.


The order of subjects will be:

1. The project, if applicable.
2. The timesheet OR all timesheets in the project, each followed immediately by its entries.

- **Request**
  ```
  GET /api/rpt/{account}/own/{name}
  Authorization: Basic {base_64(user, key)}
  ```
- **Response**
  ```
  Transfer-Encoding: chunked
  Content-Type: application/x-ndjson
  ```
  The results are streamed as [new-line delimited JSON (NDJSON)](http://ndjson.org/). Each line is a JSON-LD subject. The JSON-LD context of the Subjects is:
  <!-- TODO: end-point for this -->
  
  ```json
  {
    "@base": "http://{gateway}/",
    "@vocab": "http://timeld.org/#",
    "om2": "http://www.ontology-of-units-of-measure.org/resource/om-2/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "vf": "https://w3id.org/valueflows#"
  }
  ```
- **Example**
  ```ndjson
  {"@id":"org1/pr1","@type":"Project"}
  {"@id":"org1/ts1","project":{"@id":"org1/pr1"},"@type":"Timesheet"}
  {"@id":"69msUcupDDNbgnt8b7VYdf/1","activity":"orging","duration":60,"session":{"@id":"69msUcupDDNbgnt8b7VYdf"},"start":{"@value":"2022-06-22T16:40:55.946Z","@type":"http://www.w3.org/2001/XMLSchema#dateTime"},"@type":"Entry","vf:provider":{"@id":"test"}}
  {"@id":"test/ts2","project":{"@id":"org1/pr1"},"@type":"Timesheet"}
  {"@id":"nJHsHgSKURAxKrVPm8ETf9/1","activity":"testing","duration":120,"session":{"@id":"nJHsHgSKURAxKrVPm8ETf9"},"start":{"@value":"2022-06-21T10:52:11.032Z","@type":"http://www.w3.org/2001/XMLSchema#dateTime"},"@type":"Entry","vf:provider":{"@id":"test"}}
  ```
  
### timesheet live updates

![coming soon](https://img.shields.io/badge/-coming%20soon-red)
  
### timesheet import

![coming soon](https://img.shields.io/badge/-coming%20soon-red)
  
## m-ld api

![coming soon](https://img.shields.io/badge/-coming%20soon-red)
