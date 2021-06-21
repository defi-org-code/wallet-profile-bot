const erc20 = require('erc-20-abi')
let web3 = require('./web3Provider');
const fs = require('fs');
const ethplorer = require('./ethplorer');
//const HolderTrack = require('./holderTrack');
//const HolderTrackBQ = require('./holderTrackBQ');
const HolderTrackBX = require('./holderTrackBX');
//const BLOCKS_PER_DAY = 6524;
//const config.maxToken = process.env.MAX_TOKEN_MON? parseInt(process.env.MAX_TOKEN_MON) : 10;
const config = require('./config');
//const LOOKBACK_DAYS = process.env.LOOKBACK_DAYS? parseInt(process.env.LOOKBACK_DAYS) : 14;

const dg = require('./dgraph');
const { time, count } = require('console');
const { send } = require('process');
const CACHE_FILENAME = './cache/tokens.json';
const CACHE_PAIR_FILENAME = './cache/pairs.json';

/////////////////////////////////////
const qGetToken = `
{
  tokens(where:{id:"{ADDRESS}"}) 
  { 
    id 	
    symbol
    txCount    
    tradeVolumeUSD
    totalLiquidity
    mostLiquidPairs
    decimals
  }
}`
/////////////////////////////////////
const qPairInfo = `{
  pairs(where:{id:"{ADDRESS}"}) {
    id  
    token0{symbol}
    token1{symbol}
    reserve0
    reserve1
    totalSupply
    token0Price
    token1Price
    volumeUSD
    reserveETH
    trackedReserveETH
    reserveUSD    
    txCount    
    liquidityProviderCount
  } 
}`;

