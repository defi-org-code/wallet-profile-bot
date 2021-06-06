// Address of DAI contract
// const daiMainNetAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
// const daiAbi = []
// DAI=new web3.eth.Contract(daiABI, daiMainNetAddress)

const abi = require('erc-20-abi')
let web3 = require('./web3Provider');
 
const BLOCKS_PER_MINUTE = 4;
const BLOCKS_PER_HOUR = BLOCKS_PER_MINUTE * 60;
const BLOCKS_PER_DAY = BLOCKS_PER_HOUR * 24;

// const addrBase =  "0x07150e919b4de5fd6a63de1f9384828396f25fdc";
// const addrSpice = "0x40c190fd64888e55a4206ee10f9d39d744237fe7";
// const addrWrap =  "0x2BE5e4E7711ccC1c665b718AB2D22aA11307638e";
// const addrUniWhale ="0xdbDD6F355A37b94e6C7D32fef548e98A280B8Df5"       

//const myContract = new web3.eth.Contract(abi, addrBase) // BASE
//const myContract = new web3.eth.Contract(abi, addrSpice) // SPICE
//const myContract = new web3.eth.Contract(abi, addrWrap) // BASE
//const myContract = new web3.eth.Contract(abi, addrUniWhale) // UniWhale

const promisify = (inner) =>
    new Promise((resolve, reject) =>
        inner((err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        })
    );

async function getBalance(address) {
  var wei, balance  
  wei = promisify(cb => web3.eth.getBalance(address, cb))
  return new Promise(async (resolve, reject)=>{
    try {
      let balance = web3.utils.fromWei(await wei, 'ether')
      resolve(balance);
      //document.getElementById("output").innerHTML = balance + " ETH";
    } catch (error) {
      reject(error);
      //document.getElementById("output").innerHTML = error;
    }
  });
}


async function getTransfersRange(contract, from , to){  
  console.log(`get past events ${from}-${to} ${contract._address}`);
  return await contract.getPastEvents("Transfer",{                               
      fromBlock: from,     
      toBlock: to // You can also specify 'latest'          
  }).catch((e)=>{
    console.error('web3 getPastEvents err=', e)
  });
}

async function getTransfersFrom(contract, fromBlock, latestBlock, returnOnFirstEvent, returnOnMax){
  let latest = latestBlock? latestBlock : await web3.eth.getBlockNumber();    
  if( latest <= fromBlock ){
    return; //resolve(nil);
  }

  events = [];
  
  let start;// = latest - steps;   
  const steps = parseInt(BLOCKS_PER_DAY / 16);
  do{
    start = Math.max(latest - steps, fromBlock);
    let res = await getTransfersRange(contract, start, latest).catch((e)=>{
      console.error("getTransfersFrom",e);
      return events;
    });
    if (res !== null){
      events = events.concat(res);
      // conditianl return
      if(returnOnFirstEvent)
        return events;
      if(events.length > returnOnMax){
        console.log(`getTransfersFrom Limit ${returnOnMax} Hit`)
        return events;
      }

      
    }
    latest = start;
  }
  while (start > fromBlock);

  return events;  
}

