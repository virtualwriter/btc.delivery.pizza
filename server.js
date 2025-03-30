const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));

const clients = new Map();

const mempoolWs = new WebSocket('wss://mempool.space/api/v1/ws');
mempoolWs.on('open', () => console.log('Connected to Mempool.space WebSocket'));
mempoolWs.on('message', (data) => {
  const update = JSON.parse(data);
  const txid = update.txid;
  if (clients.has(txid)) {
    clients.get(txid).forEach(client => client.send(JSON.stringify(update)));
  }
});

app.post('/track', async (req, res) => {
  const { txid } = req.body;
  try {
    const txResponse = await axios.get(`https://mempool.space/api/tx/${txid}`);
    const txData = txResponse.data;
    const currentHeight = (await axios.get('https://mempool.space/api/blocks/tip/height')).data;
    const confirmations = txData.status.confirmed ? currentHeight - txData.status.block_height + 1 : 0;

    const initialStatus = {
      confirmed: txData.status.confirmed,
      blockHeight: txData.status.block_height || null,
      confirmations: confirmations
    };

    mempoolWs.send(JSON.stringify({ "track-tx": txid }));
    res.json({ message: 'Tracking started', initialStatus });
  } catch (err) {
    res.status(404).json({ error: 'Invalid TXID' });
  }
});

wss.on('connection', (ws, req) => {
  const txid = req.url.split('/')[2];
  if (!clients.has(txid)) clients.set(txid, new Set());
  clients.get(txid).add(ws);

  if (txid) {
    let lastConfirmations = 0;
    const checkConfirmations = setInterval(async () => {
      try {
        const response = await axios.get(`https://mempool.space/api/tx/${txid}`);
        const txData = response.data;
        if (txData.status.confirmed && txData.status.block_height) {
          const currentHeight = (await axios.get('https://mempool.space/api/blocks/tip/height')).data;
          const confirmations = currentHeight - txData.status.block_height + 1;
          if (confirmations !== lastConfirmations) {
            ws.send(JSON.stringify({ stage: 'Additional', confirmations }));
            lastConfirmations = confirmations;
          }
        }
      } catch (err) {
        console.log('Error checking confirmations:', err.message);
      }
    }, 60000);

    ws.on('close', () => {
      clients.get(txid).delete(ws);
      clearInterval(checkConfirmations);
    });
  }
});

server.listen(3000, () => console.log('Server running on port 3000'));