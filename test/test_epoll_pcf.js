
var GPIO = require("../lib/gpio");

const _ = require('underscore');
const fs = require('fs');

//const trigfd = fs.openSync('/sys/class/gpio/gpio48/value', 'r');
const keys = {
    "R": fs.openSync('/sys/class/gpio/gpio509/value', 'r'),
    "C": fs.openSync('/sys/class/gpio/gpio510/value', 'r'),
    "L": fs.openSync('/sys/class/gpio/gpio511/value', 'r')
};
const buffer = Buffer.alloc(1);

function check_keys(err, data) {
    _.each(keys, function(value, key) {
        fs.readSync(value, buffer, 0, 1, 0);
        console.log(key, ":", buffer.toString());
    });
};

const trigger = new GPIO(48);
trigger.active_low(1);
trigger.set_edge("rising");

const poller = trigger.new_poller(check_keys)
check_keys();

// Create a new Epoll. The callback is the interrupt handler.
// const poller = new Epoll((err, fd, events) => {
//     // Read GPIO value file. Reading also clears the interrupt.
//     fs.readSync(trigfd, buffer, 0, 1, 0);
//     check_keys();
// });

// // Read the GPIO value file before watching to
// // prevent an initial unauthentic interrupt.
// fs.readSync(trigfd, buffer, 0, 1, 0);
// check_keys();

// // Start watching for interrupts.
// poller.add(trigfd, Epoll.EPOLLPRI);