async function getTransfersFromPara(contract, fromBlock, latestBlock, returnOnFirst){
  console.log(`getTransfersFromPara total ${fromBlock}-${latestBlock}`)
  let latest = latestBlock? latestBlock : await web3.eth.getBlockNumber();    
  if( latest <= fromBlock ){
    return; //resolve(nil);
  }

  //console.time("getTransfersFromPara");

  events = [];
  
  let start = fromBlock;
  const batchSize = 16;
  let batches = [];
  let batch;
  const steps = parseInt(BLOCKS_PER_DAY/16);
  let count = 0;
  let batchStart;
  let end ;
  while (start < latestBlock){    
    batchStart = start;
    for (let i=0; i < batchSize && start < latestBlock; ++i){
      end = Math.min(start + steps, latestBlock);
      //console.log(`getTransfersFromPara ${start}-${end}`)
      batches.push(contract.getPastEvents("Transfer",{                               
        fromBlock: start,     
        toBlock: end // You can also specify 'latest'          
      }));
      start = end;// probably not useful+1;
    }
    let res = await Promise.all(batches).catch((e)=>{
      console.error("getTransfersFromPara Promise.all",e);
      return events;
    });
    // CLEAR!
    batches = [];
    console.log(`getTransfersFromPara aprox day batchDone ${batchStart}-${end}`);
    if (res !== null){
      for(let arr of res)
        if(arr.length){
          events = events.concat(arr);
          if(returnOnFirst)
            return events;
        }
    }    
  }

  //console.timeEnd("getTransfersFromPara");
  
  return events;  
}

async function getTransfersOnce(contract, fromBlock, latestBlock){
    
  console.time("getTransfersOnce");

  events = [];
  
  console.log(`getTransfersFromOnce ${fromBlock}-${latestBlock}`)
  const res = await contract.getPastEvents("Transfer",{      
    kushk:[10,100],                         
    fromBlock: 0,     
    toBlock: "latest" // You can also specify 'latest'          
  });

  console.timeEnd("getTransfersOnce");
  
  return res;  
}

async function get_creation_oldest_block(address, left, right, step) {
  let code;
  let hasCode;
  do {    
    code = await web3.eth.getCode(address, right).catch(e=> console.log("code not found: "+ e));
    if (code == undefined)
      return hasCode;

    hasCode = right;
    right -= step;
    console.debug(`${right} get_creation_oldest_block`);

  }while (right  > left); 

  return null;
}
////////////////////////////////////////////////////////////////////////////
async function get_creation_block_within(address, days) {
  var right = await web3.eth.getBlockNumber();
  var left = right - BLOCKS_PER_DAY * days;

  // check if had existed before days
  code = await web3.eth.getCode(address, left).catch(e=> console.log("code not found: "+ e));
  if (code !== undefined)
    return -1;
  
  console.debug(`${right} get_creation_block_within`);
  right = await get_creation_oldest_block(address, left, right, BLOCKS_PER_DAY);
  console.debug(`${right} get_creation_block_within`);
  right = await get_creation_oldest_block(address, left, right, BLOCKS_PER_HOUR);  
  console.debug(`${right} get_creation_block_within`);
  right = await get_creation_oldest_block(address, left, right, BLOCKS_PER_MINUTE);
  console.debug(`${right} get_creation_block_within`);    
  return right;  
}
////////////////////////////////////////////////////////////////////////////
async function search_contract_cretion_block(contract_address, since) {
  var highest_block = await web3.eth.getBlockNumber();
  var lowest_block = since? highest_block - since : 0;

  var contract_code = await web3.eth.getCode(contract_address, highest_block);
  if (contract_code == "0x") {
      console.error("Contract " + contract_address + " does not exist!");
      return -1;
  }

  while (lowest_block <= highest_block) {
      let search_block = parseInt((lowest_block + highest_block) / 2)
      contract_code = await web3.eth.getCode(contract_address, search_block).catch(e=> console.error(e));

      //console.log(highest_block, lowest_block, search_block, contract_code);

      if (contract_code != undefined) {
          highest_block = search_block;
      } else if (contract_code == undefined) {
          lowest_block = search_block;
      }

      if (highest_block == lowest_block + 1) {
          return highest_block;
      }
  }

}

