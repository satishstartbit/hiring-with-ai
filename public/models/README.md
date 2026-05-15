# face-api.js model files

The identity-verification gate (`app/components/identity/`) loads these models at runtime from `/models/*` (i.e. this directory). They are NOT committed because of their size (~6.7 MB total).

## Files

Six files, sourced from the `@vladmandic/face-api` repo (which matches the npm package we depend on):

| File                                              | Size     | Purpose                              |
| ------------------------------------------------- | -------- | ------------------------------------ |
| `tiny_face_detector_model-weights_manifest.json`  | ~3 KB    | TinyFaceDetector — fast detector     |
| `tiny_face_detector_model.bin`                    | ~190 KB  | TinyFaceDetector weights             |
| `face_landmark_68_model-weights_manifest.json`    | ~8 KB    | 68-point landmarks for alignment     |
| `face_landmark_68_model.bin`                      | ~350 KB  | Landmark weights                     |
| `face_recognition_model-weights_manifest.json`    | ~20 KB   | 128-d descriptor model               |
| `face_recognition_model.bin`                      | ~6.2 MB  | Recognition weights                  |

Each manifest references its `.bin` neighbour by relative path, so both must live in this folder.

## Re-downloading

Bash / WSL:

```bash
base="https://raw.githubusercontent.com/vladmandic/face-api/master/model"
for f in tiny_face_detector_model-weights_manifest.json tiny_face_detector_model.bin \
         face_landmark_68_model-weights_manifest.json face_landmark_68_model.bin \
         face_recognition_model-weights_manifest.json face_recognition_model.bin; do
  curl -fsSL -o "public/models/$f" "$base/$f"
done
```

PowerShell:

```powershell
$base = "https://raw.githubusercontent.com/vladmandic/face-api/master/model"
$files = @(
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model.bin",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin"
)
foreach ($f in $files) { Invoke-WebRequest "$base/$f" -OutFile "public/models/$f" }
```

## Why not load from a CDN?

CDNs (jsdelivr, unpkg) work but add ~1-2s latency on first load and break if the candidate is on a locked-down corporate network. Self-hosting keeps the proctoring flow offline-capable once the page loads.
