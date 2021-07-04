// add timestamps in front of log messages
require('console-stamp')(console, 'yyyy-mm-dd HH:MM:ss');
const graphite = require('graphite');
const config = require('./config');
const grphClient = graphite.createClient(config.graphiteUrl);

const VERSION = "2_5";
const isProduction = process.env.PRODUCTION==1;
const COUNTER_PREFIX = `walletProfileBot.${VERSION}.${isProduction? 'production':'debug'}`;
const inflx = require("./influx")({
  app:"walletProfileBot",
  version:VERSION,
  build:isProduction? 'production':'debug'
});
const counter = require("./counter")(grphClient, inflx, COUNTER_PREFIX);
const Monitor = require("./monitor");

// upodate every 3cd /opt/graphite/confh - don ttl=6
//const wallets = require("./wallets")(Monitor(1000 * 60 * 60 * 3), counter);
const wallets = require("./wallets")(counter, config);
//fast 
//const wallets = require("./wallets")(Monitor(1000 * 60 * 1));
const tokens = require("./tokens")(COUNTER_PREFIX, Monitor(1000 * 60 * 5), wallets, counter);
const swaps = require("./swaps")(Monitor(1000 * 60 * 5), tokens, counter);
// fast const swaps = require("./swaps")(Monitor(1000 * 30), tokens);


// const tradeRoom = require("./trader")(Monitor(1000 * 60 * 5));
// tradeRoom.load('traderoom.json');

// monitoring
async function next(){
  try {
    // update
    //console.log("+++ +++ +++ interval")

    await swaps.update();
    await tokens.update();

    // update wallet - NON blocking, takes ages
    /*await*/ wallets.update(); 
    wallets.status(true); //send distribution metrics

    // send metrics
    tokens.sendMetrics(grphClient, inflx);
    
    // update traders - and send metrics
    //tradeRoom.update(tokens.data, grphClient);

    // starts and errors
    counter.sendMetrics();
  }
  catch(e){
    counter.addError('main.exception');
    console.error(e);
  }
  // 1 min production -  0.5 min debug
  setTimeout(next, 1000 * (isProduction? 60 : 10 ));  
}

if (require.main === module) {  
  console.log("============== ORBS WALLET PROFILE BOT ==============");
  console.log("VERSION", VERSION);
  console.log("WEB3_PROVIDER", config.network.ETH);
  console.log("GRAPHITE", config.graphiteUrl);
  console.log("MAX_TOKEN_MON", config.maxToken );
  //console.log("WALLET_BATCH_SIZE", process.env.WALLET_BATCH_SIZE);
  console.log("MEGA_HOLDER_BTC", config.megaHolderBTC);
  console.log("=========================================");
  //console.log(JSON.stringify(monkey1.options, null,2));
  console.log("=========================================");

  // start iteration
  next();

  // start server
  const express = require('express')
  const app = express()
  const port = 3001

  app.get('/', (req, res) => {
    res.send('wallet-profile-bot OK!');
  })

  app.get('/token', (req, res) => {
    res.json(tokens.asJson());
  })

  // app.get('/wallet', (req, res) => {
  //   res.send(`
  //     ${wallets.size()} are being monitored
  //     ${wallets.notUpdated()} are notUpdated
  //   `);
  // })

  app.get('/wallet/dump', (req, res) => {
    res.json(wallets.data);
  })

  app.get('/wallet', (req, res) => {
    res.json(wallets.status());
  })

  app.listen(port, () => {
    console.log(`Example app listening at http://0.0.0.0:${port}`);
  })  
}
  