const asc = arr => arr.sort((a, b) => a - b);
const sum = arr => arr.reduce((a, b) => a + b, 0);
const maxVal64 = parseInt("0x7FFFFFFFFFFFFFFF");
/////////////////////////////////////
module.exports = {
  nrmlFloat: function(f){    
    if(typeof f == "undefined" || typeof f == null ){
      console.log('ntmlFloat got undefined/null');
      return -1;
    }

    if(isNaN(f)){
      return -1;
    }    
    // scale down    
    while( f.toString().indexOf('e+') > -1 || Math.abs(f) > maxVal64){
      f /= 10;
    }
    // scale up
    while( f.toString().indexOf('e-') > -1 ){
      f *= 10;
    }
    
    return f;
    //return parseFloat(f.toFixed(8));
  },
  nrmlInt: function(i){    
    if(typeof i == "undefined" || typeof i == null ){
      console.log('ntmlInt got undefined/null');
      return -1;
    }
    if(isNaN(i)){
      return -1;
    }
    // scale down    
    while( i.toString().indexOf('e+') > -1 || Math.abs(i) > maxVal64){
      i /= 10;
    }
    // scale up
    while( i.toString().indexOf('e-') > -1 ){
      i *= 10;
    }
    return i;    
  },
  asc: asc,
  quantile: (arr, q) =>{
    const sorted = asc(arr);    
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
        return sorted[base];
    }
  },
  sum: sum,
  std: (arr, mu) => {  
    const diffArr = arr.map(a => (a - mu) ** 2);
    return Math.sqrt(sum(diffArr) / (arr.length - 1));
  }
};