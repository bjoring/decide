/* 
shapeclient.js 
	This script starts a "shape" operant conditioning
	paradigm with the goal of conditioning a bird to
	peck the center key when it wants food. All 
	interaction with Starboard is handled through 
	apparatus.js.

	To run the script:
		node shapeclient.js
	
	Procedure:
		...
		Session ends when the lights go out for the day.
*/


// Test server
var io = require('socket.io-client');
var socket = io.connect('http://localhost:8000');
var winston = require('winston');

// set default number for command line argument variables
var block = 1;
var trials = 5;
var shape_logfile = "shape.log";

var suncheck = 60000; // how often to check the sun's position
var daytime; // flag for whether it is day 

// print process.argv
process.argv.forEach(function(val, index, array) {
	if (val == "-b") block = array[index+1];
	else if (val == "-t") trials = array[index+1];
	else if (val == "-l") shape_logfile = array[index+1];
});

// Logger setup
var logger = new(winston.Logger)({
	transports: [
	new(winston.transports.File)({
		filename: shape_logfile,
		json: true,
		timestamp: false
	}),
	new(winston.transports.Console)()]
});

logger.on("logging", function(transport, level, msg, meta) {
	if (transport.name == "console") socket.emit('shapeLog', msg, meta);
});


logger.info("Waiting for connection...",{timestamp: timeStamp()});
socket.on('connect', function(socket) {
logger.info('Connected!',{timestamp: timeStamp()});
	
	startUp();
});


//Set number of trials for each block
var block2Trials = block3Trials = block4Trials = trials;

//Trial counters
var block1Count = block2Count = block3Count = block4Count = 0;


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
	if (peck.state === 0) {
		logger.info(peck.name, "detected",{timestamp: timeStamp()});
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

	if (block == 1) {
		setTimeout(block1, 10500);
		block1Count += 1;

		logger.info('Beginning Block 1, Trial ' + block1Count, {block:block, trial:block1Count, timestamp: timeStamp()});

		// Look for center peck
		logger.info('Waiting for center peck', {block:block, trial:block1Count, timestamp: timeStamp()});
		targetpeck = "cp";

		// Blink Center LEDS
		leds.ccg.stopBlink();
		blinkLEDS("ccg", 100, 5000);

		// Raise Hopper if LEDS finishes blinking without center peck
		var feedLogDelay = setTimeout(function() {
			logger.info('Feeding bird', {block:block, trial:block1Count, timestamp: timeStamp()});
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
		setTimeout(logger.info('Ending Block 1', {block:block, trial:block1Count, timestamp: timeStamp()}));
		leds.ccg.stopBlink();
	}
}

function block2() {
	hl.on(155);

	block2Count += 1;
	logger.info('Beginning Block 2, Trial ' + block2Count + ' of ' + block2Trials, {block:block, trial:block2Count, timestamp: timeStamp()});

	//Blink center LEDS until center peck
	logger.info('Waiting for center peck...',{block:block, trial:block2Count, timestamp: timeStamp()});
	leds.ccg.stopBlink();
	blinkLEDS("ccg", 100);

	//Feed bird when center peck detected
	targetpeck = "cp";
}

function block2Feed(x) {
	if (x.value == 1 || x == 1) {
		leds.ccg.stopBlink();
		logger.info('Feeding bird', {block:block, trial:block2Count, timestamp: timeStamp()});
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
	logger.info('Reached  max number of trials for Block 2 (' + block2Trials + ')',{block:block, trial:block2Count, timestamp: timeStamp()});
	logger.info('Ending Block 2',{block:block, trial:block2Count, timestamp: timeStamp()});
	block = 3;
	leds.ccg.stopBlink();
	return block3();
}

function block3() {
	hl.on(205);

	block3Count += 1;
	logger.info('Beginning Block 3, Trial ' + block3Count + ' of ' + block3Trials,{block:block, trial:block3Count, timestamp: timeStamp()});

	//Blink center LEDS until center peck
	blinkLEDS("ccg", 100);
	targetpeck = "cp";
	logger.info('Waiting for center peck...',{block:block, trial:block3Count, timestamp: timeStamp()});

}


//When pecked, raise either the left or right feeder
function block3Feed(x) {
	if (x.value == 1 || x == 1) {
		var rand = Math.random();
		leds.ccg.stopBlink();
		if (rand < 0.5) {
			logger.info('Feeding left',{block:block, trial:block3Count, timestamp: timeStamp()});
			feeders.lf.raise();
			setTimeout(feeders.lf.lower, 3000);
		}
		else {
			logger.info('Feeding right',{block:block, trial:block3Count, timestamp: timeStamp()});
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
	logger.info('Reached  max number of trials for Block 3 (' + block3Trials + ')',{block:block, trial:block3Count, timestamp: timeStamp()});
	logger.info('Ending Block 3' + timeStamp() + '');
	block = 4;
	return block4();
}

function block4() {
	hl.on(255);

	block4Count += 1;
	logger.info('Beginning Block 4, Trial ' + block4Count + ' of ' + block4Trials,{block:block, trial:block4Count, timestamp: timeStamp()});

	//Wait for center peck
	logger.info('Waiting for center peck...',{block:block, trial:block4Count, timestamp: timeStamp()});
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
			logger.info('Waiting for left peck...',{block:block, trial:block4Count, timestamp: timeStamp()});
		}
		else {
			blinkLEDS("rcb", 100);
			targetpeck = "rp";
			logger.info('Waiting for right peck...',{block:block, trial:block4Count, timestamp: timeStamp()});
		}
	}
}

function block4FeedRight(x) {
	if (x.value == 1 || x == 1) {
		leds.rcb.stopBlink();
		feeders.rf.raise();
		logger.info('Feeding bird',{block:block, trial:block4Count, timestamp: timeStamp()});
		setTimeout(feeders.rf.lower, 2500);
		setTimeout(checkB4Trials, 3000);
	}
}

function block4FeedLeft(x) {
	if (x.value == 1 || x == 1) {
		leds.lcr.stopBlink();
		feeders.lf.raise();
		logger.info('Feeding bird',{block:block, trial:block4Count, timestamp: timeStamp()});
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
	logger.info('Reached  max number of trials for Block 4 (' + block4Trials + ')',{block:block, trial:block4Count, timestamp: timeStamp()});
	logger.info('Ending Block 4',{block:block, trial:block4Count, timestamp: timeStamp()});
	block = 0;
	logger.info('Shape Finished',{block:block, trial:block4Count, timestamp: timeStamp()});
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

// Checks the sun's position
function sunSimulator(){
	socket.emit("simulatesun");
} // sunSimulator

// Checks the sun's position every suncheck miliseconds
function getSunLoop(){
	setTimeout(function(){
		sunSimulator();
		getSunLoop();
	}, suncheck); // setTimeout
} // getSunLoop

// Handles information about the sun's positon
socket.on("sunstatus", function(brightness) {
	if (brightness <= 0) {
		daytime = 0;
		logger.info('Sun has set. Putting gngclient to sleep.', {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
	} else if (brightness >= 0 && !daytime) {
		daytime = 1;
		logger.info('Sun has risen. Starting trials.', {trial:trialcount, stimulus: stim.sound, stimulustype: stim.type, timestamp: timeStamp()});
		trialPrep();
	} // else if
}); // socket.on


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
	logger.info("-----------------------Starport Shape prototype-----------------------");
	blockSelect();
}

function blockSelect() {
		if (block) {
			if (block < 1 || block > 4) {
				console.log("Invalid response. There is no block",block);
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
			if (block == 4) {
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