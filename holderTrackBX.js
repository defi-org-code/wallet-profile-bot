const config = require("./config");
const axios = require('axios');
const burnPrefix = '0x00000000000000000000';

/////////////////////////////////////
function HolderTrack(name, contract, createdTS, decimals, counter){
  /////////////////////////////////////
  let holders = null;
  let oldHolders = null;

  const apiUrl = `https://api.bloxy.info/token/token_holders_list?token=TOKEN&limit=5000&key=KEY&format=structure`;
  
  /////////////////////////////////////  
  async function update(latestBlock, dgDecimals){
    // patchy update
    if(!decimals)
      decimals = dgDecimals;

    oldHolders = holders;
    holders = {};

    var mapObj = {
      TOKEN: contract,
      KEY: config.keys.bloxy
    };
    const url = apiUrl.replace(/TOKEN|KEY/g, function(matched){
      return mapObj[matched];
    });
    
    let newHolders = [];    
    //await callApi(url, newHolders);
    try{
      const res = await axios({
        method: 'get',
        url: url,
        timeout: 3000
      });
      if(res.status === 200){
        const oh = oldHolders? Object.keys(oldHolders) : null;

        for (const h of res.data){
          holders[h.address] = h;
          if((!oh || !oh.includes(h.address)) && h.address.substring(0, 22) !== burnPrefix){
            newHolders.push(h.address);
          }
        }
      }else{
        console.error('bloxy holder list', res);
        counter.addError("holderTrackBX.apiStatus_"+res.status);
      }
    }
    catch(e){
      if(e.code === 'ECONNABORTED'){
        counter.addError("holderTrackBX.apiTimeout");
      }
      else{
        counter.addError("holderTrackBX."+e.code);
      }        
      console.error('axios', e);
    }
    
    // extract new holders    
    console.log(`holderTrack ${name}\t${newHolders.length} new holders`);
    return newHolders;
  }
  /////////////////////////////////////
  function count(positive){    
    return get().length;
  }
  /////////////////////////////////////
  function get(){    
    return Object.keys(holders);
  }
  /////////////////////////////////////
  function distribution(){
    if(!count()){    
      console.log(`${t.symbol} holders is empty`);
    }
    
    let dis = {}
    // agg per type
    for( let address in holders ){
      const h = holders[address];
      if( h.address_type){
        if(!dis[h.address_type]){
          dis[h.address_type] = 0;
        }
        dis[h.address_type] += 1;
      }
    }
    return dis;
  }
  /////////////////////////////////////
  function posBalance(){
    let res = 0;
    for (let id in holders){
      if(holders[id])
        res += holders[id].balance;
    }
    return res;
  }
  /////////////////////////////////////
  function balanceArr(){
    let res = [];
    for (let id in holders){
      if(holders[id])
        res.push(holders[id].balance);
    }
    return res;
  }
  /////////////////////////////////////
  return {
    update:update,
    count:count,    
    get:get,
    posBalance:posBalance,
    distribution:distribution,
    balanceArr:balanceArr,
  }
}

module.exports = HolderTrack;

function test() {
}
