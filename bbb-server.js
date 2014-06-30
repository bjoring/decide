// this is the broker process for the controller

var fs = require("fs");
var express = require("express");
var winston = require("winston"); // logger
var apparatus = require("./lib/apparatus");
var util = require("./lib/util");

// Log pub and req events at info level. TODO disable after debugging?
winston.levels['pub'] = 3
winston.levels['req'] = 3

var app = require("express")();
var server = require("http").Server(app);

function controller(params) {

  var meta = {
    type: "controller"
  };

  var par = {
    port: 8000
  };
  util.update(par, params);

  var io = require("socket.io")(server);

  var state = {
    online: false,
    ip_address: null,
    protocol: null
  };
  server.listen(par.port, function() {
    state.online = true;
    state.ip_address = server.address();
    winston.info("server listening on", server.address());
  })

  var pubc = io.of("/PUB");
  var reqc = io.of("/REQ");

  // these methods are called by the apparatus module
  this.pub = function(msg) {
    // forward to connected clients
    pubc.emit("msg", msg);
  };

  // no requests expected from apparatus
  this.req = function(msg) {};

  // forward pub to connected clients and apparatus components
  pubc.on("connection", function(socket) {
    winston.info("connection on PUB:", socket.handshake.address)
    socket.on("msg", function(msg) {
      apparatus.pub(msg);
      socket.broadcast.emit("msg", msg);
    });

    socket.on("disconnect", function() {
      winston.info("disconnect on PUB:", socket.handshake.address)
    })
  });

  // route req to apparatus
  reqc.on("connection", function(socket) {
    winston.info("connection on REQ:", socket.handshake.address)
    socket.on("msg", function(msg) {
      winston.debug("REQ from client:", msg)
      apparatus.req(msg);
    });
    // TODO allow clients to register for reqs
    socket.on("disconnect", function() {
      winston.info("disconnect on REQ:", socket.handshake.address)
    })
  })

}

// TODO be smarter about this if run as script
var params = {};
if (process.argv.length > 3) {
  var buf = fs.readFileSync(process.argv[2]);
  params = JSON.parse(buf);
}

// handle http requests from clients
app.get("/", function(req, res) {
  res.sendfile(__dirname + "/static/interface.html");
});

app.get("/state", function(req, res) {
  res.send(apparatus.req({ req: "get-state", addr: ""}));
});

app.get("/components", function(req, res) {
  res.send(apparatus.req({ req: "get-meta", addr: ""}));
});

// all other static content resides in /static
app.use("/static", express.static(__dirname + "/static"));


// initialize the apparatus
apparatus.init(params)

// start the broker
apparatus.register("controller", new controller(params.controller))

