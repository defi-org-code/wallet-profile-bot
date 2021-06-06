const fetch = require("node-fetch");
const keys = require("./config");

//https://api.covalenthq.com/v1/1/address/0x1494ca1f11d487c2bbe4543e90080aeba4ba3c2b/portfolio_v2?key=
const getBalanceUrl = `https://api.covalenthq.com/v1/1/address/{ADDRESS}/balances_v2?key=` + config.keys.covalent;
const getPriceUrl = `https://api.covalenthq.com/v1/pricing/tickers?tickers={TIKERS}&key=${config.keys.covalent}`;
/////////////////////////////////////////////
async function getPrice(tickers){
  try {
    const url = getPriceUrl.replace("{TIKERS}", tickers); // coma sep tokens
    console.log(url);
    let res = await fetch(url, {
      method: 'GET',
      headers: {        
        'Accept': 'application/json',
      }//,
      //body: JSON.stringify({ key: ""})
    })
    return res.json();
  } catch (error) {
    console.error("covalent getPrice", error);
  }
}
/////////////////////////////////////////////
async function getBalance(address)
{
  try {
    const url = getBalanceUrl.replace("{ADDRESS}", address);
    console.log(url);
    let res = await fetch(url, {
      method: 'GET',
      headers: {        
        'Accept': 'application/json',
      }//,
      //body: JSON.stringify({ key: ""})
    })
    return res.json();
  } catch (error) {
    console.error("covalent getBalance", error);
    return null;
  }
}
/////////////////////////////////////////////
async function getTotalEthBalance(address, usdEthRate){
  const res = await getBalance(address);
  let symbols = [];
  let blncETH = 0;
  if(res.data && res.data.items){
    for (wlt of res.data.items){      
      // //console.log(wlt);
      // const balance = parseFloat(wlt.balance) / (10 ** wlt.contract_decimals);
      // console.log(balance);
      // console.log("$"+wlt.quote);
      // console.log("1token = $"+wlt.quoteRate);

      blncETH += wlt.quote / usdEthRate;
      symbols.push(wlt.contract_ticker_symbol);
    }
    return {
      blncETH: blncETH,
      symbols: symbols
    }
  }
  return null;
}

module.exports.getTotalEthBalance = getTotalEthBalance;
module.exports.getPrice = getPrice;


if (require.main === module) {
  getTotalEthBalance("0x61c53d050858a5865201d0ad4d0257fe16340c39", 600).then((res)=>{
    console.log(res);
  });
  // getPrice('ETH').then((eth)=>{
  //   const usdEthRate = eth.data.items[0].quote_rate;
  //   getBalance("0x61c53d050858a5865201d0ad4d0257fe16340c39").
  //   then((res)=>{            
  //     if(res.data && res.data.items){
  //       for (wlt of res.data.items){
  //         console.log(`--- ${wlt.contract_ticker_symbol} ---`)
  //         //console.log(wlt);
  //         const balance = parseFloat(wlt.balance) / (10 ** wlt.contract_decimals);
  //         console.log(balance);
  //         console.log("$"+wlt.quote);
  //         console.log("1token = $"+wlt.quoteRate);
  //         const blncETH = wlt.quote / usdEthRate
  //         console.log(`TOTAL BALANCE ETH: ${blncETH}`)
  //       }
  //     }
  //   });
  //});
}