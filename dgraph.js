const fetch = require("node-fetch");

async function call(q)
{
  try {
      let res = await fetch('https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ query: q})
      })
      return await res.json();
  } catch (error) {
      console.log("callGraph", error);
  }
}

module.exports.call = call;