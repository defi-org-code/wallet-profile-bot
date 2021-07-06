
const { promisify } = require("util");
const redis = require("redis");
const isProduction = process.env.PRODUCTION==1;

const client = redis.createClient({
  url: isProduction? 'http://34.134.236.209:6328' : 'http://localhost:6379',
  db: isProduction?  3 : 0,
  password: isProduction? 'admin@orbs' : ''
});

module.exports = {
  client:client,
  async:{
    keys:promisify(client.keys).bind(client),
    get:promisify(client.get).bind(client),
  }
}