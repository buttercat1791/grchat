# User Stories

## Session Start

_As a grchat user, I want to be able to log in to start a session._

GIVEN an unauthenticated user
AND a remote signer application controlled by that user
AND that user is on the grchat instance's whitelist
WHEN the user wishes to begin a session
THEN grchat presents a prompt to begin the NIP-46 authentication handshake with the remote signer

## Chat View

_As an authenticated grchat user, I want to be able to see what other users are chatting about on the relay._

GIVEN an authenticated user
AND a history of chat messages and threads from other users
WHEN the user has successfully begun an authenticated session
THEN grchat presents the user with a chat room-style view of Nostr events stored in the database
AND these chats are organized by recency, with the most recent shown at the bottom of the screen
AND only top-level (kind 11) messages are shown
AND responses to top-level messages (kind 1111) are organized into threads the user can click into

## Thread View

_As an authenticated grchat user, I want to be able to view the contents of comment threads on the relay._

GIVEN an authenticated user
AND a kind 11 chat message with kind 1111 threaded responses
WHEN the user wishes to view the contents of a thread
THEN the messages in the thread are presented in chronological order, with the most recent at the bottom of the screen

## Sending a Message

_As an authenticated grchat user, I want to be able to write messages into the main relay feed._

GIVEN an authenticated user
AND a remote signer capable of signing events on that user's behalf
WHEN the user wishes to send a kind 11 message to the main relay feed
THEN grchat provides a textarea into which the user is able to type a message
AND grchat provides a send button
AND clicking the send button triggers an event signing flow with the remote signer
AND the signed event is entered into the grchat instance's database

## Commenting on a Thread

_As an authenticated grchat user, I want to be able to write messages into a comment thread._

GIVEN an authenticated user
AND a kind 11 message, possibly with one or more kind 1111 threaded responses
AND the user is viewing the comment thread
WHEN the user wishes to contribute a message to the response thread
THEN grchat provides a textarea into which the user is able to type a message
AND grchat provides a send button
AND clicking the send butotn triggers an event signing flow with the remote signer
AND the signed event is entered into the grchat instance's database

## Session End

GIVEN an authenticated user
AND a session state for that user persisted in the database
WHEN the user wishes to end the session
THEN grchat presents a "terminate session" button
AND clicking the button terminates communication between the server and the user's remote signer
AND clicking the button removes the user's session state from the database
