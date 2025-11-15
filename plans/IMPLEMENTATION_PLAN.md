# Grchat Implementation Plan

## Project Overview

This plan outlines the phased implementation of Grchat, a full-stack Nostr-based threaded chat application. The implementation follows the Active Record pattern for domain logic, employs a service layer for business logic, and uses Fresh framework with Islands Architecture for the UI.

## Architecture Principles

- **Domain Logic**: Active Record pattern using Nostr events (NIP-01, NIP-7D)
- **Service Layer**: TypeScript modules mediating between presentation and domain logic
- **Web Presentation**: Fresh framework with Islands Architecture (MVC pattern)
- **API Surface**: WebSocket-based Nostr relay implementing NIP-01 and NIP-7D
- **Session Management**: Server Session State pattern with Valkey persistence
- **Data Store**: Valkey key-value store with defined schema

## Implementation Phases

### Phase 1: Foundation & Infrastructure

**Goal**: Establish the core infrastructure, database connectivity, and FFI wrappers.

#### 1.1 Database Layer

- [x] **Valkey Docker Container Setup**
  - Create Dockerfile for Valkey container
  - Configure Valkey for optimal chat message storage
  - Set up volume mounts for data persistence
  - Define Docker networking between Valkey and Deno containers

- [x] **Valkey Client Service** (`services/valkey-client.ts`)
  - Initialize Valkey GLIDE client connection
  - Implement connection pooling and error handling
  - Create wrapper functions for core Valkey operations:
    - Hash operations (HSET, HGET, HGETALL, HDEL)
    - String operations (SET, GET, DEL)
    - Set operations (SADD, SISMEMBER, SMEMBERS)
    - Sorted set operations (ZADD, ZRANGE, ZREM)
    - TTL management (EXPIRE, TTL)
  - Implement connection lifecycle management (connect, disconnect, health checks)

#### 1.2 Cryptography FFI Layer

- [x] **Noscrypt FFI Wrapper** (`services/noscrypt.ts`)
  - Define FFI bindings for noscrypt library functions:
    - Event signing
    - Signature verification
    - Public key operations
  - Create TypeScript type definitions for noscrypt structures
  - Implement error handling for FFI calls
  - Add input validation at FFI boundary

- [ ] **Cryptography Service** (`services/crypto.ts`)
  - Wrap noscrypt FFI with business logic
  - Implement Nostr event ID generation (SHA-256 serialization)
  - Implement event signature verification
  - Add cryptographic validation helpers

#### 1.3 Domain Models

- [ ] **Nostr Event Types** (`services/nostr-events.ts`)
  - Define TypeScript interfaces for NIP-01 events
  - Define interfaces for NIP-7D chat messages (kind 11)
  - Define interfaces for NIP-7D threaded responses (kind 1111)
  - Implement event serialization/deserialization
  - Create validation functions for event structure

- [ ] **Session Model** (`services/session-model.ts`)
  - Define session state TypeScript interface
  - Implement CSV serialization for session state
  - Implement CSV deserialization for session state
  - Define session validation rules

### Phase 2: Core Services

**Goal**: Build the service layer implementing authentication, authorization, and data access.

#### 2.1 Authentication Services

- [ ] **NIP-46 Remote Signing Service** (`services/nip46-auth.ts`)
  - Implement `nostrconnect://` URL generation
  - Implement `bunker://` URL parsing
  - Create NIP-46 handshake initiation logic
  - Implement request/response handling for remote signer communication
  - Add timeout handling for handshake operations

- [ ] **Session Management Service** (`services/session-manager.ts`)
  - Implement session creation after successful NIP-46 handshake
  - Implement session retrieval from Valkey
  - Implement session validation (expiration check)
  - Implement session deletion (logout, expiration)
  - Implement multi-device session tracking
  - Add session renewal logic

