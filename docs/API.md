# Playing through the API

`/api/v1` plays a game against the computer from outside the app: an MCP server, a script, another board. It is the same game the app plays, with the same rules:

- One open game per person. A game started here shows up at `/partida` in the app, and the other way around.
- The same computer levels, played the same way (`shared/games.ts`). The server runs the computer's moves with the same Stockfish build the app loads.
- Always rated, like an app game without assistance: Elo, XP, the game counts and the day streak, scored by the server.

The difference is who moves the computer. In the app the browser does. Here the server does, before it answers, so a move comes back with the computer's reply in the same response.

While `/partida` is open, the app asks the server for the open game every 2 seconds and whenever it comes back to the foreground. A move made through the API shows up on the phone on its own, and so does a game started, ended or called off here.

## Turning it on

Set `USER_API_KEYS` on the server, as a comma separated list of `email|key`:

```
USER_API_KEYS=mario@example.com|3f9c1d7e8a2b4c6d9e0f1a2b3c4d5e6f,other@example.com|...
```

- The email has to belong to an existing account. The key acts as that account.
- A key needs at least 16 characters and cannot contain `,` or `|`. `openssl rand -hex 24` makes a good one.
- A malformed entry stops the server at boot, with the entry's position in the message.
- Without the variable, every `/api/v1` route answers 404.

Changing a key means changing the variable and restarting.

## Requests and answers

Send the key as a Bearer token. Bodies are JSON.

```
Authorization: Bearer 3f9c1d7e8a2b4c6d9e0f1a2b3c4d5e6f
Content-Type: application/json
```

Every answer is JSON shaped as `{ success, data }`:

```json
{ "success": true, "data": { "status": "player", "game": { } } }
{ "success": false, "data": { "error": "illegal_move", "message": "Ke2 is not a legal move here.", "legalMoves": [] } }
```

`data.error` is a stable code for programs; `data.message` explains it in English. Some errors carry the current game as well (`status` and `game`), so the client can recover without another request.

| Code | HTTP | When |
|---|---|---|
| `unauthorized` | 401 | Missing key, unknown key, or a key whose email has no account |
| `not_found` | 404 | No such route, or the API is off |
| `invalid_level`, `invalid_color`, `invalid_move`, `invalid_ply` | 400 | A body that does not follow this page |
| `illegal_move` | 400 | The move is not legal in the position; `data.legalMoves` lists the legal ones |
| `no_game` | 404 | There is no open game |
| `game_open` | 409 | Creating a game while one is open; the open game comes along |
| `stale_ply` | 409 | `ply` does not match the game; the game comes along |
| `not_your_turn` | 409 | It was the computer's turn (the app left it there); it has moved now, and the game comes along |
| `game_moved` | 409 | The game changed in the app while this move was being answered; the game comes along |
| `cannot_cancel` | 409 | Cancelling after both sides moved |
| `engine_unavailable` | 503 | The computer could not answer; nothing was saved, so the same request can be sent again |
| `server_error` | 500 | Anything else |

## Endpoints

### `POST /api/v1/game`

Starts a game.

```json
{ "level": 1200, "color": "white" }
```

- `level`: one of `400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400`, the levels on the app's setup screen.
- `color`: your pieces, `white`, `black` or `random` (the default).

Answers 201 with the game. Playing black, the computer's first move is already in it. With a game already open: 409 `game_open`, carrying that game.

### `GET /api/v1/game`

The open game. With no open game, the last one that ended (look at `status` and `finishedAt`). With no game ever: `{ "status": "none", "game": null }`.

If the open game was left on the computer's turn (the app closed while the computer was thinking), the computer moves before the answer.

### `POST /api/v1/game/move`

Your move, answered with the game after the computer's reply.

```json
{ "move": "Nf3", "ply": 4 }
```

- `move`: SAN (`e4`, `Nf3`, `exd5`, `O-O`, `e8=Q`) or UCI (`e2e4`, `g1f3`, `e7e8q`). A pawn that reaches the last rank needs its piece in either form.
- `ply` (optional, recommended): the number of moves played before this one, which is `game.ply` from the last answer. It makes retries safe: when a move already went through (the answer was lost on the way), sending it again with the same `ply` answers with the game instead of an error. A `ply` that does not match is 409 `stale_ply`, so a move meant for an older position is never played on a newer one.

