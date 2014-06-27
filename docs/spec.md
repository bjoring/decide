
This document specifies the protocols used by the *decide* operant control
software.

-   Editor: Dan Meliza (dan at meliza.org)
-   Version: 1.0
-   State:  draft
-   URL: <http://meliza.org/specifications/decide>

Architecture of *decide* is a set of state machines that communicate by emitting events.

## States and state machines

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

## Events

State machines transition (or don't) upon receipt of events. Events must have the
following format:

```json
{
   "source": "identifies the state machine emitting the event",
   "time": 1403736696.24122,
   "id": "identifies the type of event",
   "data": {}
}
```

All the fields in an event are required, but the `data` value may be any type,
as determined by the type of the event and the recipient or sender. There are
two models for event-based communication:

1. The state machine is publishing information about changes in its state to
   subscribers. In this case, the data type is determined by the sender. The
   state machine needs to provide a method for subscription.
2. An event is being pushed to the state machine to modify its behavior. In this
   case, the data type is determined by the recipient. The state machine needs
   to provide a method for accepting events.

In practice, state machines should discard any messages they don't understand or want.

### Event Transport

Events can be transmitted through function calls within a process or via various
interprocess communication channels. Unless there are compelling reasons to use
another format, events should be serialized as JSON.


## State space descriptors

In addition, state machines may provide information about the state space they
occupy. There should be a specification for this. Something similar to the state
vector itself:

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

What about for gng:

```json
{
   "epoch": {"values": ["inter-trial", "stimulus", "response", "consequence"]},
   "reward":{"values": [true, false]},
}
```

Don't want to go too far. Specifying dependencies is too much. Perhaps it's not
that important to specify how descriptors work.