- [ ] **Keepalive Service** (`services/keepalive.ts`)
  - Implement 60-second ping interval timer
  - Implement NIP-46 ping message generation
  - Implement pong message verification
  - Implement session termination on keepalive failure
  - Add graceful shutdown handling

#### 2.2 Authorization Services

- [ ] **Whitelist Service** (`services/whitelist.ts`)
  - Implement whitelist initialization from configuration
  - Implement whitelist persistence to Valkey
  - Implement whitelist membership check
  - Implement whitelist add/remove operations (admin functions)

- [ ] **NIP-42 Challenge Service** (`services/nip42-challenge.ts`)
  - Implement challenge event generation
  - Implement challenge issuance (once per session)
  - Implement challenge response verification
  - Implement 6-hour challenge timeout
  - Implement challenge state persistence in session

- [ ] **Authorization Service** (`services/authorization.ts`)
  - Implement read authorization logic (whitelist + NIP-42)
  - Implement write authorization logic (signature verification)
  - Create authorization middleware helpers
  - Add authorization error handling

#### 2.3 Data Access Services

- [ ] **Message Storage Service** (`services/message-storage.ts`)
  - Implement kind 11 message persistence to Valkey
    - Hash storage: `chat.message.<message-event-id>`
    - Timeline index update: `index.messages.timeline`
    - TTL: 90 days
  - Implement kind 1111 threaded response persistence
    - Hash storage: `chat.message.<root-event-id>.thread.<response-event-id>`
    - Thread index update: `index.threads.<root-event-id>`
    - TTL: 90 days
  - Implement transaction-like operations for atomic updates
  - Add rollback logic on partial failures

- [ ] **Message Retrieval Service** (`services/message-retrieval.ts`)
  - Implement timeline query (sorted by recency)
  - Implement thread retrieval (all responses to a root message)
  - Implement pagination support
  - Implement efficient batch retrieval
  - Add caching strategies for frequently accessed data

- [ ] **Event Validation Service** (`services/event-validator.ts`)
  - Implement NIP-01 event structure validation
  - Implement NIP-7D specific validation (kind 11, 1111)
  - Validate required tags for threaded responses
  - Validate event signatures
  - Validate event IDs
  - Return descriptive validation error messages

### Phase 3: Nostr Relay API

**Goal**: Implement the WebSocket-based Nostr relay API surface.

#### 3.1 WebSocket Server

- [ ] **WebSocket Handler** (`routes/relay.ts` or similar)
  - Set up WebSocket server route
  - Implement connection lifecycle management
  - Add connection authentication check
  - Implement error handling and graceful disconnection

#### 3.2 NIP-01 Protocol Implementation

- [ ] **Message Protocol Service** (`services/relay-protocol.ts`)
  - Implement `EVENT` message handling (client to relay)
    - Validate event kind (must be 11 or 1111, reject others)
    - Validate event structure and signature
    - Check write authorization
    - Persist to database
    - Broadcast to subscribers
    - Send `OK` response
  - Implement `REQ` message handling (subscription requests)
    - Parse filters
    - Query database for matching events
    - Send matching events to client
    - Track active subscriptions
  - Implement `CLOSE` message handling (close subscription)
    - Remove subscription from active list
  - Implement relay-to-client messages:
    - `EVENT` (subscription results)
    - `EOSE` (end of stored events)
    - `OK` (command results)
    - `NOTICE` (error messages)

#### 3.3 Subscription Management

- [ ] **Subscription Service** (`services/subscriptions.ts`)
  - Implement subscription creation and tracking
  - Implement filter matching logic
  - Implement real-time event broadcasting to active subscriptions
  - Implement subscription cleanup on disconnection
  - Add subscription limits per connection

### Phase 4: Fresh UI - Core Views

**Goal**: Build the server-rendered Fresh UI with interactive islands.

#### 4.1 Layout & Routing

- [ ] **Main Layout** (`routes/_layout.tsx`)
  - Define base HTML structure
  - Include TailwindCSS and DaisyUI
  - Add navigation header
  - Add session state display (logged in user)
  - Add logout button
  - Add error boundary

