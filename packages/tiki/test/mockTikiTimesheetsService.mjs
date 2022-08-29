import { createServer } from 'http';
import { once } from 'events';

let nextItemId = 0;

const server = createServer(async (req, res) => {
  console.log(req.url);
  console.log(req.headers);
  req.pipe(process.stdout, { end: false });
  await once(req, 'end');
  console.log('\n###');

  res.writeHead(200);
  const [/*root*/,/*api*/,/*trackers*/, trackerId,/*items*/, itemId] = req.url.split('/');
  res.end(JSON.stringify({
    trackerId: Number(trackerId),
    trackerName: 'Timesheets',
    itemId: (itemId || nextItemId++).toString(),
    fields: {/*input*/},
    status: 'o'
  }));
});

server.listen(56801, () => {
  console.log('Listening on port ' + server.address()['port']);
});