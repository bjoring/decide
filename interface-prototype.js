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
var starstate = {};

setup(starboard);

io.sockets.on('connection', function(socket) {
  // listen to sockets and write analog values to LED's
  socket.on('updateServer', function(data) {
    var change = data[0];
    writeAllStates(data[1]);
    updateClients(change);
  });
});

// prepares the board to read inputs and write outputs
function setup(board) {
  var outpins = [];
  var inpins = [];
  var i = 0;
  var j = 0;

  for (var key in board) {
    if (board[key].type == "led") {
      outpins[i] = board[key].pin_number;
      i++;
    }
    if (board[key].type == "beambreak") {
      inpins[j] = board[key].pin_number;
      j++;
    }
  }

  configLEDS(outpins);
  configBeambreaks(inpins);
  getAllStates(starboard);
}

// configure leds as outputs and set all low
function configLEDS(pins) {
  for (var i = 0; i < pins.length; i++) {
    b.pinMode(pins[i], b.OUTPUT);
    b.digitalWrite(pins[i], 0);
  }
}

// configure beambreak pins as inputs and set interrupt listeners
function configBeambreaks(pins) {
  for (var i = 0; i < pins.length; i++) {
    b.pinMode(pins[i], b.INPUT, 7, 'pullup');
    b.attachInterrupt(pins[i], true, b.CHANGE, function(){
      return updateClients("cp");
    });
  }
}

// updates starboard states into state dictionary
function getAllStates(board){
  for (device in board) {
    getState(device);
  }
}

function getState(device){
  starstate[device] = b.digitalRead(starboard[device].pin_number);
}

// turns the physical leds on or off
function writeAllStates(data) {
  for (var device in data) {
    if (starboard[device].type == "led") {
      writeState(data, device);
    }
  }
}

function writeState(data, device) {
  b.digitalWrite(starboard[device].pin_number, data[device]);
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
  if (req.url == "/starboard") {
    res.writeHead(200, {
      'content-type': 'application/json'
    });
    res.write(JSON.stringify(starboard));
    res.end();
  }
  if (req.url == "/starstate") {
    getAllStates();
    res.writeHead(200, {
      'content-type': 'application/json'
    });
    res.write(JSON.stringify(starstate));
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

function printState(device){
  var statement = "";
  if (starboard[device].type == "led") {
    statement = starstate[device] == 1 ? "on" : "off"
  } else if (starboard[device].type == "beambreak") {
    statement = starstate[device] == 1 ? "beam unbroken" : "beam broken (peck)";
  }
  return statement; 
}

// tells the client the current state
function updateClients(change) {
  getAllStates(starboard);
  io.sockets.emit('updateState', starstate);
  console.log("\nstate updated\n\t" + starboard[change].name+" : "+printState(change));

}