- [ ] **Route Structure**
  - `/` - Landing page with authentication prompt
  - `/chat` - Main chat view (requires authentication)
  - `/chat/thread/:id` - Thread detail view (requires authentication)
  - `/api/auth/*` - Authentication API endpoints

#### 4.2 Authentication UI

- [ ] **Login Component** (`components/Login.tsx`)
  - Display QR code for `nostrconnect://` URL
  - Display copyable `nostrconnect://` string
  - Provide input field for `bunker://` URL
  - Show authentication status feedback
  - Handle authentication errors

- [ ] **Login Island** (`islands/LoginIsland.tsx`)
  - Implement QR code generation (client-side)
  - Implement clipboard copy functionality
  - Implement `bunker://` URL submission
  - Poll for authentication completion
  - Redirect to chat view on success

- [ ] **Login Route** (`routes/index.tsx`)
  - Check for existing session
  - Redirect to chat if authenticated
  - Render login component if unauthenticated
  - Initiate NIP-46 handshake via service layer

#### 4.3 Chat View UI

- [ ] **Chat View Route** (`routes/chat/index.tsx`)
  - Check authentication/authorization
  - Fetch recent messages via service layer
  - Pass messages to chat component
  - Handle session expiration gracefully

- [ ] **Message List Component** (`components/MessageList.tsx`)
  - Display messages in chronological order (most recent at bottom)
  - Show message metadata (author, timestamp)
  - Render message content
  - Show thread indicators (reply count)
  - Make threads clickable

- [ ] **Message Item Component** (`components/MessageItem.tsx`)
  - Display individual message
  - Format timestamp
  - Display author public key (abbreviated)
  - Show thread indicator if message has responses
  - Link to thread view

- [ ] **Message Composer Island** (`islands/MessageComposer.tsx`)
  - Provide textarea for message input
  - Provide send button
  - Implement character limit display
  - Trigger signing flow with remote signer
  - Submit signed event to relay
  - Show sending status and errors
  - Clear input on successful send
  - Auto-scroll to new message

- [ ] **Real-time Updates Island** (`islands/ChatUpdates.tsx`)
  - Establish WebSocket connection to relay
  - Subscribe to new messages (kind 11)
  - Update message list on new events
  - Handle reconnection on connection loss
  - Show connection status indicator

#### 4.4 Thread View UI

- [ ] **Thread View Route** (`routes/chat/thread/[id].tsx`)
  - Extract thread root ID from URL
  - Fetch root message and all responses via service layer
  - Check authentication/authorization
  - Handle invalid thread IDs
  - Pass data to thread component

- [ ] **Thread Component** (`components/Thread.tsx`)
  - Display root message prominently
  - Display threaded responses in chronological order
  - Show response metadata (author, timestamp)
  - Provide breadcrumb navigation back to main chat

- [ ] **Thread Composer Island** (`islands/ThreadComposer.tsx`)
  - Provide textarea for response input
  - Provide send button
  - Implement character limit display
  - Trigger signing flow with remote signer
  - Submit signed kind 1111 event with proper `e` tag
  - Show sending status and errors
  - Clear input on successful send

- [ ] **Thread Updates Island** (`islands/ThreadUpdates.tsx`)
  - Subscribe to new responses for current thread
  - Update response list on new events
  - Handle reconnection on connection loss

### Phase 5: Session & Error Handling

**Goal**: Implement robust session management and error handling throughout the application.

#### 5.1 Session UI Components

- [ ] **Session Status Component** (`components/SessionStatus.tsx`)
  - Display current user public key (abbreviated)
  - Display session expiration countdown
  - Display connection status to remote signer
  - Show warning when session approaches expiration

- [ ] **Session Renewal Prompt** (`components/SessionRenewalPrompt.tsx`)
  - Detect session expiration
  - Prompt user to re-authenticate
  - Preserve current route for post-authentication redirect
  - Show clear explanation of state loss

