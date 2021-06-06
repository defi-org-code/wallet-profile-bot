//const web3 = require('./web3Provider');
const fs = require('fs');
const fetch = require("node-fetch");
let web3 = require('./web3Provider');
const MEGA_HOLDER_BTC = process.env.MEGA_HOLDER_BTC? parseInt(process.env.MEGA_HOLDER_BTC) : 5000;

const walletAPI = process.env.WALLET || "http://localhost:3000//wallet2";
const WALLET_BATCH_SIZE = parseInt(process.env.WALLET_BATCH_SIZE || 5);
const CACHE_FILENAME = './cache/wallets.json';

//const WALLET_REDIS = process.env.WALLET_REDIS || "redis://localhost:6379/";
//const SKIP_REDIS = process.env.SKIP_REDIS? process.env.SKIP_REDIS=="1" : false;

//const redis = require("redis").createClient(WALLET_REDIS,{auth_pass:"lambo2020"});
//const redisGet = promisify(redis.hgetall).bind(redis);


/////////////////////////////////////
const asc = arr => arr.sort((a, b) => a - b);
/////////////////////////////////////
const quantile = (arr, q) => {
  const sorted = asc(arr);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
      return sorted[base];
  }
}
/////////////////////////////////////
const sum = arr => arr.reduce((a, b) => a + b, 0);
    
/////////////////////////////////////
const std = (arr, mu) => {  
  const diffArr = arr.map(a => (a - mu) ** 2);
  return Math.sqrt(sum(diffArr) / (arr.length - 1));
};

