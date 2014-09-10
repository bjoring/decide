var util = require("../lib/util")
var argv = require("yargs")
    .usage("Usage: $0 stimset.json")
    .demand(1)
    .argv;

var stimset = new util.StimSet(argv._[0]);

setInterval(function() {
    console.log(stimset.next(true));
}, 500);
