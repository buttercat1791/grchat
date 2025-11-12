# Libraries

This directory contains external libraries not written in TypeScript or JavaScript. These may include sub-projects compiled to WebAssembly (WASM) or wrappers for C, C++, or Rust binaries accessed via Deno's Foreign Function Interface (FFI).

## Deno FFI

Deno provides a [foreign function interface (FFI)](https://docs.deno.com/runtime/fundamentals/ffi/) to allow JS/TS code to call native libraries that expose a C API. Use FFI carefully to take advantage of reliable or highly-performant native libraries when no JS/TS equivalents will suit.

### Context

- Native libraries used by FFI _must_ expose a C API.
- Deno's FFI requires the `--allow-ffi` permission flag to be set when Deno starts. Note that this flag gives native code full process privileges, bypassing Deno's security guardrails.
- Deno _cannot_ verify correctness of FFI type declarations or API calls. The developer is responsible for ensuring that bindings are correct.

### Best Practices

- Wrap C APIs of libraries in idiomatic TypeScript APIs.
- Prefer TypeScript classes for better resource management.
  - Use `Deno.dlopen` in the constructor to open the library and share the open instance across class methods.
  - Provide a method consumers can use to unload the library when it is no longer needed.
  - Use TS/JS explicit resource management with `[Symbol.dispose]()` and `using` declarations, when available, to handle cleanup.
  - Use `isOpen` or `isClosed` flags to prevent duplicate open/close operations.
- Provide TypeScript types for dynamic library bindings by specifying the type parameter on `Deno.DynamicLibrary<T>`.
- Use `ArrayBuffer` or `TypedArray` in JS/TS to allocate memory owned by the JS runtime that can be used by the native library.
  - Pair these JS/TS types with the `"buffer"` FFI type.
  - Use `"buffer"` FFI types to identify pointer parameters passed to functions on the dynamic library API.
  - The caller is responsible for ensuring sufficient memory is allocated in the buffer.
- Provide the library path given to `Deno.dlopen` as an environment variable to avoid "magic strings".
- When defining types on Deno FFI bindings, use comments to indicate the corresponding type on the library's C API.
