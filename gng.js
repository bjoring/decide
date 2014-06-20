// Test server
var io = require('socket.io-client');
var socket = io.connect('http://localhost:8000');
var winston = require('winston');
var alsa = require("./alsa")

// set default number for command line argument variables
var block = 1;
var trials = 5;
var stim = {};
var waiting;
var gng_logfile = "gng.log";

var go = {sound: "./musicbox.wav", go:1};
var nogo = {sound: "./musicbox_broken.wav", go: 0};
var device1 = "plughw:1,0";

// print process.argv
process.argv.forEach(function(val, index, array) {
    if (val == "-b") block = array[index+1];
    else if (val == "-t") trials = array[index+1];
    else if (val == "-l") gng_logfile = array[index+1];
});

// Logger setup
var logger = new(winston.Logger)({
	transports: [
	new(winston.transports.File)({
		filename: gng_logfile,
		json: true,
		timestamp: false
	}),
	new(winston.transports.Console)()]
});

logger.on("logging", function(transport, level, msg, meta) {
	if (transport.name == "console") socket.emit('shapeLog', msg);
});


logger.info("Waiting for connection...",{timestamp: timeStamp()});
socket.on('connect', function(socket) {
logger.info('Connected!',{timestamp: timeStamp()});
    
   trialPrep();
});

// Trial counters
var  trialcount = 0;


// hacks to make the inputs work
var leds = {};
leds.ccr = new LED("ccr");
leds.ccg = new LED("ccg");
leds.ccb = new LED("ccb");

leds.rcr = new LED("rcr");
leds.rcg = new LED("rcg");
leds.rcb = new LED("rcb");

leds.lcr = new LED("lcr");
leds.lcg = new LED("lcg");
leds.lcb = new LED("lcb");
hl = new houseLights("hl");

var feeders = {};
feeders.rf = new Feeder("rf");
feeders.lf = new Feeder("lf");

var targetpeck;

socket.on("simulatedPeck", function(peck) {
	if (peck.state == 0) {
		logger.info(peck.name, "detected",{timestamp: timeStamp()});
		if (waiting  == 1 && targetpeck == peck.key) {
			waiting = 0;
			trial();
		}
	}
});

function stimSelect(rand) {
	return rand > 0.5 ? go : nogo;
}

function trialPrep() {
	hl.on(205);

	// decide which stimulus to play and the correct response
	var rand = Math.random();
	stim = stimSelect(rand);

	// wait for center peck
	logger.info('Stimulus selected. Wating for bird to begin trial ' + trialcount,{trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()});
	
	waiting = 1;
	targetpeck = "cp";
}

function trial(){
	trialcount += 1;
	logger.info('Beginning Trial ' + trialcount,{trial:trialcount, stimulus: stim, stimulustype: stim.type, timestamp: timeStamp()});
	alsa.play_sound(stim.sound, device1, function(err, data){
		if (data.playing == 0) trialPrep();
	});
}


//When pecked, raise either the left or right feeder
function block3Feed(x) {
	if (x.value == 1 || x == 1) {
		var rand = Math.random();
		leds.ccg.stopBlink();
		if (rand < 0.5) {
			logger.info('Feeding left',{block:block, trial:trialcount, timestamp: timeStamp()});
			feeders.lf.raise();
			setTimeout(feeders.lf.lower, 3000);
		}
		else {
			logger.info('Feeding right',{block:block, trial:trialcount, timestamp: timeStamp()});
			feeders.rf.raise();
			setTimeout(feeders.rf.lower, 3000);
		}
		setTimeout(checkB3Trials, 3500);
	}
}

//Exit block when desired number of trials is reached
function checkB3Trials() {
	if (trialcount >= block3Trials) {
		block3Exit();
	}
	else block3();
}


function block3Exit() {
	logger.info('Reached  max number of trials for Block 3 (' + block3Trials + ')',{block:block, trial:trialcount, timestamp: timeStamp()});
	logger.info('Ending Block 3' + timeStamp() + '');
	block = 4;
	return block4();
}

function blinkLEDS(led, rate, duration) {
	socket.emit("ledRequest", led, "blink", [rate, duration]);
}

// led object
function LED(object) {
	return {
		on: function() {
			socket.emit("ledRequest", object, "on");
		},
		off: function() {
			socket.emit("ledRequest", object, "off");
		},
		toggle: function() {
			socket.emit("ledRequest", object, "blink");
		},
		stopBlink: function() {
			socket.emit("ledRequest", object, "stopBlink");
		}
	};
}

// house lights object
function houseLights(object) {
  return {
    on: function(brightness) {
        socket.emit("houseRequest", object, "on", brightness);
    },
    off: function() {
        socket.emit("houseRequest", object, "off");
    },
  };
}

// feeder object
function Feeder(object) {
	return {
		raise: function() {
			socket.emit("feedRequest", object, "raise");
		},
		lower: function() {
			socket.emit("feedRequest", object, "lower");
		}
	};
}

function startUp() {
	console.log("\u001B[2J\u001B[0;0f");
	logger.info("-----------------------Starport Go-NoGo Prototype-----------------------");
	blockSelect();
}

function blockSelect() {
		if (block) {
    		if (block < 1 || block > 4) {
    			console.log("Invalid response. There is no block " + answer + ".");
    		}
    		if (block == 1) {
    			return block1();
    		}
    		if (block == 2) {
    			return block2();
    		}
    		if (block == 3) {
    			return block3();
    		}
    		if (answer == 4) {
    			return block4();
    		}
		} 
}

// quick timestamp function
function timeStamp(time) {
	var unixstamp;

	if (time) unixstamp = time;
	else unixstamp = Date.now();

	var utcstamp = new Date(unixstamp);

	return utcstamp.toJSON();

}