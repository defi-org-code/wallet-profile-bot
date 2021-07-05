
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
  // for delete when update from server
  const knownFields = ['lastUpdate','address'];
    
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
    //console.log('start updateWallet', address);
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
      timeout: config.walletTimeout    // seconds timeout      
    })
    .then(res => {
      if (res.status === 200){
        // if(!res.data){
        //   console.log('no data')
        // }
        //console.log(res.data);
        if (!res.data.miss){
          // handle the response
          for (let field in res.data){
            if(!res.data[field]){
              counter.addError('wallet.null_'+field);
              // kills the disk??? console.error(`null value in field ${field}\tfor ${address}`);
            }          
            // update field
            wallet[field] = res.data[field]? res.data[field] : -1;          
          }
          // remove fields that were not updated
          const curFields = Object.keys(wallet);
          const datFields= Object.keys(res.data);
          for( let field of curFields ){
            // if new data doesnt include old field, or new data has null for existing field
            if( !knownFields.includes(field) &&( !datFields.includes(field) || !res.data[field] )){
              // remove field
              delete wallet[field];
              counter.addStat('wallet.del_'+field);
            }          
          }
          //console.log('end   updateWallet success', address);

          counter.addStat('wallet.apiResOK');
          wallet.lastUpdate = Date.now();
        }
        else{
          wallet.miss = true;
          counter.addStat('wallet.apiResMiss');
        }
      }
      else{
        //console.log('end   updateWallet status:', res.status, address);
        counter.addError("wallet.apiStatus_"+res.status)
      }
    })
    .catch(error => {
      console.log('end updateWallet error:', error.code, address);
      if(error.code ){
        if(error.code === 'ECONNABORTED')
          counter.addError("wallet.apiTimeout");
        else
          counter.addError("wallet."+error.code);
      }else{
        counter.addError("wallet.unknown");
        console.error('axios no code-', error);
      }
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
        //counter.addStat("wallet.expired");
      }
      // else{
      //   counter.addStat("wallet.up2date");

      // }
    }
    if(!arr.length){
      working = false;
      console.log("all wallets are up tp date")
      //counter.addStat("wallet.noExpired");
      return;
    }

    console.log(`wallet.updateAll start - ${arr.length}/${Object.keys(data).length} are expired =========================`)

    counter.addStat("wallet.updateAll");
    await executeBatch(arr, 0);

    // add count for each status
    const stat = status();
    console.log(stat);
    
    working = false;
    console.log(`wallet.updateAll end ${Object.keys(data).length}  =========================`);
  }  
  /////////////////////////////////////
  async function executeBatch(arr, start){    
    
    // create promise batch
    let batch = [];    
    let indx = start;

    for(let i=0; i < config.walletBatchSize && indx < arr.length; i++, indx++){      
      //console.log(arr[indx])
      batch.push(updateWallet(arr[indx]));      
    }
    //console.log(`wallet execute batch ${start}-${indx}\t/ ${arr.length}`);
    
    // block execution
    //console.log("* promiseAll before: " + batch.length);
    if(batch.length){
      await Promise.all(batch);
    }
    //console.log("* promiseAll after");
    
    counter.addStat('wallet.executeBatch');
    if(indx && indx % 1000 === 0){
      console.log(`${indx}/${arr.length} wallets have been called for with 200 OK`);
    }
    
    // stop condition
    if (indx >= arr.length){
      console.log(`${indx}/${arr.length} wallets update finished stop condition!`);      
      return;
    }

    
    await executeBatch(arr, indx);
        
    // console.log(`Get Balance End`);
    //save();        
  }
  /////////////////////////////////////
  // return dist of statuses
  function status(count){
    let stat={
      pending:0,
      neverUpdated:0,      
      expired:0,
      updated:0
    }
    // reset stat so zero is sent as well
    if(count){
      counter.set('wallet.pending',0);
      counter.set('wallet.neverUpdated',0);
      counter.set('wallet.wallet.expired',0);
      counter.set('wallet.updated',0);
    }

    // collect 
    for(address in data){
      const w = data[address];
      // pending (has to be first)
      if (w.miss === true){
        if(count) counter.addStat('wallet.pending');
        stat.pending += 1;
      }
      // never updated
      else if(w.lastUpdate === null){
        if(count) counter.addStat('wallet.neverUpdated');
        stat.neverUpdated += 1;
      }
      // expired
      else if(expired(address)){
        if(count) counter.addStat('wallet.expired');
        stat.expired += 1;
      }
      else{
        if(count) counter.addStat('wallet.updated');
        stat.updated += 1;
      }
    }
    return stat
  }
  /////////////////////////////////////
  function appendMetricsOf(addresses, metrics, point, prefix){
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
    // add dynamic arrays
    for (let field in arrs){
      let arr = arrs[field];
      if(arr.length){
        appendArrStats(field, arr, metrics, point, prefix);
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
  function nrmlFloat(f){
    if(isNaN(f)){
      return -1;
    }

    return parseFloat(f.toFixed(8));
  }
  /////////////////////////////////////
  function appendArrStats(name, arr, metrics, point, prefix){
    arr = asc(arr);
    const arrSum = sum(arr);
    const arrAvg = arr.length? (arrSum / arr.length) : 0;

    //$version.mon.$token.holders.valETH.sum
    prefix = prefix + '.holders.' + name + '.';
    metrics[prefix + 'sum'] = nrmlFloat(arrSum,2);
    metrics[prefix + 'max'] = nrmlFloat(arr.length? arr[arr.length-1] : 0);
    metrics[prefix + 'min'] = nrmlFloat(arr.length? arr[0] : 0);
    metrics[prefix + 'avg'] = nrmlFloat(arrAvg);
    metrics[prefix + 'p95'] = nrmlFloat(arr.length? quantile(arr, .95) : 0);
    metrics[prefix + 'med'] = nrmlFloat(arr.length? quantile(arr, .50) : 0);
    metrics[prefix + 'std'] = nrmlFloat(arr.length>1? std(arr, arrAvg) : 0);

    // influx
    point.floatField(name+"_sum",  metrics[prefix + 'sum']);
    point.floatField(name+"_max",  metrics[prefix + 'max']);
    point.floatField(name+"_min",  metrics[prefix + 'min']);
    point.floatField(name+"_avg",  metrics[prefix + 'avg']);
    point.floatField(name+"_p95",  metrics[prefix + 'p95']);
    point.floatField(name+"_med",  metrics[prefix + 'med']);
    point.floatField(name+"_std",  metrics[prefix + 'std']);
  }
  
  /////////////////////////////////////
  return {    
    update: update,
    check:check,
    appendArrStats:appendArrStats,
    appendMetricsOf:appendMetricsOf,
    size:function(){return Object.keys(data).length;},
    data:data,
    status:status
    //getTokenInfoOf:getTokenInfoOf
  }
}

module.exports = Wallet;

// TEST
function testBlanaceOfContract(){
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
      wal.appendMetricsOf(rndAndRich, metrics, null, prefix);
      console.log(JSON.stringify(metrics,null,2));
    }, 10000);
    //});
  }
    

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