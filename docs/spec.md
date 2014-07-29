
This document specifies the protocols used by the *decide* operant control
software.

-   Editor: Dan Meliza (dan at meliza.org)
-   Version: 1.0
-   State:  draft
-   URL: <http://meliza.org/specifications/decide>

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
4. Automated monitoring of systems and animal behavior over long time windows to
   ensure adequate food access.
5. Interfaces to monitor and manipulate the apparatus and experimental progress,
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
example, the experiment control program needs to raise a food hopper to provide
a reward), so there needs to be a system for sending requests (REQ) to specific
parts of the system. In turn, clients need a method for discovering addresses.
’
## System and network architecture

Each embedded computer is connected to an array of physical devices. The current
complement is 9 cue LEDs of various colors, 2 food hoppers, one high-power LED
for lighting, 4 beam break detectors that act like switches (3 for peck
responses and one to detect when a hopper has been raised), and a stereo sound
card. Each BBB can run one operant protocol that runs an experiment by
manipulating these components. External clients can connect via HTTP to
manipulate and inspect the state of the apparatus and the running protocol.

In addition, the BBBs can be connected to a network with a host computer that
provides logging, monitoring, and aggregation for the connected BBBs. External
clients can connect to this computer to manipulate and inspect any of the
connected BBBs.

A process runs on each BBB and the host computer that acts as a broker for PUB
and REQ messages. Other processes may run on any of these computers, but should
connect to the local broker to send or receive messages.

## Messages

The protocols described here are intended to be as independent of the wire
protocol as possible. The current implementation uses websockets, but it should
be possible to send the messages on other wire protocols. Some wire protocols
(e.g., zeromq) may take care of addressing, and may implement PUB and REQ using
separate sockets of different types. Under websockets, the PUB and REQ channels
are separated using namespaces.

All messages must be sent as serialized JSON.

### PUB messages

Messages sent over the PUB channel must have the following fields:

- `event`: a string identifying the event type
- `addr`: the address of the *source* of the message
- `time`: a timestamp indicating when the event was created. Value is the number
  of milliseconds since the epoch

Messages may have additional fields depending on the `event` value. Defined PUB types:

1. `state-changed`: indicates that the internal state of a component has
   changed. The message must contain a `data` field whose value is a dictionary
   giving the values that changed (and only those values). This message type is
   also used to indicate when certain clients connect and disconnect.
2. `trial-data`: carries trial data (i.e., experimental data for analysis). The
   message must contain a `data` field with the data to be logged. Usually this
   will be stored in a separate file from event data.
3. `log`: emitted for operational messages. The message must contain the field
   `level` with the level of the log message (`error` for fatal errors,
   `warning`, `info`, `debug`), and the field `reason` with a string indicating
   the cause of the logging event.

### REQ messages

Messages sent over the REQ channel are directed to specific recipients.
Communication is asynchronous, and recipients may send responses. REQ messages
must have the following fields:

- `req`: string indicating the type of request
- `addr`: the address of the *target* of the message

Messages may have additional fields depending on the `req` field. Defined REQ types:

1. `change-state`: requests a modification to the state of the component
   specified by `addr`. Message must contain a data field with updates to the
   state vector. The recipient will respond with `req-err` if there was a
   problem with the request, and `req-ok` if not. Changes to the state that
   result from the request, however, must be sent via a `state-changed` PUB
   message.
2. `get-state`: requests the current value of the state. The response is
   `req-ok` followed by a nested dictionary giving the state vector(s) of all
   requested components. See below for addressing scheme. This message can be
   used to discover connected components. Reply is `req-err` for bad requests.
3. `get-meta`: requests the addressed component to return its metadata as a
   reply. Metadata may include information about the underlying hardware, which
   is used by some clients to generate an interface. Replies are as for `get-state`.
4. `get-params`: requests the addressed component to return its parameters.
   Replies are as for `get-state`.
5. `route`: requests the broker to route REQ messages to the client's socket.
   The message must contain a field `return-addr`, which is the requested
   address for the client in the broker's routing table. The broker must respond
   with `route-ok` to indicate success, or `route-err` to indicate an error.
6. `unroute`: requests the broker to remove the client from the routing table.
   The message must contain a field `return-addr`, which is the previously
   requested address for the client in the broker's routing table. The broker
   must respond with `unroute-ok` for success and `unroute-err` for failure.
