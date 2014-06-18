// Create websocket with socket.io
var app = require('http').createServer(handler);
var io = require('socket.io').listen(app);
var fs = require('fs');
var b = require('./bonescript-lite')
var winston = require('winston');
var favicon = require('serve-favicon');
var _favicon = favicon('favicon.ico');

var port = 8000;
app.listen(port);


// Setup the logger
var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.File)({ filename: 'apparatus.log', json:false }),
      new(winston.transports.Console)()
    ]
});

logger.on("logging", function (transport, level, msg, meta) {
    if (transport.name == "file") io.sockets.emit('appLog', msg);
  });

// Set the starboard model
var all_starboards = require("./dummyboard-bl.json");
var starboard = all_starboards["00a1"];
var starstate = {};
var leds = {};
var feeders = {};

var blinktimer;

setup(starboard);
getAllStates(starboard);

logger.info('Server running on: http://' + getIPAddress() + ':' + port);

io.sockets.on('connection', function(socket) {
  
  socket.on('shapeLog', function(msg) {
    io.sockets.emit('shapeLog',msg);  
  });

  
  socket.on('updateServer', function(timestamp, data) {
    var change = data;
    var requestTime = timestamp;

    logger.info("client request - " + starboard[change.key].name + " : " + printState(change) + timeStamp(requestTime));
    changeState(change);
  });

  socket.on('simulatePeck', function(timestamp, data) {
    var change = data;
    var requestTime = timestamp;

    starstate[change.key] = change.state;

    logger.info("client request: simulate " + starboard[change.key].name + timeStamp(requestTime) );

    var updatestamp = Date.now();
    io.sockets.emit('updateState', starstate);
    io.sockets.emit('simulatedPeck', change);
    logger.info(starboard[change.key].name,"simulated" + timeStamp(updatestamp));
    
    starstate[change.key] = 1;
  });

  socket.on('stateQuery', function() {
    updateClients();
  });
  
  socket.on("ledRequest", function(led, request, blinkparam) {
    !blinkparam ? leds[led][request]() : blinkLED(leds[led], blinkparam[0], blinkparam[1]);
  });
  
  socket.on("feedRequest", function(feeder, request) {
    feeders[feeder][request]();
  });
});

// prepares the board to read inputs and write outputs
function setup(board) {
    for (var key in board) {
    if (board[key].type == "led" || board[key].type == "houselights") leds[key] = new LED(starboard[key]);
    if (board[key].type == "feed") feeders[key] = new Feeder(starboard[key]);
    if (board[key].type == "beambreak") starstate[key] = 1;
  }
}

b.gpio_monitor("event1", function(err, data){
  var timestamp = Date.now();
  var device;
  
  if (data.key == 2) device = 'lp';
  else if (data.key == 3) device = 'cp';
  else if (data.key == 4) device = 'rp';

  var change = {"key": device, "state":data.value, "name":starboard[device].name};
  starstate[device] = change.state;
  updateClients(change, Date.now());
  io.sockets.emit('simulatedPeck', change);
});

// updates starboard states into state dictionary
function getAllStates(board) {
  for (var device in board) {
    if (starboard[device].io == "output") getState(device);
  }
}

function getState(device, callback) {
  b.led_read(starboard[device].id,function(err, data){
    starstate[device] = data.value;
    var timestamp = Date.now();
    if(callback) {
      callback(timestamp);
    } 
  });
}

// turns the physical leds on or off
function writeAllStates(data) {
  for (var device in data) {
    if (starboard[device].io == "output") {
      writeState(device, data[device]);
    }
  }
}

function writeState(device, data) {
  b.led_write(starboard[device].id, data);
}

// combines writeState and getState and updates client
function changeState(change) {
  writeState(change.key, change.state);
  getState(change.key, function(time){
    updateClients(change, time);
  });
  
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

function printState(device) {
  var statement = "";
  if (starboard[device.key].io == "output") {
    statement = device.state == 1 ? "on" : "off";
  }
  else if (starboard[device.key].type == "beambreak") {
    statement = device.state == 0 ? "beam broken (peck)" : "beam unbroken";
  }
  return statement;
}

// tells the client the current state
function updateClients(change, updatestamp) {
  io.sockets.emit('updateState', starstate);
  if (change && updatestamp && !change.surpress) {
    logger.info("state updated - " + starboard[change.key].name + " : " + printState(change) + timeStamp(updatestamp));
  }

}

// porting shape
// led object
function LED(object) {
  var pin = object.pin_name;
  var togglestate = 0;
  var key = object.key;

  return {
    key: key,
    on: function() {
      changeState({
        "key": object.key,
        "state": 1
      });
    },
    off: function() {
      changeState({
        "key": object.key,
        "state": 0
      });
    },
    toggle: function() {
      togglestate = togglestate ? 0 : 1;
      changeState({
        "key": object.key,
        "state": togglestate,
        "surpress": true
      });
    },
    stopBlink: function() {
      clearInterval(blinktimer);
      changeState({
        "key": object.key,
        "state": 0
      });
    }
  };
}

function blinkLED(led, rate, duration) {
  clearInterval(blinktimer);
  blinktimer = setInterval(led.toggle, rate);
  if (duration > 0) setTimeout(led.stopBlink, duration);
  logger.info("blinking",starboard[led.key].name,"every",rate+"ms" + timeStamp());
}

// feeder object
function Feeder(object) {
  return {
    raise: function() {
      changeState({
        "key": object.key,
        "state": 1
      });
    },
    lower: function() {
      changeState({
        "key": object.key,
        "state": 0
      });
    }
  };
}

// quick timestamp function
function timeStamp(time) {
  var unixstamp;
  
  if (time) unixstamp = time;
  else unixstamp = Date.now();
  
  var utcstamp = new Date(unixstamp);
  
  return " - " + utcstamp.toJSON();
  
}