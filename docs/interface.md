# Decide Web Interface
						
## Introduction

This simple interface is for an apparatus using a Beaglebone Black and the 
Starboard cape. It provides the user with a basic GUI through which to monitor
and interact with the apparatus.

It is designed such that, at a glance, a user is able to see what state the 
apparatus is in (e.g. which LEDS are on). The interface also allows the user 
to turn the apparatus' outputs on or off and simulate inputs to the apparatus 
using a mouse.

Multiple web clients may use the interface at once with the current state of the
apparatus synced across all clients.

## Accessing the Interface

To start the server from the terminal:

		node apparatus.js

The program will log when the server has started and provide an IP address and 
port through which to access the interface. If the Beaglebone is connected to 
the internet, any device may access the interface through this IP address. 

To access the interface, navigate to the given address with a web browser. 

## Using the Interface

The inerface consists of colored rectangles that represent each of the 
apparatus' inputs and outputs. 

The colored squares in the middle of the interface represent apparatus' LEDS. To 
turn on an LED, simply click its square. The square will then change from a dull 
to bright color, indicating that it is on. 

The rectangles above eadch group of three LED rectangles represents the actual 
color visible with that set of LEDS. For example, if the red and green LEDS for 
a single group are on, the rectangle above them will be yellow.

The two bar at the bottom of the interface represents the apparatus' 
IR beam-break detector circuit. Whenever the IR beam is broken, such as by a 
bird's peck, the bar will flash salmon. To simulate a peck, click the bar 
itself.
