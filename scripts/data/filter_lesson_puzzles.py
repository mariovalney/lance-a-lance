# Lesson puzzle pools (Module 8 and endgames): up to CAP puzzles per wanted theme, rating 500-1500.
# Usage: curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | python3 scripts/data/filter_lesson_puzzles.py data/puzzles_raw.json
# Then: npx tsx scripts/curate-puzzles.ts
import sys, csv, io, zstandard, json, collections
WANT = {"fork","pin","skewer","discoveredAttack","doubleCheck","capturingDefender","deflection","mateIn1","mateIn2","hangingPiece","pawnEndgame","rookEndgame","backRankMate"}
CAP = 600
buckets = collections.defaultdict(list)
dctx = zstandard.ZstdDecompressor()
reader = io.TextIOWrapper(dctx.stream_reader(sys.stdin.buffer), encoding="utf-8")
r = csv.reader(reader)
header = next(r)
idx = {h:i for i,h in enumerate(header)}
n = 0
for row in r:
    n += 1
    try:
        rating = int(row[idx["Rating"]]); pop = int(row[idx["Popularity"]]); plays = int(row[idx["NbPlays"]])
    except: continue
    if rating < 500 or rating > 1500 or pop < 85 or plays < 300: continue
    moves = row[idx["Moves"]].split()
    if len(moves) > 6: continue
    themes = set(row[idx["Themes"]].split())
    for t in themes & WANT:
        b = buckets[t]
        if len(b) < CAP:
            b.append({"id": row[idx["PuzzleId"]], "fen": row[idx["FEN"]], "moves": moves, "rating": rating, "themes": sorted(themes), "pop": pop, "plays": plays, "opening": row[idx["OpeningTags"]]})
    if n % 500000 == 0:
        print(n, {k: len(v) for k,v in buckets.items()}, file=sys.stderr, flush=True)
    if all(len(buckets[t]) >= CAP for t in WANT): break
out_path = sys.argv[1] if len(sys.argv) > 1 else "data/puzzles_raw.json"
json.dump(buckets, open(out_path, "w"))
print("rows", n, {k: len(v) for k,v in buckets.items()}, file=sys.stderr)