async function test(){
  //let evs = await myContract.getPastEvents("Transfer",  {filter: {value: [117,50]}}, {fromBlock:0, toBlock:"latest"});
  //let evs = await myContract.getPastEvents("Transfer", {fromBlock:0, toBlock:"latest"});

  // get receipt
  // web3.eth.getTransactionReceipt("0x8a99bd9b0734e16721d8624d69851436a24289efded3a7965ecaae5f6440e3d3").then((rec, b)=>{
  //   console.log(rec);
  // });

  // requires full node

  //const twoDays = BLOCKS_PER_DAY * 2 ;
  const twoWeeks = BLOCKS_PER_DAY * 5 ;
  // lastTwoWeeks = 6700 * 14 ;
  
  // console.log(res);
  // return;
  const mtmx =  "0xa5978a61a90ae7217c60c7b275343ce244a053cc";
  const based = "0x68A118Ef45063051Eac49c7e647CE5Ace48a68a5";
  const univ2 = "0xbf7045f6ea651abb04e96cba61adabe6d7bf0ee8";
  const gfarm2 ="0x831091da075665168e01898c6dac004a867f1e1b"

  // get latests block
  console.time("test");
  let latest = await web3.eth.getBlockNumber();

  // test overlapping
  const ctrct = new web3.eth.Contract(abi, univ2); 

  // creation block test 
  const month = BLOCKS_PER_DAY * 14 ;
  //let res = await search_contract_cretion_block(gfarm2, month);
  let res = await get_creation_block_within(univ2, 20);
  if(res == -1)
    console.log(`contract is too old`);  
  else
    console.log(`gfarm2 creation block aprox minute ${res}`);

  
    //let evs = await getTransfersOnce(ctrct,0, latest);
  let evs = await getTransfersFromPara(ctrct,latest-twoWeeks, latest);
  console.timeEnd("test");  
  var blocks = {}
  evs.forEach( (e)=>{
     console.log(`${e.blockNumber}\t${e.logIndex}\t${e.transactionIndex}`)
  });
  
  // const cb = await search_contract_cretion_block(address);
  // console.log(cb);

  // let evs = await getTransfersFrom(wrp, latest - twoDays);//, twoDays, twoWeeks);  
  // console.log(`got ${evs.length} events`);

  //let evs = await myContract.getPastEvents("Transfer", {from:0, to:"latest"})
  let addresses = []
  //console.log(evs[0]);
  evs.forEach( e=> addresses.push(e.returnValues.to));
  // evs.forEach( e=>
  //   console.log(e);
  //   addresses.push();
  // })
  addresses = Array.from(new Set(addresses));
  console.log(`${evs.length} events\tfrom ${addresses.length} addresses`);

  // addresses.forEach(e=>{
  //   //let blnc = myContract.methods.balanceOf(e)
  //   // let  blnc =  web3.eth.getBalance(e); //Will give value in.
  //   // let bigNumber = web3.toBigNumber(blnc);
  //   // blnc = web3.fromWei(bigNumber)
  //   //blnc = web3.utils.toDecimal(blnc);
  //   //blnc.then((ret)=>{ console.log(ret)});
  //   let blnc = await getBalance(e);
  //   console.log(e,blnc);
  // }); 

  await Promise.all(addresses.map(async (e) => {
    let blnc = await getBalance(e);
    console.log(`${e}\t${blnc}`);
  }));
  console.log("DONE");
}

// test
if (require.main === module) {
  test();
}

// const addr=  "0x2BE5e4E7711ccC1c665b718AB2D22aA11307638e";

// const wrp = new web3.eth.Contract(abi, "0x2be5e4e7711ccc1c665b718ab2d22aa11307638e") // WRAP
// const block = 	11430386;
// wrp.getPastEvents("Transfer",
// {                               
//   fromBlock: block-1,     
//   toBlock: block+1 // You can also specify 'latest'
// }).then((res)=>{
//   console.log(res);
// });

module.exports.getTransfersFrom = getTransfersFrom;
module.exports.getTransfersFromPara = getTransfersFromPara;
module.exports.getTransfersOnce = getTransfersOnce;

//module.exports.getTransfersRange = getTransfersRange;
//module.exports.BLOCKS_PER_DAY = BLOCKS_PER_DAY;