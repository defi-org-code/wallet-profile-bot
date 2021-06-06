const fs = require('fs');
const VERSION = "v_" +( process.env.VERSION || "nover") + ".trade";

////////////////////////////////////////////
function Trader(name, options){
  ////////////////////////////////////////////
  let gains = 0;
  let prot = {};
  function test(cond, tokenTn, p){    
    // poolMinSupply
    if (cond.poolMinSupply && tokenTn.pair.totalSupply < cond.poolMinSupply){
      console.log(`TRADE ${tokenTn.symbol} totalSupply < ${cond.poolMinSupply}`);
      return false;
    }
    // poolMaxSupply
    if (cond.poolMaxSupply && tokenTn.pair.totalSupply > cond.poolMaxSupply){
      console.log(`TRADE ${tokenTn.symbol} totalSupply > ${cond.poolMaxSupply}`);
      return false;
    }
    // holdersMin
    if (cond.holdersMin && tokenTn.holders.length < cond.holdersMin){
      console.log(`TRADE ${tokenTn.symbol} holders < ${cond.holdersMin}`);
      return false;
    }
    
    // holdersMax
    if (cond.holdersMax && tokenTn.holders.length > cond.holdersMax){
      console.log(`TRADE ${tokenTn.symbol} holders > ${cond.holdersMax}`);
      return false;
    }

    // loseMax
    if (cond.loseMax && p.gains < cond.loseMax * -1){
      console.log(`TRADE ${tokenTn.symbol} gains < ${cond.loseMax}`);
      return false;
    }

    // GainMax
    if (cond.gainMax && p.gains > cond.gainMax){
      console.log(`TRADE ${tokenTn.symbol} gains < ${cond.gainMax}`);
      return false;
    }

    return true;

  }
  ////////////////////////////////////////////
  function update(tokens, metrics){    
    // Add missing token to protfolio    
    for( let id in tokens){
      // not in protfolio
      if( !prot[id] ){
        let t = tokens[id];
        prot[id] = {
          inside: false,
          gains: 0,
          lastAction: null
        }
      }
    }
    // ENTERS & EXITS on protfolio           
    let curTotGains = 0;

    for( let id in prot){
      let p = prot[id];
      let t = tokens[id];
      // enter
      if(!p.inside){
        if (test(options.enter, t, p)){
          p.inside = true;
          p.lastAction = JSON.parse(JSON.stringify(t));
          // event
          metrics[`${VERSION}.${name}.action.enter.${t.symbol}`] = t.pair.price;
          console.log(`TRADE ENTER\t${name}\t${id}\tprice: ${t.pair.price}`);         
        }
      }
      // calc inside gains
      else{
        // gains
        p.gains = t.pair.price / p.lastAction.pair.price - 1;
        curTotGains += p.gains;

        // metrics
        metrics[`${VERSION}.${name}.inside_price.${t.symbol}`] = t.pair.price;
        metrics[`${VERSION}.${name}.inside_gains.${t.symbol}`] = p.gains;
        //exit - oposit condition on should() ret val
        if (test(options.exit, t, p) === false){
          p.inside = false;
          p.lastAction = JSON.parse(JSON.stringify(t));

          // calc total gain upon exit
          // total gains over time
          gains += p.gains;            
          
          // event
          metrics[`${VERSION}.${name}.action.exit.${t.symbol}`] = t.pair.price;            
          console.log(`TRADE EXIT \t${name}\t${id}\tprice: ${t.pair.price}`);           
        }
      } 
    }
    // total gains this round
    metrics[`${VERSION}.${name}.gains.now`] = curTotGains;
    metrics[`${VERSION}.${name}.gains.ever`] = gains; // calc only uon exit
  }
  ////////////////////////////////////////////
  return{
    update:update,
    options:options
  }
}

////////////////////////////////////////////
function TradeRoom(mon){
  ////////////////////////////////////////////
  traders = {}
  ////////////////////////////////////////////
  function load(fileName){
    console.log('loading traders config');
    fs.readFile(fileName, (err, jsn) => {
      if (err)
        return console.error('readFile', err);

      let obj = JSON.parse(jsn.toString());
      console.log(obj);
      for( let t in obj){
        add(t, obj[t]);
      }
    });
  }
  ////////////////////////////////////////////
  function add(name, options){
    if(traders[name]){
      return console.error(`trader ${name} already exists`);
    }
    traders[name] = new Trader(name, options);
  }
  ////////////////////////////////////////////
  function update(tokens, grphClient){
    // no need to update
    if (!mon.due())      
      return false;

    let metrics = {};    
    // update all traders
    for( let t in traders){
      traders[t].update(tokens, metrics);
    }
    // send graph
    grphClient.write(metrics, Date.now(), function(err) {
      // if err is null, your data was sent to graphite!
      if(err)
        console.error(err);
      else
        console.log(metrics);   
    });    
  }
  ////////////////////////////////////////////
  function remove(name){
    if(trader[name]){
      delete trader[name];
    }

  }
  ////////////////////////////////////////////
  return {
    load:load,
    add:add,
    update:update,
    remove:remove    
  }
}

module.exports = TradeRoom;

// TEST
if (require.main === module) {
  const graphite = require('graphite');
  const Monitor = require("./monitor");
  var grphClient = graphite.createClient(process.env.GRAPHITE);

  grphClient.writeTagged({}, {traderRoom:"started"}, function(err) {
    if(err)
      console.error(err);
  })

  
  let tokens = {
    aaa:{
      symbol:"aaa",
      pairPrice:50,
      pairTotalSupply: 1010,
      holders: new Array(30)
    },
    bbb:{
      symbol:"bbb",
      pairPrice:100,
      pairTotalSupply: 1010,
      holders: new Array(21)
    },
    ccc:{
      symbol:"ccc",
      pairPrice:200,
      pairTotalSupply: 2000,
      holders: new Array(99)
    }
  }

  const interval = 5000;
  const tradeRoom = require("./trader")(Monitor(interval));
  tradeRoom.load('traderoom.json');
  setInterval(()=>{
    // update trader
    tradeRoom.update(tokens, grphClient);
    // update tokens randomly
    for( let id in tokens){
      let t = tokens[id];
      const rnd =  Math.floor(Math.random() * 6) - 2.3;
      for( let p in t){
        if (p === "holders"){
          let l = parseInt(t[p].length + rnd);
          if (l <= 0){
            l = 1;
          }
          t[p] = Array(l);
        }
        else if (p === "symbol"){
          // skip
        }
        else{
          t[p] += rnd; 
        }          
      }
    }    
  },interval);

}