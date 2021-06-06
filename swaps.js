const dg = require('./dgraph');
let web3 = require('./web3Provider');
const LOOKBACK_DAYS = process.env.LOOKBACK_DAYS? parseInt(process.env.LOOKBACK_DAYS) : 7;

qLatestSwaps = `{
  swaps(where:{amountUSD_gt:100, timestamp_gt:"$NOW"}){
    id
    pair {
      id
      createdAtBlockNumber
      createdAtTimestamp
      txCount      
      token0 {
        id
        symbol       
      }
      token1 {
        id
        symbol        
      }
    }
    timestamp
    amount0In
    amount0Out
    amount1In
    amount1Out
    sender
    amountUSD
  }
}`;
/////////////////////////////////////
function Swaps(mon, tokens, counter){
  let data = {};
  /////////////////////////////////////
  function daysSince(ts){
    var diff = Date.now() - (ts * 1000);
    return Math.round(diff / (1000 * 3600 * 24));
  }

  /////////////////////////////////////
  async function checkPair(p, latestBlock){
    // filter pair too old
    const days = daysSince(p.createdAtTimestamp);
    if ( days > LOOKBACK_DAYS){
      console.log(`${p.token0.symbol}-${p.token1.symbol} Pair ${days} days old > ${LOOKBACK_DAYS}`);
      counter.addStat("swap.pairTooOld");
      return;
    }
    
    // record volume      
    let monitored = await tokens.check(p, null, latestBlock);
    if (monitored){
      counter.addStat("swap.monitored");
      // RESTORE THIS! good signal
      // out
      // if (s.amount0In === "0"){
      //   tokens.addVolume(p.token0.id, false, s.amount0Out, s.amountUSD);
      // }
      // // in
      // else{
      //   tokens.addVolume(p.token0.id, true, s.amount0In, s.amountUSD);
      // }
    }
   
  }
  /////////////////////////////////////
  async function check(s, latestBlock){
    // // ignore non WETH pairs
    // if(s.pair.token1.symbol !== "WETH"){
    //   console.log(`---Exclude ${s.pair.token0.symbol}-${s.pair.token1.symbol}`);
    //   return;
    // }     
    
    if (!data[s.id]){ 
      counter.addStat("swap.check");
      data[s.id] = s;
      await checkPair(s.pair, latestBlock);
    }      
  }
  /////////////////////////////////////
  async function update(){
    // cleanup
    // if (data.length > 10000){
    //   data.splice(0, 5000);
    // }

    // need to update
    if (!mon.due())      
      return false;
    
    // call uniswap graph
   
    // format query
    var coeff = 1000 * 60 * 1; // round by minute
    //go back interval + a minute for graphg to update
    var date = new Date(Date.now() - (mon.interval + 1000 * 60) );  
    var rounded = new Date(Math.round(date.getTime() / coeff) * coeff)
    q = qLatestSwaps.replace("$NOW", rounded.getTime()/1000)
    
    let ret = await dg.call(q);
    if (ret && ret.data && ret.data.swaps){
      let latest = await web3.eth.getBlockNumber();
      for (s of ret.data.swaps){
        await check(s, latest);     
      }
    }else{
      counter.addError("swap.dgRes");
    }     
  }
  /////////////////////////////////////
  return {
    update: update,
    // testing
    checkPair:checkPair
  }
}

module.exports = Swaps;

///////////////////////////////////////////////////////////////////////////////////////////////////
// TEST
///////////////////////////////////////////////////////////////////////////////////////////////////

// test specific Pair
async function testPair(){
  console.log('test pair start ------------------------------------------');
  const pairGelWeth = {
    "createdAtBlockNumber": "11796383",
    "createdAtTimestamp": "1612529753",
    "id": "0x7eabe80026b71d1484a23ddcdb1ef7131c20aee8",
    "token0": {
      "id": "0x94ec4e3a7c5068ae4a035f702f2cd5a6da9c5cc1",
      "symbol": "GEL"
    },
    "token1": {
      "id": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      "symbol": "WETH"
    },
    "txCount": "1317"
  };

  // DEXm
  const pairDexm =  {
    "createdAtBlockNumber": "11849710",
    "createdAtTimestamp": "1613237977",
    "id": "0xc92b1c381450c5972ee3f4a801e651257aed449a",
    "token0": {
      "id": "0x0020d80229877b495d2bf3269a4c13f6f1e1b9d3",
      "symbol": "DEXM"
    },
    "token1": {
      "id": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      "symbol": "WETH"
    },
    "txCount": "3429"
  };

  const graphite = require('graphite');
  const grphClient = graphite.createClient(process.env.GRAPHITE);
  const counter = require("./counter")(grphClient);
  const Monitor = require("./monitor");
  const threeH = Monitor(1000 * 60 * 60 * 3);
  const sec59 = Monitor(1000 * 59);
  const wallets = require("./wallets")(sec59, counter);
  const tokens = require("./tokens")(sec59, wallets, counter);
  const swaps = require("./swaps")(sec59, tokens, counter);
  console.log('getBlockNumber start');
  let latest = await web3.eth.getBlockNumber();
  console.log('getBlockNumber end');
  await swaps.checkPair(pairDexm, latest);
  
  setInterval(()=>{
    try {
      tokens.update();
      wallets.update();
      // metrics
      tokens.sendMetrics(grphClient);
      // starts and errors
      counter.sendMetrics();
    }catch(e){
      console.error("SWAP TEST CATCH: " +e)
    }
  },60 * 1000);  
}

if (require.main === module) {
  testPair();
}