"""Pre-compute face boxes and person masks for avatar source clips.

Usage: python3 prep_avatar.py <models_dir> <clip.mp4> [<clip.mp4> ...]
Writes <clip>.track.npz next to each clip: boxes (N,4 x,y,w,h in px, smoothed) and masks (N,256,256 uint8).
"""
import sys
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

models = sys.argv[1]
face = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(
    base_options=BaseOptions(model_asset_path=f"{models}/blaze_face_short_range.tflite"),
    min_detection_confidence=0.4))
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=f"{models}/selfie_multiclass_256x256.tflite"),
    output_confidence_masks=True))

for path in sys.argv[2:]:
    cap = cv2.VideoCapture(path)
    boxes, masks = [], []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)
        im = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        dets = face.detect(im).detections
        if dets:
            b = max(dets, key=lambda d: d.bounding_box.width).bounding_box
            boxes.append([b.origin_x, b.origin_y, b.width, b.height])
        else:
            boxes.append([np.nan] * 4)
        bg = seg.segment(im).confidence_masks[0].numpy_view()
        person = np.clip(1.0 - bg, 0, 1)
        masks.append((cv2.resize(person, (256, 256)) * 255).astype(np.uint8))
    b = np.array(boxes, dtype=np.float32)
    idx = np.arange(len(b))
    for c in range(4):  # fill gaps, then smooth over time to avoid mosaic jitter
        good = ~np.isnan(b[:, c])
        b[:, c] = np.interp(idx, idx[good], b[good, c])
        b[:, c] = cv2.GaussianBlur(b[:, c].reshape(-1, 1), (1, 9), 2.0).ravel()
    np.savez_compressed(path + ".track.npz", boxes=b, masks=np.array(masks))
    print(path, len(b), "frames, face found in", int(np.sum(~np.isnan(np.array(boxes)[:, 0]))))