5. `hugz`: a heartbeat message, sent by the controller to the server or vice
   versa. The recepient must respond with `hugz-ok`. (Additional message types
   may be needed for connection management if the wire protocol doesn't support
   automatic reconnection).

TODO: address in reply?

### Addressing

Every physical and logical component of the system must have a unique address.
Addresses consist of a hierarchical dot-delimited series of keywords, with more
general identifiers on the left.

It's probably easiest to work from examples. Say we have a host computer
connected to one controller called `box_1`, which has two hoppers called
`left_hopper` and `right_hopper`. The full address of the left hopper would be
`box_1.left_hopper`. If a client is connected to the host computer, it will
receive PUB messages from `box_1.left_hopper`, `box_1.right_hopper`, and it can
address REQs to those addresses. It can also address a `get-state` REQ addressed
to `box_1`, which might return a nested structure like this:

```javascript
{
   left_hopper: { feeding: false, hopper: true },
   right_hopper: { feeding: true, hopper: true }
}
```

If the client is directly connected to the controller computer, the addresses
don't have the `box_1` prefix, because `box_1` is the host computer's name for
that controller. Instead, it directly addresses `left_hopper` and
`right_hopper`. The host computer adds `box_1` to PUB messages it receives from
the controller, and strips `box_1` from REQ messages addressed to the
controller.

### Experiment control

Let's look at how we might control experimental protocols through the broker.
The protocol program (call it `shape`) connects to the broker, sends REQ
messages to manipulate the apparatus and receives PUB messages as the apparatus
changes state. How do external clients communicate with `shape`? One solution is
to have the broker treat `shape` as another component of the system. So when
`shape` sends PUB messages to the broker, they are passed to other clients with
the `shape` address. Similarly, clients can address REQ messages to `shape`.

What about starting and stopping protocols? Let's add a component to the broker
for that, called `experiment`. Its state is the currently running experiment, so
clients can tell the broker to start and stop experiments by modifying the
state.

The full state dict for the broker now looks like this:

```javascript
{
   experiment: { program: "shape" },
   shape: { phase: "feeding" },
   left_hopper: { feeding: true, hopper: true },
   right_hopper: { feeding: false, hopper: true }
}
```

## States and state machines (in progress)

Each state machine's state is represented as a mapping (i.e., a composite of
named variables). For example, the apparatus state might be represented as:

```json
{
  "time": 1403736696.24122,
  "cue_left": 0,
  "cue_right": 1,
  "cue_center": 0,
  "key_left": 0,
  "key_center": 0,
  "key_right": 0,
  "hopper_left": 0,
  "hopper_right": 0,
  "lights": 100
}
```

Keys should be descriptive strings. The `time` key is reserved, but optional (as
time is not strictly part of the state space).

Values can be scalars or strings. Strings may be part of an implicit
enumeration, but this is specified elsewhere. Arrays and mappings are
discouraged as they complicate processing. Fields may be missing (for example,
if they depend on the value of some other field).

Some state machines are more abstract, representing a stage in a paradigm. For
example, in a gng experiment, this state might represent the inter-trial interval:

```json
{
   "epoch": "inter-trial",
   "correction": false
}
```

And this state the post-response interval:

```json
{
   "epoch": "consequating",
   "reward": true,
   "hopper": left,
   "duration": 4
}
```

Note that fields that depend on the value of `epoch` are omitted when
irrelevant. Omitted fields have an implicit value of null.

## State space descriptors (in progress)

In addition, state machines may provide information about the state space they
occupy. Should probably be a specification for this, but nothing too fancy.
Something similar to the state vector itself:

```json
{
   "cue_left": {
      "values": [0, 1],
      "direction": "out",
      "type": "led"
    },
    "key_left": {
       "values": [0, 1],
       "direction": "in",
       "type": "switch"
    }
}
```

Probably the only required field for each element is `values`. If the options
are discrete and finite this should be an array. Floats and strings could be
specified by a string naming the type. Any further than this and we start
getting meta. Other fields are purely advisory.

## Implementation Notes

The broker should log `change-state` REQs from web clients, so that there's a
record of manual intervention.

Normal operation for a controller connected to a host is to forward all PUB
messages for logging on the host. If controller dies, host should notify a
human. If host dies, controller needs to start saving log messages.

### websockets

Under websockets, messages consist of a string followed by some data. All PUB messages use "msg" as their identifying string, as do all REQ messages except for the following: `route`, `unroute`, and `hugz`. These messages are sent on the REQ channel, but are not routed to specific components.

