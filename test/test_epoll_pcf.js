
var GPIO = require("../lib/gpio");

const _ = require('underscore');
const fs = require('fs');

const keys = {
    "R": new GPIO(509),
    "C": new GPIO(510),
    "L": new GPIO(511)
};
const buffer = Buffer.alloc(1);

function check_keys(err, data) {
    _.each(keys, function(gpio, key) {
        gpio.read((err, state) => {
            console.log(key, ":", state);
        })
    });
};

const trigger = new GPIO(48);
trigger.active_low(1);

const poller = trigger.new_poller("rising", check_keys)
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
