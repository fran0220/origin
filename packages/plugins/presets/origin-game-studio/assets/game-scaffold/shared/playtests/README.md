# Playtests

Stored input scripts. Each one is a tick-addressed sequence played against the
injected clock, so the same script from the same seed always lands on the same
world — which is what makes a telemetry assertion or a before/after comparison
mean anything.

These are the regression assets. A milestone that closes on a playtest leaves
its script here, and every later milestone replays it.

```json
{
  "name": "hold right off the first ledge",
  "steps": [
    { "tick": 0, "kind": "key", "key": "arrowright", "action": "down" },
    { "tick": 42, "kind": "key", "key": "space", "action": "press" },
    { "tick": 90, "kind": "key", "key": "arrowright", "action": "up" }
  ]
}
```

Ticks, never milliseconds. A script addressed in wall-clock time replays
differently on a slower machine and stops being evidence.
