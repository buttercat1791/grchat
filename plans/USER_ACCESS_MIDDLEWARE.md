# User Access Control Middleware Implementation Plan

## Overview

Implement access control middleware that blocks users not authorized by the app
configuration. The middleware will:

1. Set a pubkey cookie on successful NIP-46 login
2. Read the pubkey cookie on every request
3. Check user authorization against the configured allow/deny lists
4. Block all requests from disallowed users

## Current State Analysis

### Login Flow

- **Client-initiated**: `POST /api/auth/nostrconnect` → SSE at
  `/api/auth/handshake/[connectionId]` → session created
- **Signer-initiated**: `POST /api/auth/bunker` → session created
- Both flows store `userPubkey` in browser `localStorage` (not cookies)
- Sessions stored in Valkey with 24-hour TTL

### Existing Components

- `UserAccessControlService` (`features/auth/user-access-control.ts`): Ready to
  use, has `isUserAllowed(pubkey)` method
- `SessionManager` (`features/auth/session-manager-service.ts`): Validates
  sessions in Valkey
- `State` interface (`utils.ts`): Needs extension for auth context

### Routes Structure

```
routes/
├── _app.tsx              # Layout wrapper
├── login.tsx             # Login page (public)
└── api/auth/             # Auth API routes (public during login)
```

## Implementation Plan

### Step 1: Extend State Interface

**File**: `utils.ts`

Add authentication context to Fresh state:

```typescript
export interface State {
  auth: {
    isAuthenticated: boolean;
    userPubkey: string | null;
  };
}
```

### Step 2: Create Cookie Utility Module

**File**: `features/auth/auth-cookie.ts`

Create utilities for managing the auth cookie:

- `AUTH_COOKIE_NAME = "grchat_pubkey"`
- `setAuthCookie(headers: Headers, pubkey: string): void` - Sets HttpOnly,
  Secure, SameSite=Strict cookie
- `getAuthCookie(request: Request): string | null` - Reads pubkey from cookie
- `clearAuthCookie(headers: Headers): void` - Clears the cookie on logout

### Step 3: Update Bunker Auth Route to Set Cookie

**File**: `routes/api/auth/bunker.ts`

Modify to:

1. Check `UserAccessControlService.isUserAllowed(userPubkey)` before creating
   session
2. Return 403 Forbidden if user is not allowed
3. Add `Set-Cookie` header on successful authentication

### Step 4: Create Finalize Endpoint for SSE Flow

**File**: `routes/api/auth/finalize.ts`

The SSE stream at `/api/auth/handshake/[connectionId]` cannot set cookies
mid-stream. After SSE completion, the client calls this endpoint to set the
cookie:

```typescript
// POST /api/auth/finalize
// Request: { userPubkey: string }
// Response: 200 OK with Set-Cookie header, or 403 if not allowed
```

This endpoint:

1. Validates the pubkey format
2. Verifies session exists in Valkey
3. Checks `UserAccessControlService.isUserAllowed(userPubkey)`
4. Sets the auth cookie
5. Returns success or 403

### Step 5: Update Handshake Route for Access Control

**File**: `routes/api/auth/handshake/[connectionId].ts`

Modify to check `UserAccessControlService.isUserAllowed(userPubkey)` after
handshake completes but before creating session. Return error status via SSE if
user is not allowed.

### Step 6: Create Root Middleware

**File**: `routes/_middleware.ts`

Fresh middleware using file-based routing:

```typescript
export const handler = define.middleware(async (ctx) => {
  // Public routes - allow without auth
  const publicPaths = ["/login", "/api/auth/"];
  if (publicPaths.some((p) => ctx.url.pathname.startsWith(p))) {
    ctx.state.auth = { isAuthenticated: false, userPubkey: null };
    return ctx.next();
  }

  // Read pubkey from cookie
  const pubkey = getAuthCookie(ctx.req);

  // No cookie → redirect to login (for pages) or 401 (for API)
  if (!pubkey) {
    return handleUnauthenticated(ctx);
  }

  // Validate session exists in Valkey
  const sessionManager = AppServices.instance.sessionManager;
  if (!(await sessionManager.sessionExists(pubkey))) {
    // Session expired/invalid → clear cookie, redirect to login
    return handleSessionExpired(ctx);
  }

  // Check user access control
  const accessControl = UserAccessControlService.create();
  if (!accessControl.isUserAllowed(pubkey)) {
    return handleAccessDenied(ctx);
  }

  // Set auth context in state
  ctx.state.auth = { isAuthenticated: true, userPubkey: pubkey };
  return ctx.next();
});
```

### Step 7: Create Logout API Route

**File**: `routes/api/auth/logout.ts`

Handle logout by:

1. Deleting session from Valkey
2. Stopping keepalive tracking
3. Clearing the auth cookie

### Step 8: Update LoginForm Island

**File**: `islands/LoginForm.tsx`

- Remove `localStorage.setItem("userPubkey", ...)` calls
- After SSE completion, call `POST /api/auth/finalize` to set the cookie
- Then redirect to "/"

### Step 9: Create Access Denied Route

**File**: `routes/access-denied.tsx`

- Display an "Access Denied" message

## Files to Modify

| File                                       | Action | Purpose                            |
| ------------------------------------------ | ------ | ---------------------------------- |
| `utils.ts`                                 | Modify | Extend State interface             |
| `features/auth/auth-cookie.ts`             | Create | Cookie utilities                   |
| `routes/_middleware.ts`                    | Create | Access control middleware          |
| `routes/api/auth/bunker.ts`                | Modify | Set cookie, check access           |
| `routes/api/auth/finalize.ts`              | Create | Set cookie after SSE flow          |
| `routes/api/auth/handshake/[connectionId]` | Modify | Check access on handshake          |
| `routes/api/auth/logout.ts`                | Create | Logout endpoint                    |
| `islands/LoginForm.tsx`                    | Modify | Call finalize, remove localStorage |
| `routes/access-denied.tsx`                 | Create | Access denied page                 |

## Security Considerations

1. **Cookie Settings**: HttpOnly, Secure (in production), SameSite=Strict
2. **Session Validation**: Every request validates session exists in Valkey
3. **Access Control Check**: Performed on every authenticated request
4. **Fail Closed**: Missing cookie or invalid session → deny access

## Edge Cases

1. **Session expires mid-use**: Middleware detects missing Valkey session,
   clears cookie, redirects to login
2. **User removed from allow list while logged in**: Next request is blocked by
   access control
3. **Cookie without session**: Stale cookie cleared, redirect to login
4. **API requests from disallowed users**: Return 403 JSON response, not
   redirect
