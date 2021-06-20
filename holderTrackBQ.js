const qBalance = `SELECT t.address, CAST((IFNULL(t.sum_to, 0) - IFNULL(f.sum_from,0))/POWER(10,DECIMALS) as FLOAT64) as balance from(
  SELECT 
      to_address as address,    
      sum(safe_cast(value as BIGNUMERIC)) as sum_to,    
  FROM \`bigquery-public-data.crypto_ethereum.token_transfers\`
  WHERE DATE(block_timestamp) > "CREATE_DATE" 
  AND token_address = "TOKEN_ADDRESS" 
  GROUP BY 1) as t
  FULL OUTER JOIN (SELECT 
      from_address as address,    
      sum(safe_cast(value as BIGNUMERIC)) as sum_from,    
      FROM \`bigquery-public-data.crypto_ethereum.token_transfers\`
      WHERE DATE(block_timestamp) > "CREATE_DATE" 
      AND token_address = "TOKEN_ADDRESS" 
      GROUP BY 1) as f 
  ON t.address  = f.address`;

const burnPrefix = '0x00000000000000000000';

const {BigQuery} = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

/////////////////////////////////////
function HolderTrack(name, contract, createdTS, decimals, counter){
  /////////////////////////////////////
  let holders = null;
  let oldHolders = null;
  const createDate = new Date(createdTS*1000)
  let strCreateDate = createDate.toISOString().split("T")[0];
      
  /////////////////////////////////////
  async function update(latestBlock, dgDecimals){
    // patchy update
    if(!decimals)
      decimals = dgDecimals;

    oldHolders = holders;
    holders = {};

    var mapObj = {
      DECIMALS: decimals,
      CREATE_DATE: strCreateDate,      
      TOKEN_ADDRESS: contract,      
    };
    const qFrmtd = qBalance.replace(/DECIMALS|CREATE_DATE|TOKEN_ADDRESS/g, function(matched){
      return mapObj[matched];
    });    

    // Queries the U.S. given names dataset for the state of Texas.

    // const query = `SELECT name
    //   FROM \`bigquery-public-data.usa_names.usa_1910_2013\`
    //   WHERE state = 'TX'
    //   LIMIT 10`;

    // For all options, see https://cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query
    const options = {
      query: qFrmtd,
      // Location must match that of the dataset(s) referenced in the query.
      location: 'US',
    };

    // Run the query as a job
    const [job] = await bigquery.createQueryJob(options);
    console.log(`Job ${job.id} started.`);

    // Wait for the query to finish
    const [rows] = await job.getQueryResults();

    // Print the results
    let newHolders = [];
    rows.forEach(row =>{
      if(row.address && row.balance > 0 && row.address.substring(0, 22) !== burnPrefix){
        holders[row.address] = row.balance;
        if(!oldHolders || row.address in oldHolders)
          newHolders.push(row.address);
      }
    });
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
  function posBalance(){
    let res = 0;
    for (id in holders){
      if(holders[id])
        res += holders[id];
    }
    return res;
  }
  /////////////////////////////////////
  return {
    update:update,
    count:count,    
    get:get,
    posBalance:posBalance
  }
}

module.exports = HolderTrack;

function test() {
  // [START bigquery_query]
  // [START bigquery_client_default_credentials]
  // Import the Google Cloud client library using default credentials
  
  // [END bigquery_client_default_credentials]
  async function query() {
    // Queries the U.S. given names dataset for the state of Texas.

    // const query = `SELECT name
    //   FROM \`bigquery-public-data.usa_names.usa_1910_2013\`
    //   WHERE state = 'TX'
    //   LIMIT 10`;

    // For all options, see https://cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query
    const options = {
      query: qBalance,
      // Location must match that of the dataset(s) referenced in the query.
      location: 'US',
    };

    // Run the query as a job
    const [job] = await bigquery.createQueryJob(options);
    console.log(`Job ${job.id} started.`);

    // Wait for the query to finish
    const [rows] = await job.getQueryResults();

    // Print the results
    console.log('Rows:');
    rows.forEach(row => console.log(row));
  }
  // [END bigquery_query]
  query();
}