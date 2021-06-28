const {Point} = require('@influxdata/influxdb-client');

///////////////////////////
function Counter(grft, inflx, PREFIX){
  ///////////////////////////
  let metrics = {};
  let points = [];

  ///////////////////////////
  function set(path, val){
    // grafite
    metrics[PREFIX + '.' + path] = val;    
  }
  ///////////////////////////
  function add(prefix, name){
    if (!metrics[prefix + name])
      metrics[prefix + name] = 0;

    metrics[prefix + name] += 1;
  }
  ///////////////////////////
  function addError(name){
    add(PREFIX + ".error.", name);
  }
  ///////////////////////////
  function addStat(name){
    add(PREFIX + ".stat.", name);
  }
  ///////////////////////////
  function sendMetrics(){
    if(Object.keys(metrics).length){
      // graphite
      grft.write(metrics, function(err) {
        // if err is null, your data was sent to graphite!
        if(err)
          console.error("counter send metrics, had error: "+err);        
      });
      // influx
      try{
        //const points = inflx.grpht2Points(metrics);
        // influx
        for(const m in metrics){          
          const nodes = m.split('.');          
          let measurment ='';
          let i=5;
          while(i < nodes.length){
            if(measurment.length){
              measurment += '.';
            }
            measurment += nodes[i++];
          }
          const value = metrics[m];
          points.push(new Point(measurment).
            tag('type', nodes[3]).
            tag('src', nodes[4]).            
            intField("count",  value)
          );
        }
        
        inflx.writeApi.writePoints(points);
      }catch(e){
        console.error("counter influx.writePoints", e);
      }

      // for(const m in metrics){
      //   const nodes = m.split('.');
        
      //   let tags = {
      //     app: nodes[0],
      //     version: nodes[1],
      //     build: nodes[2],
      //   } 
      //   // from after build till one node before last 
      //   const point = m.substring(m.indexOf(nodes[3]), m.indexOf(nodes[nodes.length-1])-1);
      //   const field = nodes[nodes.length-1];
      //   const value = metrics[m];
      //   inflx(point, field, value, tags);
      // }
    }

    // resecounter
    metrics = {};
    points = [];
  }
  ///////////////////////////
  return{
    sendMetrics:sendMetrics,
    addError:addError,
    addStat:addStat,
    set:set
  }
}

module.exports = Counter;