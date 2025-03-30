const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { txid } = req.body;
  if (!txid) {
    return res.status(400).json({ error: 'TXID required' });
  }

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

    res.status(200).json({ message: 'Tracking started', initialStatus });
  } catch (err) {
    console.error('API Error:', err.message);
    if (err.response && err.response.status === 404) {
      return res.status(404).json({ error: 'Invalid TXID' });
    }
    res.status(500).json({ error: 'Failed to fetch transaction data' });
  }
};