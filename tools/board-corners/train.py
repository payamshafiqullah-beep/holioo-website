"""Train the board-corner model for Holioo's Tableau mode (MobileNetV2 regressor -> TensorFlow.js).

    pip install "tensorflow>=2.15" tensorflowjs opencv-python pillow numpy
    python tools/board-corners/train.py --dataset ./board-photos --out ./board-model
    python tools/board-corners/train.py --dataset ./board-photos --out ./board-model --evaluate

--dataset   a folder with the photos and a labels.json made with tools/board-corners/eval.html:
              {"classroom1.jpg": {"present": true,  "quad": [[x,y] x4]},     # TL TR BR BL, 0..1 of the photo
               "empty_wall.jpg": {"present": false}}
--out       writes best.keras, the SavedModel and the TensorFlow.js model (model.json + shards).
            Copy the TensorFlow.js files to pwa/models/board-corners/ : the app finds them by itself.

The model's contract (pwa/features/scan-ml.js): input 160x160x3 scaled to [-1, 1], output 9 numbers =
x1 y1 x2 y2 x3 y3 x4 y4 present. It is only a first guess: the app refines it on real edges and falls back to
OpenCV when it is wrong, so the model needs to be good, not perfect.

NOTE: this script was written without access to a GPU or a dataset and has not been run end to end.
Run `--evaluate` on photos the model never saw (a held-out split is made from --seed) and compare with the
OpenCV detector on the same split (eval.html) before shipping the model: ship it only if it helps.
"""
import argparse
import json
import math
import random
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf

SIZE = 160
AUTOTUNE = tf.data.AUTOTUNE


# ─── data ───────────────────────────────────────────────────────────────────────────────────────
def order_quad(pts):
    """TL, TR, BR, BL whatever the order given."""
    pts = np.asarray(pts, dtype=np.float32)
    c = pts.mean(axis=0)
    pts = pts[np.argsort(np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0]))]   # clockwise on screen
    start = int(np.argmin(pts.sum(axis=1)))
    return np.roll(pts, -start, axis=0)


def load_items(dataset):
    root = Path(dataset)
    labels = json.loads((root / "labels.json").read_text(encoding="utf-8"))
    items = []
    for name, lab in labels.items():
        path = root / name
        if not path.exists():
            continue
        quad = order_quad(lab["quad"]) if lab.get("present") else np.zeros((4, 2), np.float32)
        items.append((str(path), bool(lab.get("present")), quad))
    return items


def split(items, seed, val_share=0.15):
    rnd = random.Random(seed)
    items = items[:]
    rnd.shuffle(items)
    n_val = max(1, int(len(items) * val_share))
    return items[n_val:], items[:n_val]


def read(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


# ─── augmentation: the same changes are applied to the photo and to the corners ──────────────────
def augment(img, quad, present, rnd):
    h, w = img.shape[:2]
    pts = quad * np.array([w, h], np.float32)
    # viewing angle / position: a random perspective warp
    if rnd.random() < 0.8:
        j = 0.08
        src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        dst = src + np.float32([[rnd.uniform(-j, j) * w, rnd.uniform(-j, j) * h] for _ in range(4)])
        m = cv2.getPerspectiveTransform(src, dst)
        img = cv2.warpPerspective(img, m, (w, h), borderMode=cv2.BORDER_REFLECT)
        if present:
            pts = cv2.perspectiveTransform(pts[None], m)[0]
    if rnd.random() < 0.5:                       # mirror: corner order changes
        img = img[:, ::-1].copy()
        if present:
            pts = order_quad(np.stack([w - pts[:, 0], pts[:, 1]], axis=1))
    img = img.astype(np.float32)
    # light: gain, fall-off across the picture, hard shadow, glare, noise, blur
    img *= rnd.uniform(0.35, 1.25)
    if rnd.random() < 0.6:
        ramp = np.linspace(rnd.uniform(0.5, 1.3), rnd.uniform(0.5, 1.3), w, dtype=np.float32)
        img *= ramp[None, :, None]
    if rnd.random() < 0.3:
        poly = np.int32([[0, rnd.uniform(0.1, 0.9) * h], [w, rnd.uniform(0.1, 0.9) * h],
                         [w, rnd.uniform(0.1, 0.9) * h + 40], [0, rnd.uniform(0.1, 0.9) * h + 40]])
        mask = np.zeros((h, w), np.float32)
        cv2.fillPoly(mask, [poly], 1.0)
        img *= (1 - 0.5 * mask)[:, :, None]
    if rnd.random() < 0.4:
        cx, cy, r = rnd.uniform(0.1, 0.9) * w, rnd.uniform(0.1, 0.9) * h, rnd.uniform(0.1, 0.35) * w
        yy, xx = np.mgrid[0:h, 0:w]
        a = np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, 1) ** 2 * rnd.uniform(0.4, 0.95)
        img = img * (1 - a[:, :, None]) + 255 * a[:, :, None]
    img += np.random.default_rng(rnd.randrange(1 << 30)).normal(0, rnd.uniform(1, 9), img.shape)
    if rnd.random() < 0.25:
        img = cv2.GaussianBlur(img, (0, 0), rnd.uniform(0.6, 1.8))
    hsv = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)   # colour
    hsv[..., 0] = (hsv[..., 0] + rnd.uniform(-12, 12)) % 180
    hsv[..., 1] *= rnd.uniform(0.6, 1.4)
    img = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB)
    return img, (pts / np.array([w, h], np.float32)) if present else np.zeros((4, 2), np.float32)


