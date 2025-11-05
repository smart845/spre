import fetch from 'node-fetch';

const RPC = {
  ethereum: 'https://rpc.ankr.com/eth',
  bsc: 'https://bsc-dataseed.binance.org',
  polygon: 'https://polygon-rpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  optimism: 'https://mainnet.optimism.io',
  base: 'https://mainnet.base.org'
};

const OX = {
  ethereum:'https://api.0x.org',
  bsc:'https://bsc.api.0x.org',
  polygon:'https://polygon.api.0x.org',
  arbitrum:'https://arbitrum.api.0x.org',
  optimism:'https://optimism.api.0x.org',
  base:'https://base.api.0x.org'
};

async function erc20Decimals(chain, token){
  const rpc = RPC[chain];
  if(!rpc) throw new Error('Unsupported chain '+chain);
  const body = {
    jsonrpc:'2.0', id:1, method:'eth_call',
    params:[{ to: token, data:'0x313ce567' }, 'latest']
  };
  const r = await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j = await r.json();
  if(!j?.result) throw new Error('decimals eth_call failed');
  return parseInt(j.result,16);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','*');

  try{
    const chain = String(req.query.chain||'').toLowerCase();
    const baseAddr = String(req.query.base||'').toLowerCase();
    const quoteAddr = String(req.query.quote||'').toLowerCase();
    if(!OX[chain]) return res.status(400).json({error:'Unsupported chain'});
    if(!baseAddr || !quoteAddr) return res.status(400).json({error:'base/quote required'});

    const baseDec = await erc20Decimals(chain, baseAddr).catch(()=>18);
    const sellAmount = '1000000'; // 1 USDT/USDC (6 decimals)

    const url = `${OX[chain]}/swap/v1/price?sellToken=${quoteAddr}&buyToken=${baseAddr}&sellAmount=${sellAmount}`;
    const r = await fetch(url);
    if(!r.ok){
      const t=await r.text();
      return res.status(502).json({error:'0x error', details:t});
    }
    const j = await r.json();
    const buyAmount = BigInt(j.buyAmount);
    const denom = BigInt(10)**BigInt(baseDec);
    if(buyAmount===0n) return res.status(502).json({error:'buyAmount=0'});
    const priceUsd = Number((BigInt(1_000_000) * denom) / buyAmount) / 1e6;

    res.status(200).json({ priceUsd, dex: '0x', sources: j.sources||[] });
  }catch(e){
    res.status(500).json({error:String(e)});
  }
}