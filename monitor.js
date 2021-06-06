/////////////////////////////////////
function Monitor(interval){
  let last = null;  
  /////////////////////////////////////
  function due(){
    if (last === null || Date.now() - last > interval){
      last = Date.now();
      return true;      
    }
    else{
      return false;
    }
  }
  /////////////////////////////////////
  return {
    due: due,
    interval : interval
  }
}

module.exports = Monitor;