/////////////////////////////////////
function Wallet(ttl, counter){  
  let data = {};  
  
  /////////////////////////////////////
  function load(){
    console.log('loading wallets...');
    try {
      res = fs.readFileSync(CACHE_FILENAME, {encoding:'utf8', flag:'r'});
      data = JSON.parse(res);      
    }catch(e){
      console.error("load wallets readFileSyc "+e);
      //data = {}; runs over data
    }    
  }
  //sync load first ///////////////////
  //load();

  // redis.on("error", (error)=> {
  //   counter.addError('wallet.redisOnErr');
  //   console.error(`redis client error: ${error}`);
  // });

  /////////////////////////////////////
  function save(){
    console.log('save wallets.json');
    try {
      res = fs.writeFileSync(CACHE_FILENAME, JSON.stringify(data));
    }
    catch(e){
      console.error('writeFileSync wallet'+e);
    }
  }
  
  /////////////////////////////////////
  async function check(addresses, sourceToken){
    // TODO: resume
    console.log("wallets:check temporarely disabled")
    return;

    for( a of addresses ){
      // add address
      if(!data[a]){
        data[a] = {
          blncETH:0,
          tokens:{},
          totalUSD:0,
          totalETH:0,
          totalBTC:0,
          tokenDiversity:0,
          tokenCount:0,
          updated:false,        
        }
        counter.addStat("wallet.newAddress");
        // update newly added wallets only
        //await updateWallet(a);
      }
    }
    // update all expired wallets in batches
    await update();
  }
  /////////////////////////////////////
  // function isUpdated(address){
  //   const w = data[address];
  //   return (w && w.updated);      
  // }  
  // /////////////////////////////////////
  // function isHolding(address, tokenID){
  //   const w = data[address];
  //   if(!w || !w.updated) {
  //     console.error('isHolding, isUpdated should be called first');
  //     counter.addError('wallet.isHolding');
  //     return false;
  //   }
  //   return w.tokens[tokenID] != undefined;
  // }
  function getTokenInfoOf(tokenID, address){
    const w = data[address];
    if(!w){
      console.error(`${address} not found`);
      counter.addError('wallet.addressNotFound');
      return null;
    }

    if(!w.updated) {      
      counter.addStat('wallet.adressNotUpdated');
      return null;
    }
    if(!w.tokens) {      
      counter.addError('wallet.adressHasNoTokens');
      return null;
    }
    return w.tokens[tokenID];
  }
  /////////////////////////////////////
  const fetchParams = {
    method: 'GET',
    headers: {        
      'Accept': 'application/json',
    }
  };
  
  // async function redisGet2(address){
  //   console.log(address);
  //   redis.hgetall(address, (err, res)=>{
  //     return res;
  //   });
  // }
  /////////////////////////////////////
  async function updateWallet(address){
    let wallet = data[address];
    // get from chain
    // let wei = await web3.eth.getBalance(address).catch(err=>{console.error('getBalance '+err)});
    // if (wei){
    //   const blnc = web3.utils.fromWei(wei, 'ether');
    //   if (!isNaN(blnc))
    //     wallet.blncETH =  parseFloat(blnc);
    // }

    // get nonce
    wallet.nonce = await web3.eth.getTransactionCount(address).catch((e)=>{
      console.error(e);
      counter.addError('wallet.nonceFail');
      wallet.nonce = null;
    });      

    // get from REDIS directly first 
    let res = null;
    // if (!SKIP_REDIS){
    //   res = await timeout(1000, redisGet('balnace2:'+address)).catch((error)=>{
    //     console.error(`redis ${error}`);
    //     // might be a timeout error
    //     if(error.message == 'TIMEOUT'){        
    //       counter.addError('wallet.redisTimeout');
    //     }else{        
    //       counter.addError('wallet.redisError');
    //     }        
    //   });
    //   if(!res)
    //     counter.addStat('wallet.redisNoRes');
    // }

    // API ////////////////////////////////////
    if(!res){
      counter.addStat('wallet.apiStart');
      // get wallet from API
      const url = walletAPI + address;
      res = await timeout(3000, fetch(url, fetchParams)).catch(function(error) {
        console.error(`wallet2 ${address} api-error:${error.message}`);
        // might be a timeout error
        if(error.message == 'TIMEOUT'){        
          counter.addError('wallet.apiTimeout');
        }else{        
          counter.addError('wallet.apiError');
        }
      });

      if(!res){
        // no need to measure/print twice
        // console.error(`wallet2 ${address} noRes, didn't update`);
        // counter.addError('wallet.apiNoRes');
        return;
      }
      if(!res.ok){
        console.error(`wallet2 ${address} not-ok, didn't update`);
        counter.addError('wallet.apiNotOK');
        return;
      }
      
      // further parsing
      res = await res.json().catch(e=>console.error('res.json err: '+err));
      if(res.error){                  
        if(res.error.indexOf("X Empty Balance")> -1){
          counter.addStat('wallet.apiZeroBalance');                  
        }
        else{
          console.error(`wallet2 ${address} res-error:${res.error}`);
          counter.addError('wallet.apiResError');
        }        
        return;
      }
      counter.addStat('wallet.apiResOK');
    }
        
    try {     
      //console.log(`wallet2 ${address} UPDATING`);             
      wallet.totalUSD = res.totalUsd || parseFloat(res.TotalUSD);
      wallet.totalETH = res.totalEth || parseFloat(res.TotalETH);
      wallet.totalBTC = res.totalBtc || parseFloat(res.TotalBTC);
      wallet.updated = true;
      wallet.lastUpdate = Date.now();
      // WHats This?
      if (res.TokensSTR){
        res.items = JSON.parse(res.TokensSTR);
      }
      // Mega Holder
      if(wallet.totalBTC > MEGA_HOLDER_BTC){
        console.log(`mega holder BTC: ${parseInt(wallet.totalBTC)}\t${address}`);
        counter.addStat('wallet.newMega');
      }
      if (res.items){
        counter.addStat('wallet.updateHasItems');
        //console.debug(`wallet updated ${address}`);
        wallet.maxDiversity = res.items? Math.max(wallet.tokenDiversity, res.items.length) : 0;
        wallet.curDiversity = res.items.length; // current diversity
        //wallet.tokens = JSON.parse(JSON.stringify(res.items));
        for(let item of res.items){
          if(item.tokenInfo.address)
            wallet.tokens[item.tokenInfo.address] = item;
          else{
            console.error(`update wallet ${address} item.tokenInfo.address is missing`);
            counter.addError('wallet.apiNoTokenInfo');
          }
        }
      }      
    }catch(e){
      console.error(`update wallet ${address} exception: ${e}`);
      counter.addError('wallet.apiException');      
    }    
  }
  /////////////////////////////////////
  function expired(address){
    const w = data[address];
    if(!w.lastUpdate)
      return true;

    return (Date.now() - w.lastUpdate) > ttl;
  }
  /////////////////////////////////////
  async function update(){
    console.log("wallet update start ======================")
    let count = 0;
    let batch = [];
    for(address in data){
      if(expired(address)){
        batch.push(updateWallet(address));
        count++;
      }
      if (batch.length >= WALLET_BATCH_SIZE){
        await Promise.all(batch);
        batch = [];

        if(count && count % 100 === 0)
          console.log(`${count} wallets have been updated`);
      }      
    }
    console.log(`${count}/${Object.keys(data).length} wallets update finished`);

    // ////////////////////////
    // console.log(`Get Balance of ${Object.keys(data).length} wallets Start`);
    // let count = 0;
    // let batch = [];
    // for (address in data){      
    //   if(batch.length < WALLET_BATCH_SIZE) {
    //     count++;
    //     batch.push(updateWallet(address));
    //     counter.addStat("wallet.updateTry");
    //   }
    //   else{
    //     await Promise.all(batch);
    //     batch = [];
    //     if(count % 10 === 0)
    //       console.log(`${count} wallets have been updated`);
    //   }      
    // }
    
    // console.log(`Get Balance End`);
    //save();        
  }
  /////////////////////////////////////
  function appendMetricsOf(addresses, metrics, prefix){
    // lust of balances for stats
    let ETHVal = [];
    let BTCVal = [];
    let USDVal = [];
    let nonce = [];
    // how many token each holder has, for avg calc 
    let maxDiversArr = [];
    let curDiversArr = [];

    let megaHolders = 0;
    for (a of addresses){
      let w = data[a];      
      if (w && w.updated){
        if (w.totalBTC > 0 && w.totalBTC < MEGA_HOLDER_BTC){
          ETHVal.push(w.totalETH);
          BTCVal.push(w.totalBTC);
          USDVal.push(w.totalUSD);          
          maxDiversArr.push(w.maxDiversity);
          curDiversArr.push(w.curDiversity);
          if(w.nonce)
            nonce.push(w.nonce);            
        }else{
          megaHolders++;
        }
      }
    }
        
    appendArrStats("valETH", ETHVal, metrics, prefix);
    appendArrStats("valBTC", BTCVal, metrics, prefix);
    appendArrStats("valUSD", USDVal, metrics, prefix);
    appendArrStats("nonce", nonce, metrics, prefix); // no val.

    //$version.mon.$token.holders.curDiversityAvg
    metrics[prefix+'.holders.'+'maxDiversityAvg'] = maxDiversArr.length? sum(maxDiversArr) / maxDiversArr.length : 0;
    metrics[prefix+'.holders.'+'curDiversityAvg'] = curDiversArr.length? sum(maxDiversArr) / maxDiversArr.length : 0;        
    metrics[prefix+'.holders.'+'megaCount'] = megaHolders;
  }
  /////////////////////////////////////
  function appendArrStats(name, arr, metrics, prefix){
    arr = asc(arr);
    const arrSum = sum(arr);
    const arrAvg = arr.length? arrSum / arr.length : 0;

    //$version.mon.$token.holders.valETH.sum
    prefix = prefix + '.holders.' + name + '.';;    
    metrics[prefix + 'sum'] = arrSum;
    metrics[prefix + 'max'] = arr.length? arr[arr.length-1] : 0;
    metrics[prefix + 'min'] = arr.length? arr[0] : 0;
    metrics[prefix + 'avg'] = arrAvg;
    metrics[prefix + 'p95'] = arr.length? quantile(arr, .95) : 0;
    metrics[prefix + 'med'] = arr.length? quantile(arr, .50) : 0;
    metrics[prefix + 'std'] = arr.length>1? std(arr, arrAvg) : 0;    
  }
  
  /////////////////////////////////////
  return {    
    update: update,
    check:check,
    appendMetricsOf:appendMetricsOf,
    getTokenInfoOf:getTokenInfoOf
  }
}

