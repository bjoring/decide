// Test server
var io = require('socket.io-client');
var socket = io.connect('http://localhost:8000');
var winston = require('winston');

var block;
var trials;

// print process.argv
process.argv.forEach(function(val, index, array) {
    if (val == "-b") block = array[index+1];
    if (val == "-t") trials = array[index+1];
});

// Logger setup
var logger = new(winston.Logger)({
	transports: [
	new(winston.transports.File)({
		filename: 'shape.log',
		json: false
	}),
	new(winston.transports.Console)()]
});

logger.on("logging", function(transport, level, msg, meta) {
	if (transport.name == "console") socket.emit('shapeLog', msg);
});


logger.info("Waiting for connection...");
socket.on('connect', function(socket) {
	logger.info('Connected!');

	// Run block
	startUp();
});

var b = require('bonescript');

//Set number of trials for each block
var block2Trials = block3Trials = block4Trials = trials;
var blinktimer;

//Trial counters
var block1Count = 0;
var block2Count = 0;
var block3Count = 0;
var block4Count = 0;


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
hl = new LED("hl");

var feeders = {};
feeders.rf = new Feeder("rf");
feeders.lf = new Feeder("lf");

//Console Input
var readline = require('readline');
var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

var targetpeck;

socket.on("simulatedPeck", function(peck) {
	var b
	if (peck.state == 0) {
		logger.info(peck.name, "detected" + timeStamp());
		if (peck.key == targetpeck && targetpeck == "cp") {
			if (block == 1) return block1Exit(1);
			if (block == 2) return block2Feed(1);
			if (block == 3) return block3Feed(1);
			if (block == 4) return block4Flash(1);
		}
		else {
			if (block == 4) {
				if (peck.key == targetpeck && targetpeck == "rp") return block4FeedRight(1);
				if (peck.key == targetpeck && targetpeck == "lp") return block4FeedLeft(1);
			}
		}
	}
});

function block1() {

	hl.on();

	if (block == 1) {
		setTimeout(block1, 10500);
		block1Count += 1;

		logger.info('Beginning Block 1, Trial ' + block1Count + timeStamp());
		socket.emit('tellClients', "block 1 - trial " + block1Count)

		// Look for center peck
		logger.info('Waiting for center peck' + timeStamp());
		targetpeck = "cp";

		// Blink Center LEDS
		leds.ccg.stopBlink();
		blinkLEDS("ccg", 100, 5000);

		// Raise Hopper if LEDS finishes blinking without center peck
		var feedLogDelay = setTimeout(function() {
			logger.info('Feeding bird' + timeStamp());
		}, 5000);
		var feedDelay = setTimeout(feeders.lf.raise, 5000);
		var lowerDelay = setTimeout(feeders.lf.lower, 10000);
	}
	else return block2();
}

function block1Exit(x) {
	if (x.value == 1 || x == 1) {
		block = 2;
		logger.info('Feeding Bird' + timeStamp());
		clearTimeout(block1.feedLogDelay);
		clearTimeout(block1.feedDelay);
		feeders.lf.raise();
		var lowerDelay = setTimeout(feeders.lf.lower, 5000);
		setTimeout(logger.info('Ending Block 1' + timeStamp()), 5000);
		leds.ccg.stopBlink();
	}
}

function block2() {
	hl.on();

	block2Count += 1;
	logger.info('Beginning Block 2, Trial ' + block2Count + ' of ' + block2Trials + timeStamp());

	//Blink center LEDS until center peck
	logger.info('Waiting for center peck...' + timeStamp());
	leds.ccg.stopBlink();
	blinkLEDS("ccg", 100);

	//Feed bird when center peck detected
	targetpeck = "cp";
}

function block2Feed(x) {
	if (x.value == 1 || x == 1) {
		leds.ccg.stopBlink();
		logger.info('Feeding bird', timeStamp());
		feeders.lf.raise();
		setTimeout(feeders.lf.lower, 4000);
		setTimeout(checkB2Trials, 4500);
	}

	function checkB2Trials() {
		if (block2Count >= block2Trials) {
			block2Exit();
		}
		else block2();
	}
}

