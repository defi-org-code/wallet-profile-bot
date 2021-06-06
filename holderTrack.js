const pastEvents = require('./pastEvents');
const burnPrefix = '0x00000000000000000000';

/////////////////////////////////////
function HolderTrack(name, contract, updatedBlock, counter){
  /////////////////////////////////////
  let dict = {};
  let lastTransfers = 0;
  /////////////////////////////////////
  function ensureDictWallet(dict, address, newHolders){
    address = address.toLowerCase();
    if(!dict.hasOwnProperty(address)){
      dict[address] = 0;      
      newHolders.push(address);
    }
    return address;
  }
  /////////////////////////////////////
  function balanceFromTransfer(dict, tx, newHolders){
    const val = parseInt(tx.value);

    // from
    let address;
    if(tx.from.substring(0, 22) !== burnPrefix){
      address = ensureDictWallet(dict, tx.from, newHolders);
      dict[address] -= val;
    }

    // to
    if(tx.to.substring(0, 22) !== burnPrefix){
      address = ensureDictWallet(dict, tx.to, newHolders);
      dict[address] += val;
    }
  }  
  /////////////////////////////////////
  async function update(latestBlock){
    // no need to updaye
    if(updatedBlock >= latestBlock){
      console.log(`no need to update ${name}\tlatest=${latestBlock}`);
      return null;
    }

    counter.addStat("holderTrack.update");
    console.debug(`${name}\tholderTrack:update for: ${latestBlock-updatedBlock} blocks\t${updatedBlock}-${latestBlock}`)  
    let transfers = await pastEvents.getTransfersFromPara(contract, updatedBlock, latestBlock).catch(e=> console.error(e));
    updatedBlock = latestBlock; // ??? needed+ 1

    lastTransfers = 0;
    if(!transfers){
      console.error(`${name} holderTrack.noTransfers`);
      counter.addError('holderTrack.noTransfers');
      return null;
    }
    
    if(!transfers.length){
      console.log(`${name} holderTrack.emptyTransfers`);
      counter.addStat('holderTrack.emptyTransfers');
      return null;
    }

    lastTransfers = transfers.length;
    
    // iterate
    let newHolders = [];
    transfers.forEach( (e)=> {            
      balanceFromTransfer(dict, e.returnValues, newHolders);
    });

    console.log(`holderTrack ${name}\t${newHolders.length} new holders`);
    return newHolders;
  }
  /////////////////////////////////////
  function count(positive){
    let res = 0;
    for (id in dict){
      if((dict[id] > 0) == positive)
        res++;        
    }
    return res;
  }
  /////////////////////////////////////
  function get(){
    let res = [];
    for (id in dict){
      if(dict[id] > 0)
        res.push(id);
    }
    return res;
  }
  /////////////////////////////////////
  function posBalance(){
    let res = 0;
    for (id in dict){
      if(dict[id] > 0)
        res += dict[id];
    }
    return res;
  }
  /////////////////////////////////////
  return {
    update:update,
    count:count,
    lastTransfers:lastTransfers,
    get:get,
    posBalance:posBalance
  }
}

module.exports = HolderTrack;

function test(){
  const bdt = "0x033030feebd93e3178487c35a9c8ca80874353c9"
}