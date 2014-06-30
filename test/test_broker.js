
var winston = require("winston");
var br = require("../lib/apparatus");

// log pub and req events at info level
winston.levels['pub'] = 3
winston.levels['req'] = 3

br.init();

var x = br.req({
  req: "get-state",
  addr: ""
});

console.log(x);
