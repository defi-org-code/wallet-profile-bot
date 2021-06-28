const {InfluxDB, Point} = require('@influxdata/influxdb-client');
const config = require('./config');

///////////////////////////
function Influx(tags){

  // You can generate a Token from the "Tokens Tab" in the UI
  const token = config.keys.influx_token;
  const org = 'xorbs';
  const bucket = config.influxDB;
  const client = new InfluxDB({url: 'http://35.225.77.88:8086', token: token});
  const writeApi = client.getWriteApi(org, bucket);
  writeApi.useDefaultTags(tags);
 
  function writePoint(name, field, value) {   
    //console.log(name, field, value);
    let point = new Point(name).floatField(field,  value);
    writeApi.writePoint(point)
  }
  function grpht2Points(metrics){
    let points =[];
    for(const m in metrics){
      const nodes = m.split('.');
      
      // TAGS Already given in constructor
      // let tags = {
      //   app: nodes[0],
      //   version: nodes[1],
      //   build: nodes[2],
      // } 

      // from after build till one node before last 
      const point = m.substring(m.indexOf(nodes[3]), m.indexOf(nodes[nodes.length-1])-1);
      const field = nodes[nodes.length-1];
      const value = metrics[m];
      points.push(new Point(point).floatField(field,  value));      
    }
    return points;
  }
  return {
    writePoint:writePoint,
    grpht2Points:grpht2Points,
    writeApi:writeApi
  }
}

module.exports = Influx;