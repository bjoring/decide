// Create websocket with socket.io
var app = require('http').createServer(handler);
var io = require('socket.io').listen(app);
var fs = require('fs');
var b = require('bonescript');
var favicon = require('serve-favicon');
var _favicon = favicon('favicon.ico');

var port = 8000;
app.listen(port);

console.log('Server running on: http://' + getIPAddress() + ':' + port);

// Set the starboard model
var starboard = require("./starboard01.json");

// Initialize LEDS
var LEFT_RED, LEFT_GRN, LEFT_BLU;
var CENT_RED, CENT_GRN, CENT_BLU; 
var RGHT_RED, RGHT_GRN, RGHT_BLU;

// Initialize beambreaks
var CENT_PECK;

setup(starboard);

io.sockets.on('connection', function(socket) {
  // listen to sockets and write analog values to LED's
  socket.on('updateServer', function(data) {
    writeAllStates(data);
    updateClients();
  });
});

function setup(board) {
  LEFT_RED = board.lcr.pin_number;
  LEFT_GRN = board.lcg.pin_number;
  LEFT_BLU = board.lcb.pin_number;
  
  CENT_RED = board.ccr.pin_number;
  CENT_GRN = board.ccg.pin_number;
  CENT_BLU = board.ccb.pin_number;
  
  RGHT_RED = board.rcr.pin_number;
  RGHT_GRN = board.rcg.pin_number;
  RGHT_BLU = board.rcb.pin_number;
  
  var outpins = [LEFT_RED, LEFT_GRN, LEFT_BLU, CENT_RED, CENT_GRN, CENT_BLU, RGHT_RED, RGHT_GRN, RGHT_BLU];
  configOutput(outpins);
  
  CENT_PECK = board.cp.pin_number;
  
  b.pinMode(CENT_PECK, b.INPUT, 7, 'pullup');
  b.attachInterrupt(CENT_PECK, true, b.CHANGE, updateClients);
}

function updateClients() {
  readAllStates();
  io.sockets.emit('updateState', starboard);
  console.log("State updated");
}

// turns the physical leds on or off
function writeAllStates(data) {

  writeState(data.lcr, LEFT_RED);
  writeState(data.lcg, LEFT_GRN);
  writeState(data.lcb, LEFT_BLU);
  
  writeState(data.ccr, CENT_RED);
  writeState(data.ccg, CENT_GRN);
  writeState(data.ccb, CENT_BLU);
  
  writeState(data.rcr, RGHT_RED);
  writeState(data.rcg, RGHT_GRN);
  writeState(data.rcb, RGHT_BLU);
}

function writeState(device, port) {
  b.digitalWrite(port, device.state);
}

// sets the LED states
function readAllStates() {
  readState(starboard.lcr, LEFT_RED);
  readState(starboard.lcb, LEFT_BLU);
  readState(starboard.lcg, LEFT_GRN);
  
  readState(starboard.ccr, CENT_RED);
  readState(starboard.ccg, CENT_GRN);
  readState(starboard.ccb, CENT_BLU);

  readState(starboard.rcr, RGHT_RED);
  readState(starboard.rcb, RGHT_BLU);
  readState(starboard.rcg, RGHT_GRN);
  
  readState(starboard.cp, CENT_PECK);
}

// reads the LED states
function readState(device, port) {
  device.state = b.digitalRead(port);
  if (device.type == "led") {
    if (device.state == 0) device.abstract_state = "off";
    else device.abstract_state = "on";
  }
  else if (device.type == "beambreak") {
    if (device.state == 1) device.abstract_state = "nopeck";
    else device.abstract_state = "peck";
  }
}

// configure pins as outputs and set all low
function configOutput(pins) {
  for (i = 0; i < pins.length; i++) {
    b.pinMode(pins[i], b.OUTPUT);
    b.digitalWrite(pins[i], 0);
  }
}

// the handler
function handler(req, res) {
  if (req.url == "/favicon.ico") { // handle requests for favico.ico
    _favicon(req, res, function onNext(err) {
    if (err) {
      res.statusCode = 500;
      res.end();
      return;
    }
  });
  }
  if (req.url == "/starboard_json"){
    res.writeHead(200, { 'content-type': 'application/json'});
    res.write(JSON.stringify(starboard));
    res.end();
  }
  fs.readFile('interface-prototype.html', // load html file
  function(err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }
    res.writeHead(200);
    res.end(data);
  });
  readAllStates();
  setTimeout(function() {
    io.sockets.emit('updateState', starboard);
  }, 1000);
}

// get server IP address on LAN
function getIPAddress() {
  var interfaces = require('os').networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];
    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) return alias.address;
    }
  }
  return '0.0.0.0';
}