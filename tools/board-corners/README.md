# Board detection — measuring it and training the optional model

The Tableau mode finds the board in two layers (see `pwa/ARCHITECTURE.md`):

1. **OpenCV pipeline** (always on, `pwa/features/scan-detect.js`): edges, bright/dark regions and long straight
   lines → candidate outlines → sub-pixel refinement → ranking → a **confidence score**. When the result is
   doubtful (< 80 %) a second, *normalised* pass runs: the light fall-off is divided out, highlights are
   clipped, an edge-preserving filter smooths the noise, local contrast is equalised, and the search repeats.
2. **Corner model** (optional, `pwa/features/scan-ml.js`): a MobileNetV2 regressor in TensorFlow.js. It proposes
   the four corners; the OpenCV code refines them on real edges and ranks them against its own candidates. A wrong
   guess cannot hurt, and with no model published the app is unchanged. **No trained model ships in this repo**:
   there is no public board-corner model, and training one needs labelled photos.

If the board is still wrong, the person taps **Coins** in the camera and drags four handles onto the corners.

## 1. How good is it?

```
node tools/board-corners/eval-synthetic.mjs 150 1 --verbose     # 150 random synthetic boards, seed 1
```

Random boards (white / black / green / brown, framed or not) on white / coloured / glossy / textured / dark walls,
with random angle, light fall-off, hard shadows, glare, noise, blur. A detection is correct at IoU ≥ 0.90. It also
reports, for each condition, how many were right, and how trustworthy the confidence score is. **It is a regression
gauge, not the accuracy users will see**: synthetic photos have no students, projectors, posters or reflections of
the room, and the shadows here are deliberately hard.

Last measured (3 seeds × 120 boards): 76 % / 88 % / 84 % correct. **69 of 70 (99 %) when there is no hard shadow,
glare or darkness**; with a hard shadow edge across the board 62 % (84/136), with glare 78 % (146/187), in a dark room
83 % (89/107): these are the weak spots, and where the optional model should help. Of the detections reported with
confidence ≥ 80 %, 92–95 % were correct. A full search takes ≈ 140–350 ms in Node on a desktop (it varies with the
machine's load); the camera re-fits the last outline in ≈ 5 ms on most frames and runs the full search every 6th, in
a worker. A phone is slower than a desktop: expect the hard frames (the second, normalised pass) to approach 500 ms.

## 2. The real number: label real photos

1. Collect 300+ photos of classroom boards (and ~50 with no board). Vary board type, wall, light, angle, distance.
2. Serve the repository root (`npx http-server .`), open `/tools/board-corners/eval.html`.
3. **Label**: click the four corners of each board (`N` = no board). Save `labels.json` next to the photos.
4. **Evaluate**: the page runs the app's own detector on those photos (same 512 px frame, same function) and reports
   the share with IoU ≥ 0.90, the confidence calibration, the not-found and false-board counts, and lists the failures.

Only this number can say whether the 95 % target is met.

## 3. Training the corner model (optional, needs a GPU or patience)

Needs the `labels.json` from step 2 (about 1 500 labelled photos is a reasonable start; the augmentation in the script
multiplies them with random perspective, light, shadow, glare, noise and colour changes).

```
pip install "tensorflow>=2.15" tensorflowjs opencv-python pillow numpy
python tools/board-corners/train.py --dataset ./board-photos --out ./board-model
tensorflowjs_converter --input_format=tf_saved_model --output_format=tfjs_graph_model \
    --quantize_float16=* ./board-model/saved_model ./board-model/tfjs
```

Measure on photos the model never saw, **against the OpenCV pipeline on the same photos**:

```
python tools/board-corners/train.py --dataset ./board-photos --out ./board-model --evaluate
```

Ship it only if it helps (it should rescue the cases OpenCV gets wrong without hurting the others). Copy
`board-model/tfjs/*` to `pwa/models/board-corners/` (`model.json` + the `.bin` shards) and publish: the app notices
the model, downloads TensorFlow.js and the model once on the first Tableau use, saves the model in IndexedDB and
uses it from then on. Remove the folder to switch it off.

`train.py` has not been run end to end (there was no GPU and no dataset when it was written): expect to fix small
things on the first run.

Model contract (`pwa/features/scan-ml.js`): input `[1,160,160,3]`, the whole frame stretched, RGB scaled to [-1, 1];
output `[1,9]` = `x1 y1 x2 y2 x3 y3 x4 y4 present` (corners TL TR BR BL in 0..1 of the frame; `present` 0..1).
