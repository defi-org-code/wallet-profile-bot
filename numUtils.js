const asc = arr => arr.sort((a, b) => a - b);
const sum = arr => arr.reduce((a, b) => a + b, 0);
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
    while( f.toString().indexOf('+') > -1 ){
      f /= 10;
    }

    return parseFloat(f.toFixed(8));
  },
  asc: asc,
  quantile: (arr, q) => {
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