
const fs = require('fs');
const axios = require('axios');
const { count } = require('console');
const CACHE_FILENAME = './cache/wallets.json';
const isProduction = process.env.PRODUCTION==1;

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
function Wallet(counter, config){  
  let data = {};  
  let working = false;
  let knownFields = ['lastUpdate','address'];
  
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
    for( a of addresses ){
      // limit addresses in debug    
      if (!isProduction && Object.keys(data).length > 1000){
        return ;
      }

      // add address
      if(!data[a]){
        data[a] = {
          lastUpdate:null          
        }
        // DEBUG
        if (!isProduction){
          data[a].address = a;
        }
        counter.addStat("wallet.newAddress");
        // update newly added wallets only
        //await updateWallet(a);
      }
    }
    // update all expired wallets in batches
    /*await*/ update();
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
  // function getTokenInfoOf(tokenID, address){
  //   const w = data[address];
  //   if(!w){
  //     console.error(`${address} not found`);
  //     counter.addError('wallet.addressNotFound');
  //     return null;
  //   }

  //   if(!w.updated) {      
  //     counter.addStat('wallet.adressNotUpdated');
  //     return null;
  //   }
  //   if(!w.tokens) {      
  //     counter.addError('wallet.adressHasNoTokens');
  //     return null;
  //   }
  //   return w.tokens[tokenID];
  // }
  ///////////////////////////////////// 
  // async function redisGet2(address){
  //   console.log(address);
  //   redis.hgetall(address, (err, res)=>{
  //     return res;
  //   });
  // }
  /////////////////////////////////////
  function updateWallet(address){
    counter.addStat('wallet.update');
    let wallet = data[address];
    // get nonce TODO: resume
    // wallet.nonce = await web3.eth.getTransactionCount(address).catch((e)=>{
    //   console.error(e);
    //   counter.addError('wallet.nonceFail');
    //   wallet.nonce = null;
    // });
    // doron score
    return axios({
      method: 'get',
      url: 'http://34.134.236.209:3000/wallet/' + address,
      //url: 'http://34.134.236.209:3000/test1',
      timeout: config.walletTimeout * 1000    // seconds timeout      
    })
    .then(res => {
      if (res.status === 200){
        /* handle the response */
        for (field in res.data){
          if(!res.data[field]){
            counter.addError('wallet.null_'+field);
            // kills the disk??? console.error(`null value in field ${field}\tfor ${address}`);
          }
          else{
            counter.addStat('wallet.apiResOK');
            wallet.lastUpdate = Date.now();                        
            //console.log("+++++++++ wallet updated 200");
          }
          wallet[field] = res.data[field]? res.data[field] : -1;        
        }
      }
      else{
        counter.addError("wallet.apiStatus_"+res.status)
      }
    })
    .catch(error => {
      if(error.code === 'ECONNABORTED')
        counter.addError("wallet.apiTimeout");
      else
        counter.addError("wallet."+error.code);
        
      console.error('axios', error);
    });    
  }
 

  /////////////////////////////////////
  function expired(address){
    const w = data[address];
    if(!w.lastUpdate)
      return true;

    const diff =( Date.now() - w.lastUpdate ) / 1000;
    if(diff > config.walletSecondsTTL)
      console.log('diff ttl', diff, config.walletSecondsTTL);

    return diff > config.walletSecondsTTL;
  }
  /////////////////////////////////////
  async function update(){
    if(working){
      counter.addStat("wallet.updateReEnter");
      return ;
    }
    working= true;       
    let arr = []
    
    // collect expired
    for(address in data){
      if(expired(address)){
        arr.push(address);
        counter.addStat("wallet.expired");
      }
      else{
        counter.addStat("wallet.up2date");

      }
    }
    if(!arr.length){
      working = false;
      console.log("all wallets are up tp date")
      counter.addStat("wallet.noExpired");
      return;
    }

    console.log(`wallet.updateAll start - ${arr.length}/${Object.keys(data).length} are expired =========================`)

    counter.addStat("wallet.updateAll");
    await executeBatch(arr, 0);

    
    working = false;
    console.log(`wallet.updateAll end ${Object.keys(data).length}  =========================`)
  }  
  /////////////////////////////////////
  async function executeBatch(arr, count){    
    console.log(`wallet execute batch ${count}/${arr.length}`);
    // create promise batch
    let batch = [];
    let i = 0;
    for( i=0; i < config.walletBatchSize && count < arr.length; ++i){
      batch.push(await updateWallet(arr[i]));
      //batch.push(await testAsync());
      
      count++;
    }
    
    // block execution
    //console.log("* promiseAll before: " + batch.length);
    await Promise.all(batch);
    //console.log("* promiseAll after");
    
    counter.addStat('wallet.executeBatch');
    if(count && count % 100 === 0){
      console.log(`${count}/${arr.length} wallets have been updated`);
    }
    
    // stop condition
    if (count >= arr.length){
      console.log(`${count}/${arr.length} wallets update finished stop condition!`);      
      return;
    }

    
    await executeBatch(arr, count);
    

 
    
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
    // how many token each holder has, for avg calc 
    // let maxDiversArr = [];
    // let curDiversArr = [];
    let arrs = {};

    let megaHolders = 0;
    for (a of addresses){
      let w = data[a];      
      if (w && w.lastUpdate){
        for (field in w){
          if(typeof w[field] === 'number' && knownFields.indexOf(field) == -1 ){
            let arr = arrs[field];
            if(!arr)
              arr = arrs[field] = [];
            if(w[field] && w[field] != -1)
              arr.push(w[field]);
          }
        }        
      }
    }

    for (let field in arrs){
      let arr = arrs[field];
      if(arr.length){
        appendArrStats(field, arr, metrics, prefix);
      }
    }
        
    // appendArrStats("valETH", ETHVal, metrics, prefix);
    // appendArrStats("valBTC", BTCVal, metrics, prefix);
    // appendArrStats("valUSD", USDVal, metrics, prefix);
    // appendArrStats("nonce", nonce, metrics, prefix); // no val.

    //$version.mon.$token.holders.curDiversityAvg
    // metrics[prefix+'.holders.'+'maxDiversityAvg'] = maxDiversArr.length? sum(maxDiversArr) / maxDiversArr.length : 0;
    // metrics[prefix+'.holders.'+'curDiversityAvg'] = curDiversArr.length? sum(maxDiversArr) / maxDiversArr.length : 0;        
    // metrics[prefix+'.holders.'+'megaCount'] = megaHolders;
  }
  /////////////////////////////////////
  function appendArrStats(name, arr, metrics, prefix){
    arr = asc(arr);
    const arrSum = sum(arr);
    const arrAvg = arr.length? (arrSum / arr.length) : 0;

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
    appendMetricsOf:appendMetricsOf
    //getTokenInfoOf:getTokenInfoOf
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