import { createServer } from 'http';
import { once } from 'events';

let movementId = 0;

const server = createServer(async (req, res) => {
  console.log(req.url);
  console.log(req.headers);
  req.pipe(process.stdout, { end: false });
  await once(req, 'end');
  console.log('\n###');

  res.writeHead(200);
  const command = req.url.substring(req.url.lastIndexOf('/') + 1);
  if (command.startsWith('update')) {
    res.end();
  } else {
    // Only the movement ID is interesting to the connector
    res.end(JSON.stringify([{
      movementId: ++movementId
    }]));
  }
});

server.listen(56800, () => {
  console.log('Listening on port ' + server.address()['port']);
});