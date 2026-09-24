# Trainer sample: up to BAND_CAP puzzles per 100-point rating band (400-2300) plus THEME_CAP per theme,
# so every Lichess theme is represented.
# Usage: curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | python3 scripts/data/filter_trainer_puzzles.py data/puzzles_all.json
# Then: npx tsx scripts/curate-trainer.ts
import sys, csv, io, zstandard, json, collections
BAND_CAP = 220
THEME_CAP = 40
bands = collections.defaultdict(list)
themes_res = collections.defaultdict(list)
seen = set()
dctx = zstandard.ZstdDecompressor()
reader = io.TextIOWrapper(dctx.stream_reader(sys.stdin.buffer), encoding="utf-8")
r = csv.reader(reader)
header = next(r)
idx = {h: i for i, h in enumerate(header)}
n = 0
def rec(row, moves, rating, themes):
    return {"id": row[idx["PuzzleId"]], "fen": row[idx["FEN"]], "moves": moves, "rating": rating,
            "themes": themes, "pop": int(row[idx["Popularity"]]), "plays": int(row[idx["NbPlays"]]),
            "game": row[idx["GameUrl"]], "opening": row[idx["OpeningTags"]]}
for row in r:
    n += 1
    try:
        rating = int(row[idx["Rating"]]); pop = int(row[idx["Popularity"]]); plays = int(row[idx["NbPlays"]])
    except Exception:
        continue
    if rating < 400 or rating > 2300 or pop < 80 or plays < 300:
        continue
    moves = row[idx["Moves"]].split()
    if len(moves) > 10:
        continue
    themes = row[idx["Themes"]].split()
    b = rating // 100
    added = False
    if len(bands[b]) < BAND_CAP:
        bands[b].append(rec(row, moves, rating, themes)); added = True
    for t in themes:
        if len(themes_res[t]) < THEME_CAP:
            if not added:
                themes_res[t].append(rec(row, moves, rating, themes)); added = True
            else:
                themes_res[t].append(None)  # counted via band copy
    if n % 1000000 == 0:
        print(n, sum(len(v) for v in bands.values()), file=sys.stderr, flush=True)
out = {}
for v in bands.values():
    for p in v: out[p["id"]] = p
for v in themes_res.values():
    for p in v:
        if p: out[p["id"]] = p
out_path = sys.argv[1] if len(sys.argv) > 1 else "data/puzzles_all.json"
json.dump(list(out.values()), open(out_path, "w"))
tc = collections.Counter(t for p in out.values() for t in p["themes"])
print("rows", n, "kept", len(out), "themes", len(tc), file=sys.stderr)
print(sorted(tc.items(), key=lambda x: x[1])[:25], file=sys.stderr)
