
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
protocol as possible.

The current implementation uses [socket.io](http://socket.io), with a single
bi-directional channel in which messages consist of a string identifying the
message type (whether PUB or REQ) followed by a javascript object `payload`.

### PUB messages

PUB messages payloads much include the following fields:

- `addr`: the address of the *source* of the message
- `time`: a timestamp indicating when the event was created. Value is the number
  of milliseconds since the epoch

Messages may have additional fields depending on the message type. Defined PUB types:

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

REQ messages use an asynchronous asynchronous request-reply pattern. The controller may route some kinds of messages to specfic recipients based on an `addr` field. See next section for more information on addressing.

1. `change-state`: requests a modification to the state of the component
   specified by `addr`. Message must contain a `data` field with updates to the
   state vector. Changes to the state that result from the request must be sent
   via a `state-changed` PUB message.
2. `reset-state`: requests the component specified by `addr` to return to its
   default state if possible. Any data field in the message is ignored. Changes
   to the state that result from the request, however, must be sent via a
   `state-changed` PUB message.
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
   client's socket. For this message type, the `addr` field is ignored. The
   message must contain a `ret_addr` field specifying the requested address for
   the client in the controller's routing table. Only one address may be
   registered for any socket.
7. `unroute`: requests the controller to stop routing REQ messages to the client.
   The broker must map the client's request to the previously requested address.
   The broker must respond with `ok` for success and `err` for
   failure.

For all REQ message types, the recipient must respond with `ok` if the request was received and was properly addressed. Additional data may follow `ok` depending on the message type. If the request was badly formed or referred to an invalid address, the recipient must reply with `err`, followed by a string describing the nature of the problem.

### Controller-Host Communication

The protocol is not only intended to support independent operation of controller computers, but also to allow multiple controllers to be managed by a single host computer.  Use of a host computer allows trial and event data to be aggregated, stored, and monitored centrally, and allows the establishment of a secure gateway to a private network where the controllers operate.

In this scheme, `controller` refers to the embedded computer(s) directly managing the apparatus, and `host` refers to the computer that acts as a gateway and aggregator. The communication protocol between host and controller is essentially the same as between the controller and its other clients, with the following restrictions:

1. The controller initiates communication with the host by opening PUB and REQ
   channels to a well-known endpoint on the host. (For security reasons, this
   endpoint should be only available on the private subnet shared by the host
   and controllers).
2. The controller may send an REQ `route` message in order to register in the
   host's routing table. The address used by the controller in this message must
   be the controller's unqualified hostname.
3. For all routed controllers, the host must forward any REQ messages addressed
   to the controller, first removing the prefix for the controller. Replies from
   the controller must be returned to the sender of the REQ message.
4. For all routed controllers, the host must monitor the status of the
   connection (using a mechanism that depends on the wire protocol). Controllers
   must only be removed from the routing table upon receipt of an `unroute`
   message or after the connection is lost and cannot be reestablished within a
   predefined interval.
5. The address of any PUB messages originating from the controller must be
   prefixed by the controller with its (unqualified) hostname. Controllers are
   not required to send a `route` message prior to emitting PUB messages.

The REQ channel between host and controller is bidirectional. The controller may
emit REQs addressed to other routable clients connected to the host, and the
host may emit REQs, typically forwarded from other clients.  The PUB channel is unidirectional; the host must not forward PUB messages from one client to another.

Depending on the wire protocol, keepalive messages may be used to monitor connection status. If so, these must be sent on the REQ channel using the following message type:

1. `hugz`: a heartbeat message, sent by the controller to the host or vice
   versa. The recepient must respond with `hugz-ok`. (Additional message types
   may be needed for connection management if the wire protocol doesn't support
   automatic reconnection).

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
`right_hopper`.

The address prefix must *removed* by the host from REQ messages sent to controllers, because the host sends those messages over

The host computer adds `box_1` to PUB messages it receives from
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