module.exports = Wallet;

function testBlanaceOfContract(){

}
// TEST
if (require.main === module) {
  const Monitor = require("./monitor");
  const VERSION = "v_" +( process.env.VERSION || "nover") + ".mon.";  
  
  var graphite = require('graphite');
  const grphClient = graphite.createClient(process.env.GRAPHITE);
  const counter = require("./counter")(grphClient);
  
  let wal = Wallet(Monitor(1000), counter);

  const rndAndRich = [
    "m",
    "0xc923dd451dfb1fc6a4608982c6c077414da06a4d",
     "0xbd2f0cd039e0bfcf88901c98c0bfac5ab27566e3",
     "0x61c53d050858a5865201d0ad4d0257fe16340c39"
  ];
  //wal.check(rndAndRich, "XXX");
  //wal.update().then(()=>{
  console.log("wallet.js test start =========");
  wal.check(rndAndRich, "XXX").then(()=>{
  //setTimeout(()=>{
    const prefix = VERSION + "XXX";
    let metrics = {};
    wal.appendMetricsOf(rndAndRich, metrics, prefix);
    console.log(JSON.stringify(metrics,null,2));
  }, 10000);
  //});
  

  // var data = {};
  // for ( var i=0; i < 100; ++i){
  //   data["0x0"+i]= {balance: 
  //     i+1
  //     //Math.floor(Math.random()*100)
  //   };
  // }  
  // let mtrcs = metricsOf2(data);
  // console.log(mtrcs)
}