def sample(item, train, seed):
    path, present, quad = item
    img = read(path)
    if train:
        img, quad = augment(img, quad, present, random.Random(seed))
    img = cv2.resize(img, (SIZE, SIZE), interpolation=cv2.INTER_AREA)
    x = img.astype(np.float32) / 127.5 - 1.0
    y = np.concatenate([quad.reshape(-1), [1.0 if present else 0.0]]).astype(np.float32)
    return x, y


def dataset(items, train, batch):
    def gen():
        epoch = 0
        while True:
            order = list(range(len(items)))
            if train:
                random.Random(epoch).shuffle(order)
            for k, i in enumerate(order):
                yield sample(items[i], train, epoch * 100003 + k)
            epoch += 1
            if not train:
                return
    ds = tf.data.Dataset.from_generator(
        gen, output_signature=(tf.TensorSpec((SIZE, SIZE, 3), tf.float32), tf.TensorSpec((9,), tf.float32)))
    return ds.batch(batch).prefetch(AUTOTUNE)


# ─── model ──────────────────────────────────────────────────────────────────────────────────────
def build():
    base = tf.keras.applications.MobileNetV2(input_shape=(SIZE, SIZE, 3), alpha=0.5, include_top=False,
                                             weights="imagenet", pooling="avg")
    x = tf.keras.layers.Dropout(0.2)(base.output)
    corners = tf.keras.layers.Dense(8, activation="sigmoid")(x)
    corners = tf.keras.layers.Rescaling(1.2, offset=-0.1)(corners)            # a corner may sit just outside
    present = tf.keras.layers.Dense(1, activation="sigmoid")(x)
    return tf.keras.Model(base.input, tf.keras.layers.Concatenate(name="out")([corners, present])), base


def loss(y_true, y_pred):
    flag = y_true[:, 8:9]
    coords = tf.keras.losses.huber(y_true[:, :8], y_pred[:, :8], delta=0.05)   # corners only where a board is
    present = tf.keras.losses.binary_crossentropy(flag, y_pred[:, 8:9])
    return tf.reduce_mean(coords * flag[:, 0] * 20.0 + present)


def quad_iou(a, b):
    a = np.float32(a).reshape(4, 2) * 1000
    b = np.float32(b).reshape(4, 2) * 1000
    inter, _ = cv2.intersectConvexConvex(a, b)
    ua = cv2.contourArea(a) + cv2.contourArea(b) - inter
    return inter / ua if ua > 0 else 0.0


def evaluate(model, items):
    ok = fp = boards = empties = 0
    for path, present, quad in items:
        x, _ = sample((path, present, quad), False, 0)
        out = model.predict(x[None], verbose=0)[0]
        seen = out[8] >= 0.5
        if present:
            boards += 1
            ok += int(seen and quad_iou(out[:8], quad) >= 0.9)
        else:
            empties += 1
            fp += int(seen)
    print(f"held-out photos with a board: {boards}   IoU >= 0.90: {ok} = {100 * ok / max(1, boards):.1f} %")
    print(f"held-out photos without a board: {empties}   false boards: {fp}")


# ─── main ───────────────────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--evaluate", action="store_true", help="only measure best.keras on the held-out split")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    train_items, val_items = split(load_items(args.dataset), args.seed)
    print(f"{len(train_items)} training photos, {len(val_items)} held out")

    if args.evaluate:
        evaluate(tf.keras.models.load_model(out / "best.keras", compile=False), val_items)
        return

    model, base = build()
    steps = max(1, math.ceil(len(train_items) / args.batch))
    ckpt = tf.keras.callbacks.ModelCheckpoint(out / "best.keras", monitor="val_loss", save_best_only=True)
    for phase, (lr, trainable, epochs) in enumerate([(1e-3, False, 5), (1e-4, True, args.epochs)]):
        base.trainable = trainable
        if trainable:                              # fine-tune only the top of the backbone
            for layer in base.layers[:-40]:
                layer.trainable = False
        model.compile(optimizer=tf.keras.optimizers.Adam(lr), loss=loss)
        model.fit(dataset(train_items, True, args.batch), steps_per_epoch=steps, epochs=epochs,
                  validation_data=dataset(val_items, False, args.batch), callbacks=[ckpt, tf.keras.callbacks.EarlyStopping(patience=8, restore_best_weights=True)] if phase else [ckpt])
    if hasattr(model, "export"):                  # Keras 3
        model.export(str(out / "saved_model"))
    else:
        model.save(out / "saved_model", save_format="tf")
    evaluate(model, val_items)
    print("Convert for the browser:")
    print(f"  tensorflowjs_converter --input_format=tf_saved_model --output_format=tfjs_graph_model "
          f"--quantize_float16=* {out / 'saved_model'} {out / 'tfjs'}")
    print("then copy the tfjs folder to pwa/models/board-corners/")


if __name__ == "__main__":
    main()