- [ ] **Logout Component** (`components/Logout.tsx`)
  - Provide logout button
  - Confirm logout action
  - Terminate session via service layer
  - Redirect to login page

#### 5.2 Error Handling

- [ ] **Error Boundary Component** (`components/ErrorBoundary.tsx`)
  - Catch and display presentation layer errors
  - Provide user-friendly error messages
  - Log errors for debugging
  - Offer recovery actions (refresh, logout)

- [ ] **Error Display Component** (`components/ErrorMessage.tsx`)
  - Display validation errors
  - Display authorization errors
  - Display network errors
  - Display cryptographic errors
  - Provide contextual help messages

- [ ] **Service Layer Error Handling**
  - Define error types for common failure scenarios
  - Propagate errors with context to presentation layer
  - Log errors server-side
  - Convert FFI errors to application errors

### Phase 6: Configuration & Deployment

**Goal**: Set up configuration management and Docker deployment.

#### 6.1 Configuration

- [ ] **Server Configuration** (`config/server.ts` or similar)
  - Define environment variables:
    - Valkey connection string
    - Server port
    - WebSocket endpoint
    - Session timeout duration
    - Challenge timeout duration
    - Keepalive interval
  - Load initial whitelist from file or environment
  - Validate configuration on startup
  - Provide configuration defaults

- [ ] **Logging Configuration**
  - Set up structured logging
  - Define log levels (debug, info, warn, error)
  - Configure log output (console, file)
  - Add request ID tracking for correlation

#### 6.2 Docker Deployment

- [ ] **Deno Server Dockerfile** (`containers/Dockerfile.deno`)
  - Use official Deno base image
  - Copy application code
  - Install dependencies
  - Configure FFI permissions (`--allow-ffi`)
  - Expose WebSocket and HTTP ports
  - Set up health check endpoint
  - Define entrypoint

- [ ] **Docker Compose Configuration** (`containers/docker-compose.yml`)
  - Define Valkey service
  - Define Deno server service
  - Configure networking between containers
  - Set up volume mounts for data persistence
  - Configure environment variables
  - Set up service dependencies (Deno depends on Valkey)
  - Define restart policies

- [ ] **Development Scripts**
  - Create `dev` script for local development with file watching
  - Create `build` script for production builds
  - Create `test` script for running tests
  - Create Docker scripts for container management

#### 6.3 Noscrypt Integration

- [ ] **Noscrypt Library Setup**
  - Obtain or compile noscrypt shared library (.so/.dll)
  - Place library in accessible location for FFI
  - Document library version and build process
  - Create script to update library if needed

### Phase 7: Testing & Quality Assurance

**Goal**: Ensure code quality, correctness, and reliability.

#### 7.1 Unit Tests

- [ ] **Service Layer Tests**
  - Test Valkey client service (mocked Valkey)
  - Test crypto service (FFI mocked)
  - Test event validation service
  - Test session management service
  - Test whitelist service
  - Test authorization service
  - Test message storage service
  - Test message retrieval service

#### 7.2 Integration Tests

- [ ] **End-to-End Authentication Flow**
  - Test NIP-46 handshake with mock signer
  - Test session creation and persistence
  - Test NIP-42 challenge flow
  - Test session expiration and renewal
  - Test multi-device sessions

- [ ] **End-to-End Message Flow**
  - Test kind 11 message creation
  - Test kind 1111 response creation
  - Test message retrieval from timeline
  - Test thread retrieval
  - Test real-time updates via WebSocket

- [ ] **Relay Protocol Tests**
  - Test EVENT message handling
  - Test REQ message handling
  - Test CLOSE message handling
  - Test subscription filtering
  - Test event rejection (wrong kind)

#### 7.3 UI Tests

- [ ] **Component Tests**
  - Test message rendering
  - Test thread rendering
  - Test form submission
  - Test error display

