
Implementing components as state machines is fairly straightforward, if a bit repetitive. It would be also relatively straightforward to write an experimental state machine, and then a top-level script that instantiated the state machines and hooked them up as needed. However, what gets a bit more complicated is passing events to and from other processes (including web clients). These clients need to have a way of referring to specific components. Tyler's solution is to supply a structure through HTTP GET that indicates something about the machines that are instantiated.

The way forward depends a bit on the interprocess architecture. Is there an independent server process that manages all communication with the apparatus, or is the server a part of each separate experiment program? Do experiment programs run in separate processes, or are they started and stopped by the server in the same process?

There are some significant advantages I can see to having the server run separately:

- all communication with the apparatus is centralized
- user always has control over the apparatus even when experiments aren't running
- host computer always has something to talk to
- experiment programs can be implemented in any language as long as the protocols are nailed down

Disadvantages:

- higher latency for changing state of apparatus (but this can be ameliorated by
  providing interprocess communication)
- more difficult to provide a unified interface for both experiment and
  apparatus state updates. The network architecture becomes more complex.
  Instead of a single monolithic server communicating with clients via pub/sub
  and req/rep, we have a number of independent clients that are all exchanging
  state.

If we go with the 'swarm' model, the biggest challenge is the network
architecture. Possibly the simplest solution is to have a centralized dispatcher
that (a) routes requests to the appropriate client and (b) publishes state
updates to all connected clients.

I'm not sure how to implement this over HTTP and web sockets. HTTP provides a pretty good request-reply mechanism. Can probably be replaced entirely by websockets though; reduced latency. Does look like sockets can do broadcast (where the server sends messages to all clients except the source). What about routing? Requires some sort of addressing scheme. The server needs to know who is connected that can receive messages.

