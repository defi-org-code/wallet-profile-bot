const fetch = require("node-fetch");
const config = require("./config");
const domain = 'https://api.ethplorer.io'
const qAddressInfo = `${domain}/getAddressInfo/{ADDRESS}/?apiKey=${config.keys.ethplorer}`

/////////////////////////////////////////////
async function getAddressInfo(address){
  try {
    const url = qAddressInfo.replace('{ADDRESS}', address); // coma sep tokens
    //console.log(url);    
    let res = await fetch(url, {
      method: 'GET',
      headers: {        
        'Accept': 'application/json',
      }//,
      //body: JSON.stringify({ key: ""})
    })
    return res.json();
  } catch (error) {
    console.error("ethplorer::getAddressInfo", error);
  }
}

module.exports.getAddressInfo = getAddressInfo;

if (require.main === module) {
  getAddressInfo("0xff71cb760666ab06aa73f34995b42dd4b85ea07b", 600).then((res)=>{
    console.log(res);
  });  
}