/////////////////////////////////////
function Tokens(PREFIX, mon, wallets, counter){  
  const PREFIX_ANOT = PREFIX + ".anot.";  
  PREFIX += ".token.";

  let data = {};
  let contracts = {};
  let oldTokens = {}; //black list of token older than X days
  let addTokens = [];
  const intervalMinutes = mon.interval / 60000;

  // load cache
  function asJson(){
    let res = [];
    for(let id in data){
      const t = data[id];
      res.push({
        symbol:t.symbol,
        id:t.id,
        creationBlock:t.creationBlock,
        holders:t.holderTrack.count(),
        pairName:t.pair.name,
        pairId:t.pairId,
        totalLiquidity:t.totalLiquidity,
        tradeVolumeUSD:t.tradeVolumeUSD
      });
    }
    return res;
  }
  // load cache
  function load(){
    console.log('loading pairs');
    let pairs ;
    fs.readFile(CACHE_PAIR_FILENAME, (err, jsn) => {
      if (err){
        counter.addError("pair.readFile");
        return console.error('pair readFile', err);
      }
      pairs = JSON.parse(jsn);
    });
    if(!pairs)
      return console.error('load pairs failed');

    console.log('loading tokens');
    fs.readFile(CACHE_FILENAME, (err, jsn) => {
      if (err){
        counter.addError("token.readFile");
        return console.error('token readFile', err);
      }

      try{
        let obj = JSON.parse(jsn.toString());
        data = obj.data;
        oldTokens = obj.oldTokens;

        // patch pairs
        for (let id in data){
          let t = data[id];
          let pair = pairs[t.pair.id];
          if(pair)
            t.pair = pair;
        }
      }
      catch(e){
        counter.addError("token.readFileParse");
        console.error(e);
        data = {};
        oldTokens = {};
      }
    });
  }
  // save cache
  function save(){    
    console.log('save tokens');
    const strg = {
      data:data,
      oldTokens:oldTokens,
    };
    try{
      // save pairs to a dictionary first
      // link by ID on load
      pairs ={};
      for(let id in data){
        let t = data[id];
        pairs[t.pair.id] = t.pair
      }
      let pairJsn = JSON.stringify(pairs);
      fs.writeFile(CACHE_PAIR_FILENAME, pairJsn, function (err) {
        if (err) {
          counter.addError("token.writeFile");
          return console.error('token error writeFile ' + err);      
        }
      });

      // exclude pairs from writing files
      jsn = JSON.stringify(strg, function(key, val){        
        if (key=="pair") 
          return val.id;
      });
      fs.writeFile(CACHE_FILENAME, jsn, function (err) {
        if (err) {
          counter.addError("token.writeFile");
          return console.error('token error writeFile ' + err);      
        }
      });
    }catch(e){
      counter.addError("token.writeFileException");
      console.error('tokens exception writeFile '+ e);
    }
  }
  // load last 
  //load();

  /////////////////////////////////////
  async function update(){ 
    // no need to update
    if (!mon.due())      
      return false;
    
    let latestBlock = await web3.eth.getBlockNumber().catch(e => console.error(e));
    if(!latestBlock){
      counter.addError("token.lastBlockFail");
      console.error("token.lastBlockFail");
      return;
    }
    let updts = [];
    for (id in data){
      counter.addStat("token.update");
      updts.push(updateToken(data[id], latestBlock));
    }
    console.time("update_all_tokens");
    await Promise.all(updts);
    console.timeEnd("update_all_tokens");

    // storage
    //save();
  }
  /////////////////////////////////////
  function resetToken(t){
    // t.inVol = 0;
    // t.outVol = 0;
    //t.inVolUsd = 0;
    //t.outVolUsd = 0;
    //t.swapCount = 0;    
    //t.txVolume = 0;    
    //t.transfers = 0;  reset inside
  }
  /////////////////////////////////////
  async function updatePairInfo(cur, latestBlock){
    //update POOL PAIR info from graph
    ret = await dg.call(qPairInfo.replace("{ADDRESS}", cur.pair.id)).catch((e)=>{
      console.error("PairInfo: ",e);
      counter.addError("token.dgPairInfo");
    });
    if (ret && ret.data && ret.data.pairs){
      const pair = ret.data.pairs[0];
      cur.pair.totalSupply = parseInt(pair.totalSupply);
      cur.pair.volumeUSD = parseInt(pair.volumeUSD);
      cur.pair.price = parseFloat(pair["token"+cur.stableIndexInPool+"Price"]);
      if(!cur.firstPrice)
        cur.firstPrice = cur.pair.price ;
      cur.pair.reserveETH = parseInt(pair.reserveETH);
      cur.pair.reserveUSD = parseInt(pair.reserveUSD);   
      cur.pair.txCount = parseInt(pair.txCount);      
      //cur.pairLiquidityProviderCount = parseInt(pair.liquidityProviderCount);  NOT WORKING     
    }

    // check Pair LP Holders            
    let newHolders = await cur.pair.holderTrack.update(latestBlock);
    // count liquidity providers with positive balance
    cur.pair.lpCount =  cur.pair.holderTrack.count(true);
    //cur.pair.lpPast =  cur.pair.holderTrack.count(false);

    if(newHolders)
      /*await dont wait - blocking*/ wallets.check(newHolders);
  }
  /////////////////////////////////////
  async function updateToken(cur, latestBlock){    
    // ethplorer update PRICE???
    const res = await ethplorer.getAddressInfo(cur.id);
    if(res && !res.error){    
      cur.ethplorer = res;
      if(!cur.creationBlock && cur.ethplorer?.contractInfo?.transactionHash){
        let tx = await web3.eth.getTransaction(cur.ethplorer.contractInfo.transactionHash).catch(e=>console.error(e));
        if(tx){
          cur.creationBlock = tx.blockNumber;
          counter.addStat("token.foundCreationBlock");
        }
      }
    }else{
      counter.addError("token.ethplorerEmpty");
      if(res.error)
        console.log('ethplorer error:', res.error);
    }

    // get token from graph
    let ret = await dg.call(qGetToken.replace("{ADDRESS}", cur.id)).catch(e=>console.error("getToken",e));
    if(ret.error){
      counter.addError("token.dgGetTokenError");
      console.error("dg.getToken", errors[0])
      return false;
    }
    const updt = ret.data.tokens[0];
    if(!updt){
      counter.addError("token.dgGetTokenEmpty");
      return false;
    }
    counter.addStat("token.dgGetToken");

    //update fields
    cur.txCount = parseInt(updt.txCount);
    //cur.totalSupply = parseInt(updt.totalSupply);
    cur.tradeVolumeUSD = parseInt(updt.tradeVolumeUSD);
    cur.totalLiquidity = parseInt(updt.totalLiquidity);
    cur.mostLiquidPairs = updt.mostLiquidPairs;
    cur.decimals = parseInt(updt.decimals);
    
    // verify holders
    // wallets.check(cur.holders); // make sure wallet.js is aware of all holders, after load file
    // for (holder of cur.holders)
    //   verifyHolder(cur, holder);

    // get past events - async CHAIN
    //let contract = contractOf(cur.id);
    let newHolders = await cur.holderTrack.update(latestBlock,  cur.decimals);
    //cur.transfers = cur.holderTrack.lastTransfers;
    
    if(newHolders)
      /*await*/ wallets.check(newHolders);
    // console.log(`${cur.symbol} get Transfers from ${cur.updatedBlock}-${latestBlock}\t last ${latestBlock-cur.updatedBlock}`);
    // const transfers = await pastEvents.getTransfersFromPara(contract, cur.updatedBlock, latestBlock);
    // if(transfers){
    //   if(transfers.length){
    //     const calcVolume = true; // will be considered during update
    //     enumTokenTransfers(cur, transfers, calcVolume);

    //     cur.updatedBlock = latestBlock;
    //     cur.transfers += transfers.length;
    //     const prevHolderLength = cur.holders.length;
    //     console.log(`${cur.symbol}\t${prevHolderLength-cur.holders.length} holders added in ${transfers.length} transfers`);
    //   }
    // }
    // else{
    //   console.error(`${cur.symbol}\tgetTransfersFromPara transfers NULL`);
    //   counter.addError("token.getTtransfersNull");
    // }
        
    // update token price - coingeko?

    // update pair 
    updatePairInfo(cur, latestBlock);          
    return true;
  }
  /////////////////////////////////////
  const stables = "DAI,USDC,USDT,ETH,WETH,BTC,WBTC".split(',');      
  function fromAnyPair(pair){    
    if(stables.indexOf(pair.token0.symbol) > -1){
      pair.token1.stableIndexInPool = 0;
      return pair.token1;
    }else if (stables.indexOf(pair.token1.symbol) > -1){
      pair.token0.stableIndexInPool = 1;
      return pair.token0; 
    }
    //console.log(`-- Ignore non WETH token ${s.pair.token0.symbol}-${s.pair.token1.symbol}`);
    console.log(`Unrecognized stable in pair ${s.pair.token0.symbol}-${s.pair.token1.symbol}`);
    return null;
  }
  /////////////////////////////////////
  function full(){
    return config.maxToken && Object.keys(data).length >= config.maxToken;
  }
    
  /////////////////////////////////////
  async function check(pair, sender, latestBlock){
    /////////////////////////////
    let t = fromAnyPair(pair);
    if(!t)
      return false;

    t.pair = pair;
    //t.pairId = pair.id;
    t.pair.name = `${pair.token0.symbol}-${pair.token1.symbol}`; 

    /////////////////////////////
    if (!t.id){
      counter.addError("token.checkNoID");
      console.error("token ID is missing");
      return false;
    }

    // token already monitored
    if(data[t.id] || oldTokens[t.id]){      
      return true; // monitored
    }

    console.log(`tokens check ${t.pair.name}`);

    /////////////////////////////
    // debug monitoring LIMIT    
    if (full()){
      return false;
    }

    // shitcoin logic
    if (t.symbol.length > 10){
      counter.addStat("token.longSymbol");
      console.log(`${t.symbol}\ttoken symbol > 6`);
      return false;
    }
    // filter wierd chars - fucks up graphana
    if(/^[a-zA-Z0-9]+$/.test(t.symbol) == false){   
      counter.addStat("token.nonLatinSymbol");
      console.log("token is not of latin etters $ ", t.symbol);
      return false;
    }
    
    // blacklist stable/big token
    if (stables.indexOf(t.symbol) > -1)
      return false;
    
    // count liquidity providers with positive balance
    //pair.holderTrack = new HolderTrack(pair.name, contractOf(pair.id), parseInt(pair.createdAtBlockNumber), counter);
    const uniV2LPdecimals = 18;
    pair.holderTrack = new HolderTrackBX(pair.name, pair.id, parseInt(pair.createdAtTimestamp), uniV2LPdecimals, counter);
    let newHolders = await pair.holderTrack.update(latestBlock);
    if(newHolders)
      /*await*/ wallets.check(newHolders);    
    pair.lpCount = pair.holderTrack.count(true);
    if(pair.lpCount < 2){
      counter.addStat('token.LPCountLow');
      console.log(`${t.pair.name} LOW lpCount ${pair.lpCount}`);
      return;
    }
    
    
    counter.addStat("token.startMonitor");
    console.log(`start monitor token:${t.symbol}\t${t.id}`);
    console.log(`start monitor pair :${pair.name}\t${pair.id}`);

    // aff fields
    resetToken(t);

    // add holders
    t.holderTrack = new HolderTrackBX(t.symbol, t.id, parseInt(pair.createdAtTimestamp), null, counter);    
    
    // set for interval
    await updateToken(t, latestBlock);
    
    // add token
    addTokens.push(t.id);
    data[t.id] = t;
    return true; // token added
  }  
  /////////////////////////////////////
  function addTokenMetric(metrics, t, name){
    //if(t[name] > 0){ send megative values as well
      metrics[PREFIX + t.symbol +"."+ name] = t[name];
    //}
  }
  /////////////////////////////////////
  function addPairMetric(metrics, t, name){
    const nameCap = name.charAt(0).toUpperCase() + name.slice(1);
    metrics[PREFIX + t.symbol +'.pair'+nameCap] = t.pair[name];
  }
  /////////////////////////////////////
  function addTokenHolderDistribution(metrics, t){
    let dis = t.holderTrack.distribution();
    const count = t.holderTrack.count();
    if(!dis) {
      return;
    }

    const prefix = PREFIX + t.symbol + ".holders_distribution.";
    // add distrinution    
    for(let type in dis){
      metrics[prefix + type] = dis[type] / count;
    }
  }
  /////////////////////////////////////
  function addTokenHolderMetrics(metrics, t){
    let holders = t.holderTrack.get(true);
    t.holders = holders;

    if(!holders.length){    
      console.log(`${t.symbol} holders is empty`);
    }
    
    const prefix = PREFIX + t.symbol;
    metrics[prefix +".holders_count.bot"] = holders.length;
    if(t.ethplorer?.tokenInfo?.holdersCount)
      metrics[prefix +".holders_count.ethplorer"] = t.ethplorer.tokenInfo.holdersCount;

    // add supply balance of holders - for validation should be constant
    metrics[prefix +".holders_posBalance"] = t.holderTrack.posBalance();

    wallets.appendMetricsOf(holders, metrics, prefix);    
  }  
  /////////////////////////////////////
  function sendTokenMetrics(t, client){    
    var metrics = {};
    
    // add calculated metrics
    //addTokenMetric(metrics, t,  "swapCount");

    // deprecated
    // addTokenMetric(metrics, t,  "inVol");
    // addTokenMetric(metrics, t,  "inVolUsd");
    // addTokenMetric(metrics, t,  "outVol");
    // addTokenMetric(metrics, t,  "outVolUsd");

    //addTokenMetric(metrics, t,  "txVolume");
    //addTokenMetric(metrics, t,  "transfers");

    // add holders metric
    addTokenHolderMetrics(metrics, t);
    // add holders Type Distribution
    addTokenHolderDistribution(metrics, t);

    // add pool-pair metrics    
    // addTokenMetric(metrics, t, "pairTotalSupply");
    addPairMetric(metrics, t, "totalSupply");    
    addPairMetric(metrics, t, "volumeUSD");    
    addPairMetric(metrics, t, "price");
    addPairMetric(metrics, t, "reserveETH");    
    addPairMetric(metrics, t, "reserveUSD");

    addPairMetric(metrics, t, "lpCount");
    //addPairMetric(metrics, t, "lpPast");
    addPairMetric(metrics, t, "txCount");
            
    t.pairPriceChange = t.firstPrice? t.pair.price / t.firstPrice -1 : 0;
    addTokenMetric(metrics, t, "pairPriceChange");

    // add token graph metrics
    addTokenMetric(metrics, t, "txCount");      
    addTokenMetric(metrics, t, "tradeVolumeUSD");
    addTokenMetric(metrics, t, "totalLiquidity");

    // add age
    if(t.ethplorer?.contractInfo?.timestamp){
      t.ageHours = Math.round(Date.now() - (t.ethplorer.contractInfo.timestamp * 1000) / (1000 *3600));
      addTokenMetric(metrics, t, "ageHours");        
    }
    // add ETHPLORER tokenInfo
    if(t.ethplorer?.tokenInfo?.price){
      const prefix = PREFIX + t.symbol;
      metrics[prefix +".ethplorer.price.marketCapUsd"] = t.ethplorer.tokenInfo.price.marketCapUsd;
      metrics[prefix +".ethplorer.price.volume24h"] = t.ethplorer.tokenInfo.price.volume24h;
      metrics[prefix +`.ethplorer.price.${t.ethplorer.tokenInfo.price.currency}`] = t.ethplorer.tokenInfo.price.rate;        
    }
           
    //var tags = {'name': 'foo.bar', 'some.fancy.tag': 'somefancyvalue'};
    resetToken(t);
        
    //client.write(metrics, Date.now(), function(err) {
    client.write(metrics, function(err) {
      // if err is null, your data was sent to graphite!
      if(err){
        console.error(err);
        counter.addError("token.sendTokenMetrics");
      }
      // else
      //   console.log(metrics);   
    });  
  }
  /////////////////////////////////////
  function sendMetrics(client){
    // tokens data iteration
    for ( let id in data ){ 
      sendTokenMetrics(data[id], client);
    }
    // added tokens annotations
    // add monitored new token annotations - //$PREFIX.mon.add.paiName
    var metrics = {};
    for (let id of addTokens){
      let t = data[id];
      metrics[PREFIX_ANOT +"tokenStart."+t.pair.name] = 1;
    }
    addTokens = [];    
    client.write(metrics, function(err) {
      // if err is null, your data was sent to graphite!
      if(err)
        console.error(err);      
    });  
  }
  /////////////////////////////////////
  return {
    update: update,
    check: check,
    //addVolume: addVolume,
    sendMetrics: sendMetrics,
    full:full,
    asJson:asJson,
    data: data,
  }
}

module.exports = Tokens;


// TEST
if (require.main === module) {
  const Monitor = require("./monitor");
  const wallets = require("./wallets")(Monitor(1000 * 60 * 30));
  //fast 
  const tokens = require("./tokens")(Monitor(1000 * 60 * 1), wallets);
  web3.eth.getBlockNumber().then(latestBlock=>{
    //const sender = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
    const sender = "0x1";
    const pair = `{
      "id": "0x2",
      "token0": {
        "id": "0x831091da075665168e01898c6dac004a867f1e1b",
        "symbol": "BDT"
      },
      "token1": {
        "id": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "symbol": "WETH"
      }
    }`
    let obj = JSON.parse(pair);
    tokens.check(obj, sender, latestBlock);
  });
}