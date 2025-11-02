# Foreign Function Interface (FFI)

Certain performance- or security-critical code for grchat is written in other programming languages than TypeScript or JavaScript, and must be called via a Foreign Function Interface (FFI).

## Reference Documentation

Deno provides an [FFI implementation](https://docs.deno.com/runtime/fundamentals/ffi/) to bridge its JavaScript runtime with native code. This requires the server to run with the `--allow-ffi` flag.

## FFI Guidelines

- Every distinct FFI should be given a TypeScript service wrapper defined in the [services/](../services) directory.
- Avoid calling unwrapper FFIs. Instead call the interface's TypeScript wrapper service.

## Current FFI Usage

- Nostr cryptography services are provided via the [noscrypt](https://www.vaughnnugent.com/resources/software/modules/noscrypt) library. Noscrypt is written in C and is invoked from grchat via FFI.