When your move or the computer's ends the game, the answer already has the result and the rating change.

### `POST /api/v1/game/resign`

Gives up the open game: a loss, rated. Before both sides moved there is nothing to rate, so, as in the app, the game is called off instead: `{ "status": "cancelled", "game": null }`.

### `DELETE /api/v1/game`

Calls off the open game, only before both sides moved: it leaves nothing behind. After that, 409 `cannot_cancel`: resign instead.

## The game

```json
{
  "status": "player",
  "game": {
    "id": "c312f629-ca9e-4c4f-88a4-056a8e8c448e",
    "level": 1400,
    "assisted": false,
    "player": "black",
    "computer": "white",
    "turn": "black",
    "ply": 1,
    "fen": "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1",
    "pieces": { "e1": { "pieceType": "wK" }, "f3": { "pieceType": "wN" }, "e8": { "pieceType": "bK" } },
    "check": null,
    "lastMove": { "ply": 1, "by": "computer", "color": "white", "san": "Nf3", "uci": "g1f3", "from": "g1", "to": "f3", "reading": "cavalo para f3" },
    "moves": [{ "ply": 1, "by": "computer", "color": "white", "san": "Nf3", "uci": "g1f3", "from": "g1", "to": "f3", "reading": "cavalo para f3" }],
    "legalMoves": [{ "san": "Nf6", "uci": "g8f6", "from": "g8", "to": "f6" }],
    "material": { "white": 39, "black": 39, "balance": 0 },
    "result": null,
    "pgn": "[Event \"Partida contra o computador\"]\n...\n\n1. Nf3 *",
    "startedAt": "2026-10-15T12:00:00.000Z",
    "finishedAt": null
  }
}
```

`pieces` is shortened above; it lists every piece.

**`status`**

| Value | Meaning |
|---|---|
| `none` | No game was ever played |
| `player` | Your turn |
| `computer` | The computer's turn. Rare: the server moves before answering, so it only shows when the computer could not answer, and the next `GET` tries again |
| `victory` | Ended, you won |
| `defeat` | Ended, you lost (checkmated or resigned) |
| `draw` | Ended in a draw |
| `cancelled` | Only in the answer to cancelling or to an early resignation: the game is gone |

**Fields**

| Field | |
|---|---|
| `player`, `computer`, `turn` | `white` or `black`. `player` is also the side the board faces |
| `assisted` | `true` only for a game started in the app with assistance, which is never rated. Games started here never are |
| `ply` | Moves played so far, both sides. The `ply` to send with the next move |
| `fen` | The position. `fen` and `pieces` are the two shapes the `position` option of [react-chessboard](https://github.com/Clariity/react-chessboard) accepts, which is what the app draws with |
| `pieces` | Square to piece: `w` or `b` for the color, then `K Q R B N P` |
| `check` | The square of the king in check, to highlight, or `null` |
| `lastMove` | The last move, to highlight its `from` and `to`, or `null` before the first |
| `moves` | Every move. `by` is `player` or `computer`; `reading` is the Portuguese reading the app shows next to the SAN |
| `legalMoves` | Your legal moves, only on your turn |
| `material` | Material on the board, pawn 1, knight and bishop 3, rook 5, queen 9. `balance` is yours minus the computer's |
| `result` | `null` while the game goes on; then `{ outcome, reason, ratingDelta, ratingAfter, xp }`, with `outcome` `win`, `draw` or `loss` and `reason` `checkmate`, `stalemate`, `insufficient`, `repetition`, `fifty` or `resigned`. `ratingDelta` is `null` for a game too short to be rated |
| `pgn` | The game as PGN, with the tags the app's export uses, ready for Lichess or chess.com |

## Notes

- The day streak counts in Brazil's time (UTC-3), since an API call has no local day of its own.
- Requests of one person run one at a time, so two moves sent together cannot both be played on the same position.
- The computer thinks up to 0.7 s per move from level 1400 up, and much less below. The first move after a quiet while also starts the engine, which adds a fraction of a second.

## Example

```bash
KEY=3f9c1d7e8a2b4c6d9e0f1a2b3c4d5e6f; URL=https://lance.example.com/api/v1
curl -s -X POST "$URL/game" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"level":800,"color":"white"}'
curl -s -X POST "$URL/game/move" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"move":"e4","ply":0}'
curl -s "$URL/game" -H "Authorization: Bearer $KEY"
```
