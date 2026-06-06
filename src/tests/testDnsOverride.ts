import dns from 'dns';
import axios from 'axios';

dns.setServers(['8.8.8.8', '8.8.4.4']);

const originalLookup = dns.lookup;
dns.lookup = function (hostname: string, options: any, callback: any) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const isAll = options && options.all;
  dns.resolve4(hostname, (err, addresses) => {
    if (err) return (originalLookup as any).call(dns, hostname, options, callback);
    if (!addresses || addresses.length === 0) return (originalLookup as any).call(dns, hostname, options, callback);
    if (isAll) {
      callback(null, addresses.map(addr => ({ address: addr, family: 4 })));
    } else {
      callback(null, addresses[0], 4);
    }
  });
} as any;

async function run() {
  try {
    console.log('Fetching funding rate...');
    const url = 'https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=USDT-FUTURES';
    const res = await axios.get(url);
    console.log('Success! Data:', res.data);
  } catch (err: any) {
    console.error('Error fetching funding rate:', err.response?.data || err.message);
  }
}

run();
