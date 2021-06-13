///////////////////////////
function Counter(client, PREFIX){
  ///////////////////////////
  let metrics = {};
  ///////////////////////////
  function set(path, val){
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
      client.write(metrics, function(err) {
        // if err is null, your data was sent to graphite!
        if(err)
          console.error("counter send metrics, had error: "+err);        
      });  
    }
    // resecounter
    metrics = {}
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