function block2Exit() {
	logger.info('Reached  max number of trials for Block 2 (' + block2Trials + ')' + timeStamp());
	logger.info('Ending Block 2' + timeStamp() + '');
	block = 3;
	leds.ccg.stopBlink();
	return block3();
}

function block3() {
	hl.on();

	block3Count += 1;
	logger.info('Beginning Block 3, Trial ' + block3Count + ' of ' + block3Trials + timeStamp());

	//Blink center LEDS until center peck
	blinkLEDS("ccg", 100);
	targetpeck = "cp";
	logger.info('Waiting for center peck...' + timeStamp());

}


//When pecked, raise either the left or right feeder
function block3Feed(x) {
	if (x.value == 1 || x == 1) {
		var rand = Math.random();
		leds.ccg.stopBlink();
		if (rand < 0.5) {
			logger.info('Feeding left' + timeStamp());
			feeders.lf.raise();
			setTimeout(feeders.lf.lower, 3000);
		}
		else {
			logger.info('Feeding right' + timeStamp());
			feeders.rf.raise();
			setTimeout(feeders.rf.lower, 3000);
		}
		setTimeout(checkB3Trials, 3500);
	}
}

//Exit block when desired number of trials is reached
function checkB3Trials() {
	if (block3Count >= block3Trials) {
		block3Exit();
	}
	else block3();
}


function block3Exit() {
	logger.info('Reached  max number of trials for Block 3 (' + block3Trials + ')' + timeStamp());
	logger.info('Ending Block 3' + timeStamp() + '');
	block = 4;
	return block4();
}

function block4() {
	hl.on();

	block4Count += 1;
	logger.info('Beginning Block 4, Trial ' + block4Count + ' of ' + block4Trials + timeStamp());

	//Wait for center peck
	logger.info('Waiting for center peck...' + timeStamp());
	targetpeck = "cp";
}

//When pecked, flash either left or right LEDS
//Then, wait for peck on corresponding side

function block4Flash(x) {
	if (x.value == 1 || x == 1) {
		var rand = Math.random();
		//logger.info("Randomly generated number: " + rand);
		if (rand < 0.5) {
			blinkLEDS("lcr", 100);
			targetpeck = "lp";
			logger.info('Waiting for left peck...' + timeStamp());
		}
		else {
			blinkLEDS("rcb", 100);
			targetpeck = "rp";
			logger.info('Waiting for right peck...' + timeStamp());
		}
	}
}

function block4FeedRight(x) {
	if (x.value == 1 || x == 1) {
		leds.rcb.stopBlink();
		feeders.rf.raise();
		logger.info('Feeding bird' + timeStamp());
		setTimeout(feeders.rf.lower, 2500);
		setTimeout(checkB4Trials, 3000);
	}
}

function block4FeedLeft(x) {
	if (x.value == 1 || x == 1) {
		leds.lcr.stopBlink();
		feeders.lf.raise();
		logger.info('Feeding bird' + timeStamp());
		setTimeout(feeders.lf.lower, 2500);
		setTimeout(checkB4Trials, 3000);
	}
}

function checkB4Trials() {
	if (block4Count >= block4Trials) {
		block4Exit();
	}
	else block4();
}

function block4Exit() {
	logger.info('Reached  max number of trials for Block 4 (' + block4Trials + ')' + timeStamp());
	logger.info('Ending Block 4' + timeStamp());
	block = 0;
	logger.info('Shape Finished' + timeStamp());
	logger.info("[Press 'Ctrl+C' to exit]");
	hl.off();
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

function allLEDSOff() {
	leftLEDS.allOff();
	rightLEDS.allOff();
	centerLEDS.allOff();
	hl.off();
}

function startUp() {
	console.log("\u001B[2J\u001B[0;0f");
	logger.info("-----------------------Starport Shape prototype-----------------------");
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
		} else {
		    block = 1;
		    return block1();
		}
}

// quick timestamp function
function timeStamp(time) {
	var unixstamp;

	if (time) unixstamp = time;
	else unixstamp = Date.now();

	var utcstamp = new Date(unixstamp);

	return " - " + utcstamp.toJSON();

}