- [ ] **Browser Tests**
  - Test authentication flow in browser
  - Test message sending
  - Test thread navigation
  - Test real-time updates
  - Test session expiration handling

#### 7.4 Security Tests

- [ ] **Authorization Tests**
  - Test unauthorized read attempts
  - Test unauthorized write attempts
  - Test invalid signatures
  - Test whitelist enforcement
  - Test NIP-42 challenge bypass attempts

- [ ] **Input Validation Tests**
  - Test malformed events
  - Test oversized content
  - Test injection attempts
  - Test invalid public keys

### Phase 8: Documentation & Refinement

**Goal**: Provide comprehensive documentation and polish the application.

#### 8.1 Code Documentation

- [ ] **API Documentation**
  - Document all service layer functions
  - Document expected inputs and outputs
  - Document error conditions
  - Provide usage examples

- [ ] **Component Documentation**
  - Document component props
  - Document component behavior
  - Document island interactivity

#### 8.2 User Documentation

- [ ] **User Guide**
  - Document authentication process
  - Document message sending
  - Document thread participation
  - Document session management
  - Provide troubleshooting guide

- [ ] **Administrator Guide**
  - Document server setup
  - Document whitelist management
  - Document configuration options
  - Document backup and recovery
  - Document monitoring and logging

#### 8.3 Developer Documentation

- [ ] **Contribution Guide**
  - Explain architecture patterns
  - Explain code style requirements
  - Explain development workflow
  - Explain testing requirements

- [ ] **Deployment Guide**
  - Document Docker deployment process
  - Document environment variables
  - Document security considerations
  - Document scaling considerations

## Implementation Order Recommendations

1. **Start with Phase 1**: Establish foundation before building higher-level features
2. **Phase 2 services are prerequisites** for both API and UI (Phases 3-4)
3. **Phase 3 and Phase 4 can proceed in parallel** once Phase 2 is complete
4. **Phase 5 integrates with Phases 3-4**: Implement alongside or immediately after
5. **Phase 6 should be set up early**: Docker config enables local development
6. **Phase 7 should be ongoing**: Write tests alongside implementation
7. **Phase 8 is continuous**: Document as you build

## Critical Dependencies

- **Valkey GLIDE client**: Verify compatibility with Deno
- **Noscrypt library**: Must be compiled for target platform with FFI-compatible symbols
- **Fresh framework**: Stay current with Fresh best practices for Islands Architecture
- **NIP-46 remote signer**: Requires compatible signer application for testing (e.g., Amber, Alby)

## Risk Mitigation

- **FFI complexity**: Build and test noscrypt wrapper early (Phase 1.2)
- **WebSocket reliability**: Implement robust reconnection logic
- **Session synchronization**: Test multi-device scenarios thoroughly
- **Database performance**: Monitor Valkey query performance, optimize indices
- **Real-time updates**: Test with multiple concurrent users

## Success Criteria

- [ ] Users can authenticate via NIP-46 with remote signer
- [ ] Users can view chat message timeline
- [ ] Users can send kind 11 messages
- [ ] Users can view threaded responses
- [ ] Users can send kind 1111 threaded responses
- [ ] Sessions persist correctly with keepalive
- [ ] Sessions expire and renew correctly
- [ ] Authorization enforces whitelist and NIP-42
- [ ] Real-time updates work reliably
- [ ] Application is deployable via Docker
- [ ] All user stories in USER_STORIES.md are fulfilled

## Notes for Implementation

- Follow the architecture patterns defined in PATTERNS.md strictly
- Never modify architecture documentation (it is privileged)
- Consult FFI.md before interacting with noscrypt
- Adhere to code style guidelines in AGENTS.md
- Write tests for all service layer functions
- Use service layer from both UI routes and API endpoints
- Keep session state minimal (CSV serialization constraint)
- Implement graceful degradation for non-critical failures
- Log errors comprehensively for debugging
- Validate all inputs at service layer boundary
