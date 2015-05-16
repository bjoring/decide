
This document specifies the protocols used by the *decide* operant control
software to exchange data among processes and with users via websockets.

-   Editor: Dan Meliza (dan at meliza.org)
-   Version: 1.0
-   State:  draft
-   URL: <http://meliza.org/specifications/decide-ctrl/>

## Goals and framework

Automated operant behavioral experiments involve the following processes:

1. Physical control of operant apparatus, including sound playback for stimulus
   presentation.
2. Sequencing and control of experimental trials. For example, a typical trial
   comprises presentation of one or more stimuli, detection of correct and
   incorrect responses, and provision of positive and negative feedback. In
   addition, trials may be structured into blocks with varying experimental
   conditions.
3. Logging of apparatus state changes, experiment events, and trial data.
4. Interfaces to monitor and manipulate the apparatus and experimental progress,
   including starting and stopping experiments.

In *decide*, these processes are implemented in programs that may be distributed
over multiple computers. The apparatus and experimental control processes run on
small embedded computers that can communicate directly with hardware, and the
user interface runs in a browser. This network architecture requires protocols
for exchanging data between processes.

There are two kinds of information flow in this system. When the state of one
component changes (for example, the animal pecks a key), the other components
need to be notifed, so there are messages that are for broadcast (PUB). In other
cases, one component needs to manipulate the state of another component (for
example, the experiment control program raises a food hopper to provide a
reward), so there needs to be a system for sending requests (REQ) to specific
parts of the system. This protocol describes these messages.

## System architecture

Each embedded computer (`controller`) is connected to an array of physical
devices. The current complement is 9 cue LEDs of various colors, 2 food hoppers,
one high-power LED for lighting, 4 beam break detectors that act like switches
(3 for peck responses and one to detect when a hopper has been raised), and a
stereo sound card. Each controller runs a process (`decide-ctrl`) that provides
a mechanism for clients running on the controller or on other machines to
monitor events and manipulate the apparatus.

In addition, `decide-ctrl` may be configured to connect over a network to a host
computer running a process (`decide-host`) that provides additional services,
including logging, monitoring, and statistical analysis. The protocol for this
communication is described in a separate document at
<http://meliza.org/specifications/decide-host/> connect to this computer to
manipulate and inspect any of the connected controllers.

## Messages

The protocols described here are intended to be as independent of the wire
protocol as possible, but the current implementation uses
[socket.io](http://socket.io), with a single bi-directional channel in which
messages consist of a string identifying the message type (whether PUB or REQ)
followed by a javascript object `payload`.

### PUB messages

PUB messages are sent asynchronously and do not require a response. The payload
must include the following fields:

- `name`: the identifier of the *source* of the message
- `time`: a timestamp indicating when the event was created. Value is the number
  of microseconds since the epoch

Messages may have additional fields depending on the message type. Defined PUB types:

1. `state-changed`: indicates that the internal state of a component has
   changed. The other fields of the message must give the values that changed,
   and only those values.
2. `trial-data`: carries trial data (i.e., experimental data for analysis). The
   other fields in the message must contain the data to be logged. Usually this
   will be stored in a separate file from event data.
3. `log`: emitted for operational messages. The message must contain the field
   `level` with the level of the log message (`error` for fatal errors,
   `warning`, `info`, `debug`), and the field `reason` with a string indicating
   the cause of the logging event.

### REQ messages

REQ messages use an asynchronous request-reply pattern. They differ from PUB messages in two respects: first, the sender of the message should expect a response; second, the messages are addressed *to* specific recipients based on the `name` field. See next section for more information on addressing. Defined REQ types:

1. `change-state`: requests a modification to the state of the component
   specified by `name`. Message must contain fields that specify the components
   of the state to change. Changes to the state that result from the request
   must be sent via a `state-changed` PUB message.
2. `reset-state`: requests the component specified by `name` to return to its
   default state if possible. Changes to the state that result from the request,
   however, must be sent via a `state-changed` PUB message.
3. `get-state`: requests the current value of the state. The response is
   `ok` followed by a nested dictionary giving the state vector(s) of all
   requested components. See below for addressing scheme. This message can be
   used to discover connected components.
4. `get-meta`: requests the addressed component to return its metadata as a
   reply. Metadata may include information about the underlying hardware, which
   is used by some clients to generate an interface. Replies are as for `get-state`.
5. `get-params`: requests the addressed component to return its parameters.
   Replies are as for `get-state`.
6. `route`: requests the controller to start routing REQ messages to the
   client's socket. For this message type, the `name` field specifies the
   requested address for the client in the controller's routing table. Only one
   address may be registered for any socket.
7. `unroute`: requests the controller to stop routing REQ messages to the client.
   The broker must map the client's request to the previously requested address.
   The broker must respond with `ok` for success and `err` for
   failure.

For all REQ message types, the recipient must respond with `ok` if the request was received and was properly addressed. Additional data may follow `ok` depending on the message type. If the request was badly formed or referred to an invalid address, the recipient must reply with `err`, followed by a string describing the nature of the problem.

### Addressing

Every physical and logical component of the system must have a unique address.
Addresses consist of a hierarchical dot-delimited series of keywords, with more
general identifiers on the left.

It's probably easiest to work from examples. Say we have a host computer
connected to one controller called `box_1`, which has two hoppers called
`left_hopper` and `right_hopper`. The full address of the left hopper would be
`box_1.left_hopper`. If a client is connected to the host computer (on the
external port), it will receive PUB messages from `box_1.left_hopper`,
`box_1.right_hopper`, and it can address REQs to those addresses. It can also
address a `get-state` REQ addressed to `box_1`, which might return a nested
structure like this:

```javascript
{
   left_hopper: { feeding: false, hopper: true },
   right_hopper: { feeding: true, hopper: true }
}
```

If the client is directly connected to the controller computer, the addresses
don't have the `box_1` prefix, because `box_1` is the host computer's name for
that controller. Instead, it directly addresses `left_hopper` and
`right_hopper`.

The host must strip the leading hostname from REQ messages addressed to
controllers; in contrast, the controller is responsible for prefixing its
hostname to any PUB messages sent to the host.

### Experiment control

Let's look at how we might control experimental protocols through the broker.
The protocol program (call it `shape`) connects to the broker, sends REQ
messages to manipulate the apparatus and receives PUB messages as the apparatus
changes state. How do external clients communicate with `shape`? One solution is
to have the broker treat `shape` as another component of the system. So when
`shape` sends PUB messages to the broker, they are passed to other clients with
the `shape` address. Similarly, clients can address REQ messages to `shape`.

The full state dict for the broker now looks like this:

```javascript
{
   experiment: { program: "shape" },
   shape: { phase: "feeding" },
   left_hopper: { feeding: true, hopper: true },
   right_hopper: { feeding: false, hopper: true }
}
```

At present, starting and stopping experiment programs must be done through the
shell. Many experiment programs do not support external manipulation of their
state.


## Implementation Notes

The broker should log `change-state` REQs from web clients, so that there's a
record of manual intervention.
