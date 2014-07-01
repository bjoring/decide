
var io = require('socket.io-client');
var reqc = io.connect("http://localhost:8000/REQ");
var pubc = io.connect("http://localhost:8000/PUB");

reqc.on("connect", function() {
  reqc.emit("hugz", "", console.log);

  reqc.on("msg", function(data, rep) {
    console.log(data);
    if (data.req == "get-state")
      rep({doing: "nothing"});
  });

  reqc.emit("route", "test_client", function(data) {
    console.log(data);
    reqc.emit("msg", {req: "get-state", addr: ""}, console.log)
  });

})
