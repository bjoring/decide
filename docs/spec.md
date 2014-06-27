
This document specifies the protocols used by the *decide* operant control
software.

-   Editor: Dan Meliza (dan at meliza.org)
-   Version: 1.0
-   State:  draft
-   URL: <http://meliza.org/specifications/decide>

*decide* is implemented as a set of finite state machines that communicate via events. This architecture provides a scalable mechanism for building complex experimental paradigms from simple components.

## Events

State machines communicate by emitting events, data structures that communicate changes in the state and/or instruct other state machines to change state. Events are implemented as mappings. The following fields are required:

- `id`: a string or keyword that identifies the type of event
- `source`: a string or keyword that indicates the source of the event
- `time`: a unix timestamp indicating when the event was created

Events may have any number of additional fields containing data about the event.
In the event descriptions below, these fields are collectively referred to as
the payload. When events are transmitted within a process, use whatever
structure is appropriate to the host language (e.g., Python dictionary,
Javascript object, Clojure map). Events should be passed as a single entity
rather than being destructured into arguments, but language considerations may
trump this. For example, many event-passing libraries require a 'topic' to be
specified as a separate argument; when this is the case, use the `id` field (but
retain the field in the message).

When events are transmitted between processes, they must be serialized as JSON.

### Event types

The following event types (`id` values) are defined. State machines may define
other event types as needed, but should avoid needlessly multiplying entities as
this will make future work more difficult.

#### State notification and modification

These event types constitute the bulk of normal communication between state
machines.

1. `state-changed`: emitted by a state machine when its state vector changes.
   The purpose is to notify other state machines that depend on the state of the
   notifier. The payload must contain only the elements of the state that have
   changed, so that recipients do not have to determine this for themselves.
2. `modify-state`: sent to a state machine to request a change in its state
   vector. The purpose is to propagate information to state machines that are
   not listening to the notifier. This event type is primarily used by state
   machines that act as controllers for experiments and need to coordinate the
   behavior of subsidiary state machines. The payload and its interpretation are
   determined by the recipient state machine, and must be documented as part of
   the interface.
3. `tick`: indicates that an interval of time has passed. The payload must
   contain the field `interval`, giving the number of seconds elapsed.

#### Logging and error-handling

1. `stopped`: emitted when a state machine stops, either as the result of an
   error or as part of normal operation. (There is no corresponding `started`
   event, because most state machines have no listeners when they first start
   up).
2. `error`: emitted by a state machine when it encounters a fatal error. The
   payload must contain the field `reason` with a string indicating the cause of
   the error. Recipients may process the error in any way.
3. `warning`: emitted by a state machine when it encounters a non-fatal error.
   The payload must contain the field `reason` with a string indicating the
   cause of the error.
4. `info`: used to send informative messages. The `reason` field indicates the
   event being logged.

#### Application-specific

1. `trial`: this event is emitted by state machines controlling experiments, to
   indicate when a trial has completed. The payload contains data that will be
   used in later analysis.

#### Server-client

In progress. Messages to communicate between clients and a centralized host computer. Some of this may be managed by the wire protocol.

1. initial connection from client to server. Server registers the client, subscribes to events, and starts keeping track of heartbeats, feed events, etc.
2. heartbeats from client to server and replies from server to client. Server notifies a human if a client disappears unexpectedly. Client starts queuing/saving event data if the server disappears. Both sides should try to reconnect.

### Event transport interface

Event transport falls into two patterns. The first is a publish-subscribe
pattern, in which a state machine publishes state changes that are consumed by
listeners. The second is an asynchronous request-reply pattern, in which events are
sent to a specific state machine to modify its behavior. Recipients using this pattern may not need to send a reply.

Both transport patterns can use the same entry point for receiving events, but
the pub-sub pattern requires an additional method to allow subscribers to
register with the publisher.

In addition, state machines should provide a request-reply method to obtain the
current value of the state. In this case the method needs to send a reply.

The interface will depend on the transport mechanism. Where possible, the following method names should be used:

1. `event`: sends an event to the state machine. Should take a single
   argument, the event structure (or a serialized version of it).
2. `subscribe`: adds a listener to the state machine. Usually the listener is
   the recipient state machine's `event` method.
3. `unsubscribe`: removes a listener from the state machine
4. `state`: returns the current state

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

